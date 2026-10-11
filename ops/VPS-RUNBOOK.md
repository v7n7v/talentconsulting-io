# The VPS — two projects, one box

Hostinger, 16 GB, 100 GB, at `187.77.8.98` (`srv1680197.hstgr.cloud`).

Two projects, two Linux accounts, hard memory ceilings so neither can starve
the other. Read this on the phone, paste into the SSH app.

**Paste tip:** every block below is meant to be copied whole. For multi-line
files use `cat > name <<'EOF'` → paste → `EOF` on its own line. That is one
paste with no cursor work, which `nano` is not.

---

## Step 0 — DONE

`landing/talent-landing` is on GitHub and fully pushed — local HEAD and
`origin/landing/talent-landing` at the same SHA, ahead=0 behind=0. That now
includes the visual direction decisions (`55779cd`) and the `mosh` support
(`7048f95`), both of which were uncommitted on Windows until 28 July.

The surviving Windows stash is published as
`recovered/flashcards-market-oracle`. Nothing of value now lives only on the
Windows machine except the two secret files in Step 5.

---

## Step 1 — the box stays as it is

**No reinstall.** The setup script was rewritten to be safe on a live machine,
because this box was never inventoried and a script that assumes an empty
machine is how you discover what was on it the hard way.

What changed, specifically:

- **It inventories before it writes anything.** OS, memory, disk, accounts,
  running web servers, docker containers, listening sockets.
- **It refuses to steal ports 80 or 443.** If anything that is not Caddy holds
  either one, it prints what it found, changes *nothing*, and exits 2. Override
  with `FORCE=1 bash setup.sh` only once you know what you would be displacing.
- **The firewall is additive.** The old version ran `ufw --force reset`, which
  would have wiped every existing rule. It now only ever *adds* 22/80/443, and
  if ufw was already active it says so and keeps what is there.
- **Node is not silently replaced.** If some other major version is installed,
  it stops and tells you, rather than upgrading underneath whatever depends
  on it.
- Existing users, swap, and any Caddy site file already present are left alone.

The port check reads `/proc/net/tcp` rather than `ss`/`netstat`, because those
are absent on minimal images and their absence would otherwise read as "every
port is free" — a fail-open in the one check meant to prevent damage. If it
cannot determine a port's state at all, it assumes busy and blocks.

---

## Step 2 — bootstrap, run it twice

```bash
ssh root@187.77.8.98
cat > setup.sh <<'EOF'
```

…paste `ops/vps-setup.sh`, then `EOF` on its own line, then:

```bash
bash setup.sh
```

**Pass 1** inventories, installs Node 22, Claude Code, Caddy, swap and the two
accounts, applies the memory ceilings, writes the Caddy site files — then
generates a deploy key and prints it, because it cannot clone a private repo
without one.

Add that key at **https://github.com/v7n7v/talentconsulting-io/settings/keys**, ticking
**Allow write access** so Claude can push from the box.

```bash
bash setup.sh
```

**Pass 2** notices the key now authenticates, clones into `~/talent`, checks
out `landing/talent-landing`, and runs `npm ci`. Every step is idempotent — a
third run changes nothing.

---

## Step 3 — the five manual pieces

The script prints these and stops. Repeated here so they are in one place.

```bash
passwd dev
passwd dev2
```

**Deploy keys — one per project, not one shared.** Revoking one must not
disturb the other:

```bash
su - dev
ssh-keygen -t ed25519 -C "vps-deploy-talent" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
```

Paste that at `github.com/v7n7v/talentconsulting-io` → **Settings** → **Deploy keys** →
**Add deploy key**, ticking **Allow write access** so Claude can push from the
box. Repeat as `dev2` against that project's own repo.

**Password hashes for the preview sites.** Pick the passwords yourself, and do
not paste them into a chat window — not to me, not to anyone:

```bash
caddy hash-password
```

Put each hash into the matching `/etc/caddy/sites/<name>.caddy`, replacing
`REPLACE_WITH_HASH`, then `sudo systemctl reload caddy`.

**DNS.** Nothing needed for project 1 — `srv1680197.hstgr.cloud` already
resolves to the box, which is all Let's Encrypt needs. Project 2 needs its own
hostname: an A record at `187.77.8.98`. `talentconsulting.io` points at
Firebase Hosting (`199.36.158.100`) and is untouched by any of this; a `dev.`
or other subdomain sits alongside it and collides with nothing.

---

## Step 4 — clone project 1

```bash
su - dev
git clone git@github.com:v7n7v/talentconsulting-io.git ~/talent
cd ~/talent
git checkout landing/talent-landing
npm ci
```

`npm ci` rather than `npm install` — it installs exactly the lockfile, which
is the only reason to have one.

---

## Step 5 — the secrets the clone does not carry

Four files are gitignored, correctly, so they are **not** in what you cloned.
**Only two of them belong on this box** — copy those, and deliberately leave
the other two behind:

| file | what it is | onto the box? |
|---|---|---|
| `.env` | server-side config | **yes** — copy |
| `.env.local` | local overrides | **yes** — copy |
| `.env.cloudrun.yaml` | Cloud Run deployment config | **no** — this box does not deploy to Cloud Run |
| `hermes-agent-keys.txt` | agent keys | **no** — rotate first, then copy only if something on the box needs it |

The `scp` block below therefore copies two files, not four. That is deliberate,
not an omission.

`.env.production` **is** tracked and did come across — correctly. Read key by
key, it holds only `NEXT_PUBLIC_*` Firebase config and the Stripe
**publishable** key, all of which ship in the browser bundle anyway.

From Windows:

```powershell
scp .env dev@187.77.8.98:/home/dev/talent/.env
scp .env.local dev@187.77.8.98:/home/dev/talent/.env.local
```

Then on the box:

```bash
chmod 600 ~/talent/.env ~/talent/.env.local
```

### Rotate `hermes-agent-keys.txt` while you are here

It was captured inside a tarball delivered earlier in this project. Gitignoring
it now does not undo that, and you are about to put it on a second machine.
Copying an exposed key to a new host is how one leak becomes two.

The old Supabase item is closed on the repo side: this project runs on
Firestore, there is no `@supabase/*` dependency, no `SUPABASE_*` variable in
any of the five env files, and the only two mentions left are comments in
`lib/firebase.ts` describing the migration. If the hosted project
`qsriqbphmvnnbterqnsv` still exists in your Supabase account, delete it
outright rather than rotating a key for something nothing uses.

---

## Step 6 — run it

```bash
tmux new -s dev
cd ~/talent
npm run dev -- -H 127.0.0.1 -p 3000
```

Detach with **Ctrl-b** then **d**. Reattach from anywhere with
`tmux attach -t dev`.

`-H 127.0.0.1` binds the server to the box's own loopback. Port 3000 is not
open in the firewall and is not reachable from outside — Caddy is the only
thing that can see it.

---

## Step 7 — HTTPS and a password

The site file already exists. Put your hash in it:

```bash
sudo nano /etc/caddy/sites/talent.caddy    # replace REPLACE_WITH_HASH
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy
sudo systemctl status caddy --no-pager
```

`validate` before `reload`, always. A reload with a broken config takes the
site down and tells you why in the journal; validate tells you why while the
site is still up. If it complains about an **unrecognized directive
`basic_auth`**, the installed Caddy is older than 2.8 — the setup script picks
the right spelling automatically, so this only bites if you hand-edit.

Open **https://srv1680197.hstgr.cloud** on the phone. The certificate is
automatic — Caddy fetches one from Let's Encrypt on the first request, which is
why port 80 had to be open.

**This is the gate I could not run for you.** The landing page has passed the
JS-off render, all fourteen viewport and reduced-motion configurations, the
security scan and the design audit — but nobody has yet looked at it in a real
browser on a real phone.

---

## Step 8 — close the door

Only after key login has worked from the phone at least once.

```bash
sudo nano /etc/ssh/sshd_config
```

```
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
```

```bash
sudo systemctl restart ssh
```

**Keep the current session open** while you test a new one from a second tab.
If key login fails you still have a working shell to undo it in. Hostinger's
browser console is the backstop if it goes wrong anyway. Snapshot after this.

---

## Step 9 — working with Claude on the box

```bash
tmux new -s claude
cd ~/talent
claude
```

First run sends you to a browser to authenticate. After that it is the same
conversation you are used to, except it is *on the box*: it can run
`npm run dev`, `npm run build`, `git push` and
`node scripts/design-audit.js --ci` itself and see the results. None of that
works from where I am now.

Claude Code is installed system-wide but authenticates per account, so `dev`
and `dev2` are separate sessions that cannot see each other's work.

Two tmux windows is the comfortable shape on a phone — Claude in one, the dev
server in the other:

- **Ctrl-b c** — new window
- **Ctrl-b n** / **Ctrl-b p** — next / previous
- **Ctrl-b d** — detach

### Connect with `mosh`, not `ssh`, from the phone

```bash
mosh dev@187.77.8.98
```

Plain ssh over cellular drops every time the handset sleeps, switches tower or
moves between wifi and mobile data — and it drops *mid-keystroke*, which on a
phone means losing whatever you were part-way through typing. mosh survives all
three: it keeps the session across an IP change and redraws locally, so typing
stays responsive on a slow link instead of echoing a character at a time.

It is not a second way in. mosh authenticates over ssh on port 22 first and
only then hands off to its own UDP port, so closing the door in Step 8 secures
mosh at the same time. The setup script installs it and opens UDP 60000-61000.

Termius and Blink both speak mosh. Blink is the better phone client — it treats
mosh as the default rather than an add-on.

---

## Step 10 — handing the work over to the session on the box

A new Claude session inherits **files, not conversation**. Everything below is
either not in git, or is in git but easy to misread without the reason. Read
this section first from the box; it is the whole handover.

### Objective

Move day-to-day work off the Windows machine and onto this box, so that
`npm run dev`, `npm run build`, `git push` and `node scripts/design-audit.js`
all run where Claude can see their output. The Windows copy stays as a safety
net until the first successful push *from here*.

### First action, specifically

```bash
mkdir -p ~/talent/.claude/skills
cp -r ~/talent/docs/claude-skills/* ~/talent/.claude/skills/
ls ~/talent/.claude/skills
```

**Do this before anything else.** `/.claude` is gitignored on purpose —
`docs/claude-skills/` is the tracked source of truth and `.claude/skills/` is
the install target, so tracking both would let the two copies drift. The
consequence is that a fresh clone has **no active skills** until you run the
copy above. Four should appear: `build-loop`, `plan-handoff`,
`talent-studio-design`, `ui-verify`.

### Verification

```bash
node scripts/verify.js          # types, build, tests, design drift, CVE
node scripts/design-audit.js    # every metric should read "=" against baseline
```

`verify.js` is the single gate — use it instead of remembering the individual
npm scripts. Add `node scripts/ui-verify.js <route>` for anything that renders;
it needs `npm run dev` alive in another tmux window.

Node here is 22, matching `engines` in `package.json`. That is not a
coincidence to preserve casually — the build is pinned to it.

### Do NOT copy the Windows git config

The Windows clone carries four local settings that exist **only** to work
around damage specific to that clone. This box has a clean clone from GitHub
and needs none of them. Copying them would disable real safety mechanisms for
no reason:

| setting | why it exists on Windows | here |
|---|---|---|
| `gc.auto=0`, `gc.autodetach=false` | `stash@{0}` has an unreadable tree, so `git gc` aborts every time | **leave default** — no broken objects here |
| `maintenance.auto=false`, `maintenance.strategy=none` | background maintenance was racing commits and stranding `HEAD.lock` | **leave default** |
| `core.safecrlf=false` | silenced CRLF warnings that PowerShell 5.1 turned into terminating errors | **not applicable** — no PowerShell here |
| `core.autocrlf=true` | Windows checkout convention | **must stay false/input on Linux** |

### What is on the remote that you might not expect

- **`recovered/flashcards-market-oracle`** (`f899b2c`) — a surviving stash from
  the Windows clone, published so it would outlive that machine: ~1,240 new
  lines in `app/suite/flashcards/page.tsx`, plus `market-oracle` changes. It is
  **not** merged anywhere and its base is not an ancestor of `main`. Review it
  on its own terms before assuming it applies.
- **`codex/audit-automation-recovery`** and **`codex/release-safe-cleanup`** —
  both alive on the remote at the exact commits `GIT-RECOVERY-RUNBOOK.md` lists
  as unrecoverable. That runbook is wrong about them. Their local
  remote-tracking refs on Windows read `: gone`; a `git fetch --prune` fixes
  that cosmetic staleness.
- The one genuine loss is **`stash@{0}`**, whose tree is among 16 objects still
  missing. Do not spend time trying to recover it.

### Ground truth that contradicts the older documents

- **`node scripts/design-audit.js` is the authority for drift metrics**, not any
  table in a markdown file. The hand counts that predate it are wrong in both
  directions — most importantly inline cards are **1,212, not 488**.
- **The accent is Cobalt**, changed from Cyan. See `docs/DECISIONS.md`. The
  Cyan entry is bannered as superseded; its stated justification failed
  re-measurement.
- Whichever accent is in play, contrast must be validated **per surface tier,
  not per mode** — the token system defines seven surfaces per mode and no
  single step clears 4.5:1 on all of them.
- `GIT-RECOVERY-RUNBOOK.md` is historical. The repository was repaired in place
  by restoring the missing pack, not by the fresh clone it describes.

### What has not been verified from the Windows side

Stated plainly, because an untested assumption reported as verified is the
expensive kind:

- **Nobody has opened the landing page in a real browser on a real phone.** It
  passed the JS-off render, fourteen viewport and reduced-motion
  configurations, the security scan and the design audit — all headless. Step 7
  is that gate and it is still open.
- `mosh` and the UDP 60000-61000 rule were added to `ops/vps-setup.sh` but have
  **never been executed on this box**. Pass 1 of the bootstrap is their first
  real run.
- No Windows key is authorised on this box. Every step in this runbook was
  written to be pasted by a human from a phone, not driven remotely.

---

## Adding the second project

When you know what it is:

```bash
su - dev2
git clone git@github.com:you/that-repo.git ~/app2
cd ~/app2 && npm ci
tmux new -s dev2
npm run dev -- -H 127.0.0.1 -p 3001
```

Then give it a hostname — an A record at `187.77.8.98` — and fill in
`/etc/caddy/sites/app2.caddy`, which the script left as a commented stub with
the right port already in it. Uncomment, add hostname and hash,
`systemctl reload caddy`.

If it needs its own database, install it once system-wide and give each project
its own DB and user rather than running two servers.

---

## Worth knowing

- **`next build --webpack` is single-threaded and slow.** A couple of minutes
  is normal and not the VPS struggling.
- **Snapshots.** Take one after step 8, and before anything you would describe
  as "let me just try something".
- **The gaming PC stays the safety net** until the first successful push *from*
  the VPS. Do not wipe the Windows working copy before then.
- **`docs/DECISIONS.md` is committed and pushed** (`55779cd`) — the six visual
  direction entries, including the Cyan → Cobalt change. It is no longer a
  Windows-only file.
- **The `mosh` support in `ops/vps-setup.sh` is committed and pushed**
  (`7048f95`). This matters more than it looks: before that commit it existed
  only in the Windows working copy, so pasting the script from a fresh clone
  would have produced a box with no `mosh` and no UDP rule — and the whole
  phone-primary workflow depends on it.
