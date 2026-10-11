#!/usr/bin/env bash
# =============================================================================
# Multi-project VPS bootstrap — Hostinger, 16 GB / 100 GB
#
# SAFE ON A LIVE BOX. This version assumes the machine may already be doing
# something. It inventories first, refuses to break what it finds, and never
# resets a firewall it did not create.
#
# Run as root. Run it TWICE:
#
#   ssh root@187.77.8.98
#   cat > setup.sh <<'EOF'      <- paste, then EOF on its own line, then Enter
#   bash setup.sh               <- pass 1: sets everything up, prints a deploy key
#   ...paste that key into GitHub...
#   bash setup.sh               <- pass 2: sees the key works, clones, npm ci
#
# Everything is idempotent. Running it a third time changes nothing.
# =============================================================================
set -euo pipefail

# ----------------------------------------------------------------- projects
# name : linux user : directory : dev-server port : public hostname : git remote
PROJECTS=(
  "talent:dev:talent:3000:srv1680197.hstgr.cloud:git@github.com:v7n7v/talentconsulting-io.git"
  "app2:dev2:app2:3001::"
)
BRANCH=landing/talent-landing

NODE_MAJOR=22
SWAP_GB=4
MEM_HIGH=6G
MEM_MAX=7G

say()  { printf '\n\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m !! \033[0m%s\n' "$*"; }
ok()   { printf '\033[1;32m ok \033[0m%s\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }
# Is a TCP port being listened on?
#
# This reads /proc/net/tcp FIRST, on purpose. The obvious implementation —
# `ss || netstat | grep` — reports every port as FREE on any image where
# neither tool is installed, which is a fail-OPEN in the one check whose job
# is to stop this script trampling a live service. /proc/net is always there
# and needs no packages. State 0A is LISTEN; the port is uppercase hex.
port_busy() {
  local p="$1" hex
  hex=$(printf '%04X' "$p")
  if [ -r /proc/net/tcp ] || [ -r /proc/net/tcp6 ]; then
    { cat /proc/net/tcp /proc/net/tcp6 2>/dev/null || true; } \
      | awk -v h="$hex" '{split($2,a,":"); if (a[2]==h && $4=="0A") f=1} END{exit !f}'
    return $?
  fi
  if have ss;      then ss -tlnH 2>/dev/null      | grep -q ":$p "; return $?; fi
  if have netstat; then netstat -tln 2>/dev/null  | grep -q ":$p "; return $?; fi
  warn "cannot determine whether port $p is in use — assuming BUSY (fail closed)"
  return 0
}

[ "$(id -u)" -eq 0 ] || { echo "run this as root"; exit 1; }

# =============================================================== 0. PREFLIGHT
# Nothing below this block writes anything. It exists because this box was
# never inventoried, and a setup script that assumes an empty machine is how
# you find out what was on it the hard way.
say "PREFLIGHT — reading the box before touching it"

echo "  os        : $( (. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME") || echo unknown)"
echo "  kernel    : $(uname -r)"
echo "  memory    : $(free -h 2>/dev/null | awk '/^Mem:/{print $2" total, "$7" available"}' || echo unknown)"
echo "  disk /    : $(df -h / 2>/dev/null | awk 'NR==2{print $4" free of "$2}' || echo unknown)"
echo "  uptime    : $(uptime -p 2>/dev/null || echo unknown)"

EXISTING_USERS=$(awk -F: '$3>=1000 && $3<65534 {print $1}' /etc/passwd 2>/dev/null | tr '\n' ' ' || true)
echo "  accounts  : ${EXISTING_USERS:-none}"

WEB_SERVERS=""
for s in nginx apache2 httpd lighttpd caddy; do
  if systemctl is-active --quiet "$s" 2>/dev/null; then WEB_SERVERS="$WEB_SERVERS $s"; fi
done
echo "  web srv   :${WEB_SERVERS:- none running}"

DOCKER_RUNNING="not installed"
if have docker; then
  # installed but stopped is normal; pipefail must not turn that into an abort
  # `|| true` must sit INSIDE the pipeline: with pipefail, a trailing `||`
  # fires even after wc has already printed, and you get both outputs.
  DOCKER_RUNNING=$( { docker ps -q 2>/dev/null || true; } | wc -l )
fi
echo "  docker    : ${DOCKER_RUNNING} container(s) running"

echo "  listening :"
{ ss -tlpnH 2>/dev/null || netstat -tlpn 2>/dev/null || true; } \
  | awk '{print "              "$4"  "$6}' | sort -u | head -15 || true

BLOCKERS=0

# --- port 80/443: Caddy needs both. Taking them from a live service is the
#     single most destructive thing this script could do.
for p in 80 443; do
  if port_busy "$p"; then
    if [ -n "$WEB_SERVERS" ] && echo "$WEB_SERVERS" | grep -qw caddy; then
      ok "port $p held by Caddy — that is us, fine"
    else
      warn "port $p is IN USE by something that is not Caddy."
      warn "    Whatever is serving it would break. Not touching it."
      BLOCKERS=$((BLOCKERS+1))
    fi
  else
    ok "port $p free"
  fi
done

# --- dev-server ports
for spec in "${PROJECTS[@]}"; do
  IFS=: read -r name user dir port host remote <<< "$spec"
  if port_busy "$port"; then
    warn "port $port (wanted by '$name') is in use — pick another in PROJECTS"
    BLOCKERS=$((BLOCKERS+1))
  fi
done

# --- existing firewall we must not clobber
UFW_WAS_ACTIVE=no
if have ufw && ufw status 2>/dev/null | grep -q "Status: active"; then
  UFW_WAS_ACTIVE=yes
  RULE_COUNT=$(ufw status numbered 2>/dev/null | grep -c '^\[' 2>/dev/null || echo 0)
  warn "ufw is ALREADY ACTIVE with ${RULE_COUNT} rule(s) — they will be kept."
  warn "    This script only ADDS 22/80/443. It never resets."
fi

if [ "$BLOCKERS" -gt 0 ]; then
  echo
  warn "$BLOCKERS blocker(s) found. Nothing has been changed."
  warn "Fix the collisions, or edit PROJECTS at the top, then re-run."
  warn "To proceed anyway and let this script win, re-run with:  FORCE=1 bash setup.sh"
  [ "${FORCE:-0}" = "1" ] || exit 2
  warn "FORCE=1 set — continuing despite blockers."
fi
ok "preflight clear — proceeding"

# ------------------------------------------------------------------ 1. base
say "Base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
  curl ca-certificates gnupg git build-essential ufw tmux htop unzip jq \
  debian-keyring debian-archive-keyring apt-transport-https \
  mosh

# ------------------------------------------------------------------ 2. swap
if swapon --show 2>/dev/null | grep -q .; then
  ok "swap already configured, leaving it"
else
  say "Adding ${SWAP_GB}G swap"
  fallocate -l "${SWAP_GB}G" /swapfile
  chmod 600 /swapfile; mkswap -q /swapfile; swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl -qw vm.swappiness=10
  grep -q '^vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf
fi

# ------------------------------------------------------------------ 3. node
if have node && [ "$(node -v | cut -c2- | cut -d. -f1)" = "$NODE_MAJOR" ]; then
  ok "Node $(node -v) already installed"
elif have node; then
  warn "Node $(node -v) is installed but this repo wants ${NODE_MAJOR}.x."
  warn "    Installing ${NODE_MAJOR}.x over it — if something else on this box"
  warn "    depends on the old version, stop now and use nvm instead."
  [ "${FORCE:-0}" = "1" ] || { warn "re-run with FORCE=1 to accept"; exit 2; }
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y -qq nodejs
else
  say "Installing Node ${NODE_MAJOR}.x"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y -qq nodejs
fi
node -v; npm -v

# ---------------------------------------------------------- 4. claude code
if have claude; then ok "Claude Code present"; else
  say "Installing Claude Code system-wide"
  npm install -g @anthropic-ai/claude-code
fi

# --------------------------------------------------------------- 5. accounts
for spec in "${PROJECTS[@]}"; do
  IFS=: read -r name user dir port host remote <<< "$spec"

  if id "$user" >/dev/null 2>&1; then
    ok "user '$user' exists, leaving it alone"
  else
    say "Creating '$user' for project '$name'"
    adduser --disabled-password --gecos "" "$user"
    usermod -aG sudo "$user"
  fi

  # 750, not Ubuntu's 755: otherwise dev2 can read /home/dev/talent/.env
  chmod 750 "/home/$user"
  install -d -m 700 -o "$user" -g "$user" "/home/$user/.ssh"

  if [ -s /root/.ssh/authorized_keys ] && [ ! -s "/home/$user/.ssh/authorized_keys" ]; then
    cp /root/.ssh/authorized_keys "/home/$user/.ssh/authorized_keys"
    chown "$user:$user" "/home/$user/.ssh/authorized_keys"
    chmod 600 "/home/$user/.ssh/authorized_keys"
  fi

  # memory ceiling — catches everything the account runs, tmux included
  uid=$(id -u "$user")
  d="/etc/systemd/system/user-${uid}.slice.d"
  install -d "$d"
  cat > "$d/50-memory.conf" <<EOF
[Slice]
MemoryAccounting=yes
MemoryHigh=${MEM_HIGH}
MemoryMax=${MEM_MAX}
EOF

  bashrc="/home/$user/.bashrc"
  grep -q 'PROJECT_DIR' "$bashrc" 2>/dev/null || cat >> "$bashrc" <<EOF

# --- project ---
export PROJECT_NAME="$name"
export PROJECT_DIR="\$HOME/$dir"
export PORT=$port
cd "\$PROJECT_DIR" 2>/dev/null || true
EOF

  if [ ! -f "/home/$user/.tmux.conf" ]; then
    cat > "/home/$user/.tmux.conf" <<'EOF'
set -g mouse on
set -g history-limit 50000
set -g base-index 1
setw -g mode-keys vi
set -g status-bg colour17
set -g status-fg colour51
set -g status-left '#[bold] #S '
set -g status-right ' %H:%M '
set -sg escape-time 0
EOF
    chown "$user:$user" "/home/$user/.tmux.conf"
  fi

  # deploy key — generated here, pasted into GitHub by you
  if [ -n "$remote" ] && [ ! -f "/home/$user/.ssh/id_ed25519" ]; then
    sudo -u "$user" ssh-keygen -q -t ed25519 -C "vps-$name" \
      -f "/home/$user/.ssh/id_ed25519" -N ""
    say "New deploy key for '$name'"
  fi
done
systemctl daemon-reload

# ----------------------------------------------------------------- 6. caddy
SKIP_WEB=no
if [ "$BLOCKERS" -gt 0 ] && ! echo "$WEB_SERVERS" | grep -qw caddy; then
  warn "Skipping Caddy entirely — ports 80/443 belong to something else."
  SKIP_WEB=yes
fi

if [ "$SKIP_WEB" = "no" ]; then
  if have caddy; then ok "Caddy present"; else
    say "Installing Caddy"
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
      | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
      | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
    apt-get update -qq
    apt-get install -y -qq caddy
  fi

  # `basicauth` was renamed `basic_auth` in v2.8
  CADDY_VER=$(caddy version 2>/dev/null | head -1 | sed 's/^v//' | cut -d' ' -f1)
  CADDY_MINOR=$(echo "${CADDY_VER:-2.0.0}" | cut -d. -f2)
  if [ "${CADDY_MINOR:-0}" -ge 8 ] 2>/dev/null; then AUTH=basic_auth; else AUTH=basicauth; fi
  ok "Caddy ${CADDY_VER:-unknown}, directive '$AUTH'"

  install -d /etc/caddy/sites
  grep -q 'import sites/' /etc/caddy/Caddyfile 2>/dev/null || \
    printf '\n# one file per project\nimport sites/*.caddy\n' >> /etc/caddy/Caddyfile

  for spec in "${PROJECTS[@]}"; do
    IFS=: read -r name user dir port host remote <<< "$spec"
    f="/etc/caddy/sites/${name}.caddy"
    [ -f "$f" ] && { ok "$f exists, not overwriting"; continue; }
    if [ -z "$host" ]; then
      cat > "$f" <<EOF
# '$name' has no hostname yet, so nothing is served for it.
# Add one, uncomment, put in the hash from \`caddy hash-password\`, reload.
#
# HOSTNAME_HERE {
# 	encode zstd gzip
# 	$AUTH { you HASH_HERE }
# 	reverse_proxy 127.0.0.1:$port
# 	@ws { header Connection *Upgrade*
# 	      header Upgrade websocket }
# 	reverse_proxy @ws 127.0.0.1:$port
# }
EOF
    else
      cat > "$f" <<EOF
$host {
	encode zstd gzip

	# Replace with the output of \`caddy hash-password\`.
	# The password itself is never written here.
	$AUTH {
		you REPLACE_WITH_HASH
	}

	reverse_proxy 127.0.0.1:$port

	# next dev drives hot reload over a websocket
	@ws {
		header Connection *Upgrade*
		header Upgrade websocket
	}
	reverse_proxy @ws 127.0.0.1:$port
}
EOF
    fi
    ok "wrote $f"
  done

  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 \
    && ok "Caddy config validates" \
    || warn "Caddy config did not validate — check /etc/caddy/sites/"
fi

# --------------------------------------------------------------- 7. firewall
# ADDITIVE ONLY. Never `ufw reset` on a box whose rules we did not write.
say "Firewall (adding rules, never resetting)"
ufw allow 22/tcp  >/dev/null 2>&1 || true
# mosh — the reason this box is usable from a phone at all. Unlike ssh it
# survives the IP changing, the handset sleeping, and wifi/cellular handoff,
# so a tmux session stays put instead of stranding a half-typed command.
# Each session takes one UDP port from this range; the range is not a login
# path of its own — mosh authenticates over ssh/22 first, then hands off.
ufw allow 60000:61000/udp >/dev/null 2>&1 || true
if [ "$SKIP_WEB" = "no" ]; then
  ufw allow 80/tcp  >/dev/null 2>&1 || true
  ufw allow 443/tcp >/dev/null 2>&1 || true
fi
if [ "$UFW_WAS_ACTIVE" = "yes" ]; then
  ok "ufw was already active — rules added, existing ones untouched"
else
  ufw --force enable >/dev/null 2>&1 || true
  ok "ufw enabled"
fi
ufw status verbose 2>/dev/null | head -12

# Dev ports are never opened. They bind to 127.0.0.1; only Caddy reaches them.

# ================================================== 8. PHASE 2 — clone, if ready
say "Checking whether the deploy keys work yet"
CLONED_ANY=no
for spec in "${PROJECTS[@]}"; do
  IFS=: read -r name user dir port host remote <<< "$spec"
  [ -z "$remote" ] && continue
  target="/home/$user/$dir"

  if [ -d "$target/.git" ]; then
    ok "'$name' already cloned at $target"
    CLONED_ANY=yes
    continue
  fi

  if sudo -u "$user" ssh -o StrictHostKeyChecking=accept-new -o BatchMode=yes \
       -T git@github.com 2>&1 | grep -q "successfully authenticated"; then
    say "Deploy key for '$name' works — cloning"
    sudo -u "$user" git clone -q "$remote" "$target"
    sudo -u "$user" git -C "$target" checkout -q "$BRANCH" 2>/dev/null || \
      warn "branch $BRANCH not found; staying on default"
    say "npm ci for '$name' (a few minutes)"
    sudo -u "$user" bash -lc "cd '$target' && npm ci" || warn "npm ci failed — run it by hand"
    CLONED_ANY=yes
  else
    warn "Deploy key for '$name' is not on GitHub yet."
    echo
    echo "    Add this as a deploy key WITH WRITE ACCESS at:"
    echo "      https://github.com/v7n7v/talentconsulting-io/settings/keys"
    echo
    sed 's/^/      /' "/home/$user/.ssh/id_ed25519.pub"
    echo
    echo "    Then run this same script again — it will clone."
  fi
done

# ------------------------------------------------------------------- done
echo
say "Done. State of the box:"
for spec in "${PROJECTS[@]}"; do
  IFS=: read -r name user dir port host remote <<< "$spec"
  printf '  %-8s user=%-6s dir=~/%-8s port=%-5s host=%-26s cloned=%s\n' \
    "$name" "$user" "$dir" "$port" "${host:-<none>}" \
    "$([ -d "/home/$user/$dir/.git" ] && echo yes || echo no)"
done

cat <<EOF

Still yours to do:

  1. passwd dev  /  passwd dev2         (sudo needs a password)
  2. caddy hash-password                (pick it yourself; never paste it to anyone)
     then put the hash in /etc/caddy/sites/talent.caddy and:
       systemctl reload caddy
  3. If a deploy key was printed above, add it to GitHub and re-run this script.

Once '$(echo "${PROJECTS[0]}" | cut -d: -f1)' shows cloned=yes:

  su - dev
  tmux new -s dev
  npm run dev -- -H 127.0.0.1 -p 3000

  # then, in another tmux window:
  claude

EOF
