#!/usr/bin/env python3
"""Run fixed local verification actions in a bubblewrap network namespace."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import pwd
import re
import shutil
import signal
import socket
import stat
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent.parent
REPORT_ROOT = ROOT / "test-results" / "agentic-p0"
FIREBASE_CONFIG = ROOT / "firebase.workspace-emulator.json"
BWRAP = Path("/usr/bin/bwrap")
DEMO_PROJECT = "demo-taco-workspace"
AUTH_HOST = "127.0.0.1:9309"
FIRESTORE_HOST = "127.0.0.1:8290"
GROUPS = ("unit", "analysis", "authority", "packet", "exports", "dashboard", "journey", "all")
VERIFY_GATES = ("design", "types", "release-safety", "assistant", "admin", "email", "observability", "cve", "build")
DEFAULT_TIMEOUT = 900
MAX_TIMEOUT = 3600
OUTPUT_DRAIN_SECONDS = 2


class SandboxError(Exception):
    pass


def resolve_firebase_cli() -> tuple[Path, Path]:
    found = shutil.which("firebase", path=os.environ.get("PATH"))
    if not found:
        raise SandboxError("Firebase CLI was not found on PATH")
    cli = Path(found).resolve(strict=True)
    package_root = None
    for parent in cli.parents:
        package_file = parent / "package.json"
        if package_file.is_file():
            try:
                package_name = json.loads(package_file.read_text(encoding="utf-8")).get("name")
            except (OSError, json.JSONDecodeError):
                continue
            if package_name == "firebase-tools":
                package_root = parent
                break
    if package_root is None:
        raise SandboxError("Resolved Firebase CLI is not inside an installed firebase-tools package")
    try:
        emulator_info = json.loads((package_root / "lib/emulator/downloadableEmulatorInfo.json").read_text(encoding="utf-8"))
        relative_name = emulator_info["firestore"]["downloadPathRelativeToCacheDir"]
    except (OSError, KeyError, json.JSONDecodeError, TypeError) as exc:
        raise SandboxError("Cannot read the installed Firebase CLI's Firestore emulator cache filename") from exc
    if (not isinstance(relative_name, str)
            or Path(relative_name).is_absolute()
            or ".." in Path(relative_name).parts
            or not re.fullmatch(r"cloud-firestore-emulator-v[0-9.]+\.jar", Path(relative_name).name)):
        raise SandboxError("Installed Firebase CLI reported an unsafe Firestore emulator cache filename")
    user_home = Path(pwd.getpwuid(os.getuid()).pw_dir)
    jar = user_home / ".cache/firebase/emulators" / relative_name
    if not jar.is_file():
        raise SandboxError(f"Cached Firestore emulator JAR required by this Firebase CLI is missing: {jar.name}")
    return cli, jar


def project_env_names() -> list[Path]:
    """Enumerate root .env* names only; never inspect their contents."""
    try:
        return sorted((entry for entry in ROOT.iterdir() if entry.name.startswith(".env")), key=lambda p: p.name)
    except OSError as exc:
        raise SandboxError(f"Cannot enumerate project environment filenames: {exc}") from exc


def validate_public_build_env(path: Path) -> None:
    """Allow only public build keys and one strict non-secret boolean assertion."""
    allowed_exception = "FIREBASE_MFA_PROJECT_ENABLED"
    try:
        if not stat.S_ISREG(path.lstat().st_mode):
            raise SandboxError(".env.production must be a regular file")
        lines = path.read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeError) as exc:
        raise SandboxError("Cannot validate .env.production key names") from exc

    seen: set[str] = set()
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if "=" not in stripped:
            raise SandboxError(".env.production contains an unparseable line")
        name, value = stripped.split("=", 1)
        name = name.strip()
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name) or name in seen:
            raise SandboxError(".env.production contains an invalid or duplicate key")
        seen.add(name)
        if name.startswith("NEXT_PUBLIC_"):
            continue
        if name == allowed_exception:
            normalized = value.strip()
            if len(normalized) >= 2 and normalized[0] == normalized[-1] and normalized[0] in "\"'":
                normalized = normalized[1:-1]
            if normalized in ("true", "false"):
                continue
        raise SandboxError(".env.production contains a key outside the approved public build allowlist")


def validate_maskable_env_paths(paths: list[Path]) -> None:
    for path in paths:
        try:
            mode = path.lstat().st_mode
        except OSError as exc:
            raise SandboxError(f"Cannot inspect project environment path {path.name}: {exc}") from exc
        if stat.S_ISLNK(mode):
            raise SandboxError(f"Refusing to sandbox symlinked project environment path: {path.name}")
        if not (stat.S_ISREG(mode) or stat.S_ISDIR(mode)):
            raise SandboxError(f"Refusing unsupported project environment path type: {path.name}")


def ensure_report_root() -> Path:
    root = ROOT.resolve(strict=True)
    if REPORT_ROOT == root or root not in REPORT_ROOT.parents:
        raise SandboxError("Report root resolves outside the clone")
    current = root
    for part in REPORT_ROOT.relative_to(root).parts:
        current = current / part
        if current.exists() or current.is_symlink():
            if current.is_symlink() or not current.is_dir():
                raise SandboxError("Report root cannot traverse a symlink or non-directory")
        else:
            current.mkdir()
    resolved = current.resolve(strict=True)
    if resolved != root and root not in resolved.parents:
        raise SandboxError("Report root resolves outside the clone")
    return resolved


def write_report(action: str, report: dict[str, Any]) -> Path:
    root = ensure_report_root()
    name = f"sandbox-{action}-{dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')}-{os.getpid()}.json"
    destination = root / name
    if destination.is_symlink():
        raise SandboxError("Refusing to overwrite a symlinked report artifact")
    data = (json.dumps(report, indent=2, sort_keys=True) + "\n").encode("utf-8")
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    fd = os.open(destination, flags, 0o600)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(data)
    except Exception:
        try:
            destination.unlink()
        except OSError:
            pass
        raise
    return destination


def build_child_env(action: str, hidden_env_paths: list[Path], timeout: int) -> dict[str, str]:
    """Return a fresh allowlist; the caller's environment is never modified."""
    del action, hidden_env_paths, timeout
    env = {
        "PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin"),
        "HOME": "/tmp/agentic-home",
        "XDG_CONFIG_HOME": "/tmp/agentic-home/.config",
        "TMPDIR": "/tmp",
        "TMP": "/tmp",
        "TEMP": "/tmp",
        "CI": "1",
        "NODE_ENV": "test",
        "NO_COLOR": "1",
        "PYTHONDONTWRITEBYTECODE": "1",
        "GCLOUD_PROJECT": DEMO_PROJECT,
        "GOOGLE_CLOUD_PROJECT": DEMO_PROJECT,
        "FIREBASE_CONFIG": json.dumps({"projectId": DEMO_PROJECT}, separators=(",", ":")),
    }
    java_home = os.environ.get("JAVA_HOME")
    if java_home:
        env["JAVA_HOME"] = java_home
    return env


def add_mask_mounts(args: list[str], paths: list[Path]) -> None:
    for path in paths:
        mode = path.lstat().st_mode
        if stat.S_ISDIR(mode):
            args.extend(["--tmpfs", str(path)])
        else:
            args.extend(["--ro-bind", "/dev/null", str(path)])


def env_path_policy(paths: list[Path]) -> tuple[list[Path], list[Path]]:
    validate_maskable_env_paths(paths)
    preserved: list[Path] = []
    masked: list[Path] = []
    for path in paths:
        if path.name == ".env.production":
            validate_public_build_env(path)
            preserved.append(path)
        elif path.name == ".env.example" and path.is_file():
            # Tracked documentation, not a dotenv runtime filename. Existing
            # safety tests inspect its real declarations; keep it read-only.
            preserved.append(path)
        else:
            masked.append(path)
    return masked, preserved


def bwrap_prefix(action: str, hidden_env_paths: list[Path], preserved_env_paths: list[Path], timeout: int,
                 extra_env: dict[str, str] | None = None) -> list[str]:
    if not BWRAP.is_file() or not os.access(BWRAP, os.X_OK):
        raise SandboxError(f"bubblewrap is unavailable at {BWRAP}")
    validate_maskable_env_paths(hidden_env_paths)
    user_home = Path(pwd.getpwuid(os.getuid()).pw_dir)

    args = [
        str(BWRAP), "--die-with-parent", "--unshare-net", "--unshare-pid",
        "--ro-bind", "/", "/",
        "--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp",
        "--bind", str(ROOT), str(ROOT),
        "--chdir", str(ROOT),
        "--dir", "/tmp/agentic-home",
        "--dir", "/tmp/agentic-home/.cache",
        "--dir", "/tmp/agentic-home/.cache/firebase",
        "--dir", "/tmp/agentic-home/.cache/firebase/emulators",
    ]

    # Bind the known emulator JAR before hiding the host cache directory.
    if action == "rules":
        _, firestore_jar = resolve_firebase_cli()
        guest_jar = f"/tmp/agentic-home/.cache/firebase/emulators/{firestore_jar.name}"
        args.extend(["--ro-bind", str(firestore_jar), guest_jar])

    # Hide host credential/config caches while keeping executable runtimes such
    # as ~/.npm-global and ~/google-cloud-sdk visible through the read-only root.
    for dirname in (".config", ".codex", ".cache", ".aws", ".ssh", ".firebase", ".npm"):
        host_dir = user_home / dirname
        if host_dir.is_dir():
            args.extend(["--tmpfs", str(host_dir)])
    npmrc = user_home / ".npmrc"
    if npmrc.exists() or npmrc.is_symlink():
        if npmrc.is_symlink() or not npmrc.is_file():
            raise SandboxError("Refusing unsupported ~/.npmrc path type")
        args.extend(["--ro-bind", "/dev/null", str(npmrc)])

    add_mask_mounts(args, hidden_env_paths)
    for path in preserved_env_paths:
        args.extend(["--ro-bind", str(path), str(path)])

    env = build_child_env(action, hidden_env_paths, timeout)
    if extra_env:
        env.update(extra_env)
    args.append("--clearenv")
    for name, value in env.items():
        args.extend(["--setenv", name, value])
    if action == "rules":
        args.extend(["--setenv", "FIRESTORE_EMULATOR_HOST", FIRESTORE_HOST])
        args.extend(["--setenv", "FIREBASE_AUTH_EMULATOR_HOST", AUTH_HOST])
    return args


def command_for(action: str, args: argparse.Namespace) -> list[str]:
    if action == "baseline":
        command = ["node", "scripts/agentic-baseline.js", f"--group={args.group}"]
        if args.json:
            command.extend(["--json", args.json])
        return command
    if action == "rules":
        firebase_cli, _ = resolve_firebase_cli()
        if not os.access(firebase_cli, os.X_OK):
            raise SandboxError("Resolved Firebase CLI is not executable")
        if not FIREBASE_CONFIG.is_file():
            raise SandboxError("firebase.workspace-emulator.json is missing")
        fixed_test_command = "node --test scripts/workspace-firestore-emulator.test.js"
        return [
            str(firebase_cli), "emulators:exec",
            "--config", "firebase.workspace-emulator.json",
            "--only", "auth,firestore",
            "--project", DEMO_PROJECT,
            "--non-interactive",
            fixed_test_command,
        ]
    if action == "verify":
        if args.only:
            return ["node", "scripts/verify.js", f"--only={args.only}", "--json"]
        return ["node", "scripts/verify.js", "--all", "--json"]
    if action == "seo":
        return ["node", "scripts/seo-audit.js", "--ci"]
    if action == "self-check":
        return [sys.executable, "-c", SELF_CHECK_CODE]
    raise SandboxError(f"Unknown action: {action}")


SELF_CHECK_CODE = r"""
import json, os, socket, stat, threading

# The network namespace must differ from the host process namespace.
host_inode = int(os.environ['AGENTIC_HOST_NETNS_INODE'])
guest_inode = os.stat('/proc/self/ns/net').st_ino
if guest_inode == host_inode:
    raise SystemExit('bubblewrap did not create a distinct network namespace')
host_pid_inode = int(os.environ['AGENTIC_HOST_PIDNS_INODE'])
guest_pid_inode = os.stat('/proc/self/ns/pid').st_ino
if guest_pid_inode == host_pid_inode:
    raise SystemExit('bubblewrap did not create a distinct PID namespace')

# A local server/client exchange proves loopback remains available.
server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
server.settimeout(3)
server.bind(('127.0.0.1', 0))
server.listen(1)
port = server.getsockname()[1]
received = []
def accept_one():
    conn, _ = server.accept()
    with conn:
        received.append(conn.recv(64))
        conn.sendall(b'loopback-ok')
thread = threading.Thread(target=accept_one, daemon=True)
thread.start()
with socket.create_connection(('127.0.0.1', port), timeout=3) as client:
    client.sendall(b'fixture')
    answer = client.recv(64)
thread.join(3)
server.close()
if answer != b'loopback-ok' or received != [b'fixture']:
    raise SystemExit('loopback request did not complete')

# This is a connect-only probe to a documentation-reserved external IP. No
# application payload is sent, and no actual external service is contacted.
remote = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
remote.settimeout(2)
try:
    remote.connect(('203.0.113.1', 443))
except OSError:
    external_blocked = True
else:
    external_blocked = False
finally:
    remote.close()
if not external_blocked:
    raise SystemExit('external network connect unexpectedly succeeded')

# .env.local is mounted as /dev/null when present; if absent, it stays absent.
env_path = os.environ['AGENTIC_SELF_CHECK_ENV_PATH']
if os.path.lexists(env_path):
    info = os.stat(env_path)
    null_info = os.stat('/dev/null')
    if not stat.S_ISCHR(info.st_mode) or info.st_rdev != null_info.st_rdev:
        raise SystemExit('.env.local was not masked by /dev/null')
    try:
        with open(env_path, 'rb') as stream:
            if stream.read(1):
                raise SystemExit('.env.local exposed content in the sandbox')
    except PermissionError:
        # A masked device can be unreadable under the host's device policy;
        # the important invariant is that the original file is not reachable.
        pass
elif os.path.exists(env_path):
    raise SystemExit('.env.local appeared unexpectedly in the sandbox')

print(json.dumps({'networkNamespaceDistinct': True, 'pidNamespaceDistinct': True, 'externalConnectBlocked': True,
                  'loopbackWorks': True, 'envLocalMasked': True}))
"""


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run fixed Taco checks under bubblewrap isolation")
    sub = parser.add_subparsers(dest="action", required=True)

    baseline = sub.add_parser("baseline", help="run a fixed local node:test group")
    baseline.add_argument("--group", required=True, choices=GROUPS)
    baseline.add_argument("--json", help="runner JSON filename under test-results/agentic-p0")
    baseline.add_argument("--timeout-seconds", type=int, default=DEFAULT_TIMEOUT)

    rules = sub.add_parser("rules", help="run the fixed Firestore/Auth emulator rules suite")
    rules.add_argument("--timeout-seconds", type=int, default=DEFAULT_TIMEOUT)

    verify = sub.add_parser("verify", help="run the fixed repository verification gates")
    selection = verify.add_mutually_exclusive_group(required=True)
    selection.add_argument("--all", action="store_true", help="run all fixed verify.js gates")
    selection.add_argument("--only", choices=VERIFY_GATES, help="run one fixed verify.js gate")
    verify.add_argument("--timeout-seconds", type=int, default=DEFAULT_TIMEOUT)

    seo = sub.add_parser("seo", help="run the fixed SEO audit in CI mode (internet remains blocked)")
    seo.add_argument("--timeout-seconds", type=int, default=DEFAULT_TIMEOUT)

    check = sub.add_parser("self-check", help="prove egress isolation, loopback, and env masking")
    check.add_argument("--timeout-seconds", type=int, default=30)

    args = parser.parse_args(argv)
    if not 1 <= args.timeout_seconds <= MAX_TIMEOUT:
        parser.error(f"--timeout-seconds must be between 1 and {MAX_TIMEOUT}")
    return args


def terminate_process_group(process: subprocess.Popen[bytes]) -> None:
    if os.name == "nt":
        # Windows fallback: no process-group kill is available through this
        # stdlib wrapper; kill the direct child and bound pipe draining below.
        try:
            process.kill()
        except OSError:
            pass
        return
    try:
        os.killpg(process.pid, signal.SIGTERM)
    except ProcessLookupError:
        return
    deadline = time.monotonic() + 2
    while time.monotonic() < deadline:
        try:
            os.killpg(process.pid, 0)
        except ProcessLookupError:
            break
        time.sleep(0.05)
    # Always try the group kill after the grace period, even if its leader has
    # exited; descendants may still hold stdout/stderr open or ignore SIGTERM.
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    try:
        process.wait(timeout=1)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=1)


def execute(action: str, args: argparse.Namespace) -> dict[str, Any]:
    hidden_env_paths, preserved_env_paths = env_path_policy(project_env_names())
    extra_env = {}
    if action == "self-check":
        extra_env["AGENTIC_HOST_NETNS_INODE"] = str(os.stat("/proc/self/ns/net").st_ino)
        extra_env["AGENTIC_HOST_PIDNS_INODE"] = str(os.stat("/proc/self/ns/pid").st_ino)
        extra_env["AGENTIC_SELF_CHECK_ENV_PATH"] = str(ROOT / ".env.local")
    bwrap = bwrap_prefix(action, hidden_env_paths, preserved_env_paths, args.timeout_seconds, extra_env)
    command = command_for(action, args)
    full_command = bwrap + command
    # Let bwrap's --clearenv environment define the child. This is also the
    # environment used by the tool payloads; no host credentials are forwarded.
    started = dt.datetime.now(dt.timezone.utc).isoformat()
    process = subprocess.Popen(
        full_command,
        cwd=ROOT,
        env={"PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin")},
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        start_new_session=True,
    )
    timed_out = False
    try:
        stdout, stderr = process.communicate(timeout=args.timeout_seconds)
    except subprocess.TimeoutExpired:
        timed_out = True
        terminate_process_group(process)
        try:
            stdout, stderr = process.communicate(timeout=OUTPUT_DRAIN_SECONDS)
        except subprocess.TimeoutExpired as exc:
            # A detached descendant can escape its group but retain the pipes.
            # Close them and stop waiting after a second bounded drain window.
            if process.stdout:
                process.stdout.close()
            if process.stderr:
                process.stderr.close()
            try:
                process.kill()
            except OSError:
                pass
            try:
                process.wait(timeout=1)
            except subprocess.TimeoutExpired:
                pass
            stdout = exc.output or b""
            stderr = exc.stderr or b""
    except KeyboardInterrupt:
        terminate_process_group(process)
        raise

    code = 124 if timed_out else process.returncode
    return {
        "action": action,
        "startedAt": started,
        "finishedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "timeoutSeconds": args.timeout_seconds,
        "timedOut": timed_out,
        "exitCode": code if code >= 0 else None,
        "signal": -code if code < 0 else None,
        "ok": code == 0,
        "networkNamespace": "unshared",
        "loopback": "available only within child namespace; configured emulators use 127.0.0.1",
        "projectEnvNamesMasked": [path.name for path in hidden_env_paths],
        "projectPublicBuildEnvPreserved": [path.name for path in preserved_env_paths],
        "stdout": stdout.decode("utf-8", errors="replace"),
        "stderr": stderr.decode("utf-8", errors="replace"),
        "_rawCode": code,
    }


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        report = execute(args.action, args)
        report_path = write_report(args.action, {key: value for key, value in report.items() if key != "_rawCode"})
    except KeyboardInterrupt:
        print("Interrupted; sandbox process group was terminated.", file=sys.stderr)
        return 130
    except (OSError, SandboxError, subprocess.SubprocessError) as exc:
        print(f"agentic-sandbox: {exc}", file=sys.stderr)
        return 2

    if report["stdout"]:
        sys.stdout.write(report["stdout"])
    if report["stderr"]:
        sys.stderr.write(report["stderr"])
    print(f"sandbox result: {report['exitCode'] if report['signal'] is None else 'signal ' + str(report['signal'])}; artifact: {report_path.relative_to(ROOT)}")

    raw_code = report["_rawCode"]
    if raw_code < 0:
        os.kill(os.getpid(), -raw_code)
    return raw_code


if __name__ == "__main__":
    raise SystemExit(main())
