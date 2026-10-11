# Git Recovery Runbook

**Repository:** `https://github.com/v7n7v/talentconsulting-io.git`
**Damaged clone:** `C:\Users\super\OneDrive\Documents\Personal-Projects-20260712T175917Z-2-001\Personal-Projects\Talent Consulting 050926 - Codex`
**Target:** `C:\dev\talent-consulting` — outside OneDrive, deliberately
**Prepared:** 25 July 2026

---

## 1. What is wrong

`.git/objects/pack/` contains `pack-3b21952154748776d171e0df6104b4c73e7b860c.idx` and `.rev`, but **the matching `.pack` file is gone.** 272 objects are unreadable.

Confirmed symptoms:

```
$ git diff --shortstat
fatal: unable to read ef313f48e673bf2676511600dbbfeeb5e5abe978

$ git bundle create out.bundle codex/audit-automation-recovery
error: pack-objects died

$ git archive f3edee4 | tar -t | wc -l
0
```

`git log` also truncates: `git rev-list --count HEAD` reports 96 commits, `git log --oneline` emits 85 lines.

**Most likely cause:** the repository lives inside a OneDrive-synced folder. OneDrive is not safe for `.git` — it syncs individual files without understanding that a pack and its index must move together, and it can hydrate, defer or drop large binaries. The missing `.pack` was the single largest file in `.git/objects/`.

A stale zero-byte `.git/index.lock` (dated 24 July 23:20) is also present and will block commits until removed.

---

## 2. What survives, and what does not

### Survives

- **The entire working tree.** All 157k lines of current source are ordinary files on disk and were never at risk.
- **Commit history through `6bfd9a6`** — it is on GitHub as `origin/main`. `codex/admin-command-grid`, `main` and `origin/main` all point at the same commit.
- **Backups taken 25 July 2026, integrity-verified:**
  - `_backup/src.tar.gz` — 1,181 files (`app`, `lib`, `components`, `hooks`, `types`, `scripts`, `docs`, `emails`, `security`, `deploy`, `prototypes`, `supabase`)
  - `_backup/root-config.tar.gz` — 315 files (root config, `.agent`, `.github`)
  - `_backup/public.tar.gz` — 16MB of static assets

### Does **not** survive

Three refs exist only in this clone, are not on the remote, and their trees are inside the missing pack. They cannot be extracted — bundle, `format-patch` and `archive` were all attempted and all failed:

| Ref | Commit | Date | Subject |
| --- | --- | --- | --- |
| `codex/audit-automation-recovery` | `f3edee4` | 2026-06-23 | chore: recover deterministic audit automation |
| `codex/release-safe-cleanup` | `771225d` | 2026-05-19 | Prepare release-safe billing and resume cleanup |
| `stash@{0}` | `73cd213` | 2026-07-05 | codex-ui-restore-backup-2026-07-05 |
| `stash@{1}` | `f899b2c` | — | flashcards-and-market-oracle-real-jobs |

**One thing to try before accepting the loss:** OneDrive keeps version history and a recycle bin. Check
`OneDrive → Recycle bin`, and the *second-stage* recycle bin, for a file named `pack-3b21952154748776d171e0df6104b4c73e7b860c.pack`. If you can restore it into `.git/objects/pack/`, the full history and all four refs come back intact and you can skip the fresh clone entirely. **Do this check before step 3** — it costs two minutes and is the only path that recovers those refs.

Practically, though: the two branches are from May and June, the working tree has moved far past both, and their subjects suggest cleanup work that has since been superseded.

---

## 3. Procedure

### Step 0 — before you start

- [ ] Close VS Code, any terminal sitting in the project, and any running `npm run dev`
- [ ] Pause OneDrive sync (system tray → OneDrive → Pause syncing)
- [ ] Confirm you can reach the private repo: `git ls-remote https://github.com/v7n7v/talentconsulting-io.git`
- [ ] Check the OneDrive recycle bin for the missing `.pack` (see above)

### Step 1 — run the migration script

`recover-repo.ps1` (delivered alongside this runbook) does the mechanical work: clone, copy the working tree, copy the gitignored secrets, verify. Run it from PowerShell:

```powershell
cd C:\Users\super\Downloads      # wherever you saved it
.\recover-repo.ps1
```

It is **non-destructive** — it does not modify or delete the OneDrive folder. Add `-WhatIf` to preview.

### Step 2 — verify before committing

In `C:\dev\talent-consulting`:

```powershell
git status --short | Measure-Object -Line   # should report ~900 entries, no fatal
git diff --shortstat                        # MUST succeed — this is the proof of repair
git log --oneline | Measure-Object -Line    # should now equal `git rev-list --count HEAD`
git fsck --no-progress                      # should report no missing objects
```

If `git diff --shortstat` still errors, stop and re-check that the clone completed.

### Step 3 — commit in batches

```powershell
.\commit-batches.ps1 -DryRun    # review what lands in each commit
.\commit-batches.ps1            # then for real
```

### Step 4 — push

```powershell
git push -u origin codex/admin-command-grid
```

### Step 5 — retire the old folder

Only after step 4 succeeds and you have confirmed the branch on GitHub:

```powershell
Rename-Item "C:\Users\super\OneDrive\...\Talent Consulting 050926 - Codex" `
            "Talent Consulting 050926 - Codex.RETIRED"
```

Keep it for a week, then delete. Re-enable OneDrive sync.

---

## 3a. These scripts were tested before you run them

Both scripts were executed end-to-end against a simulated repository built to reproduce this exact failure: a bare remote, a clone whose `.pack` was deleted after HEAD's objects were written loose, a dirty tree spanning every batch, gitignored secrets, and build noise.

Verified results:

| Check | Result |
| --- | --- |
| Clone, branch checkout, HEAD match | pass |
| `git diff` restored | pass |
| `git fsck` | 0 missing/broken objects |
| Working-tree copy fidelity | 50/50 files, none missing |
| Build noise excluded | `node_modules`, `.next`, `_backup`, `test-results`, `*.tsbuildinfo` — all excluded |
| Secrets copied byte-identical | 5/5 |
| Secrets committed | **0** |
| Batched commits | 13 (12 batches + sweep) |
| Unmatched files | caught by the sweep commit, none lost |
| Working tree after batching | clean |
| Push to remote | pass |

Guard paths were tested too: non-empty target, unreachable remote, and running `commit-batches.ps1` against a still-damaged repo all fail closed with a clear message.

**One real bug was found and fixed this way.** `.env.production` is **tracked by design** — it holds only `NEXT_PUBLIC_*` values (public Firebase config, Stripe publishable key) that are compiled into the client bundle, and the Docker build reads it for build-time SSG (commit `959fb69`). The first version of `commit-batches.ps1` treated it as a secret, which would have **aborted the script at preflight** before committing anything. It is now correctly classified: the four genuine secrets are refused, `.env.production` is committed with the config batch.

Two caveats on the test:

- `robocopy` is Windows-only, so it was shimmed with a `tar`-based equivalent. The exclusion list and argument construction were exercised; robocopy's own behaviour was not.
- The file-counting step in `recover-repo.ps1` splits paths on `\`, so it under-filters on Linux. On Windows it is correct. This only affects a progress number, not what gets copied.

---

## 4. Commit batches

Twelve commits, ordered so each is independently reviewable and roughly matches the four workstream trackers.

| # | Scope | Paths |
| --- | --- | --- |
| 1 | chore: file mode normalisation | `.agent/**` (mostly 644→755 mode-only churn from the WSL mount) |
| 2 | feat(admin): RBAC and admin accounts | `lib/admin*`, `lib/admin/**`, `app/api/admin/**`, `scripts/admin-*` |
| 3 | feat(admin): Command Grid UI | `app/suite/admin/**`, `components/admin/**` |
| 4 | feat(email): V2 catalog and outbox | `lib/email/**`, `lib/email-*`, `lib/communication*`, `emails/**`, `app/api/email/**`, `app/api/cron/email-outbox/**`, `scripts/*email*`, `scripts/*resend*` |
| 5 | feat(observability): user observability v1 | `lib/observability/**`, `app/api/observability/**`, `app/api/privacy/**`, `scripts/observability-*`, `scripts/analytics-privacy-*` |
| 6 | feat(billing): Stripe checkout hardening | `lib/billing*`, `lib/plan-identity.ts`, `app/api/stripe/**`, `app/api/billing/**`, `scripts/stripe-*`, `scripts/*plan-*`, `scripts/*pricing*` |
| 7 | feat(jobs): Talent Fit v2, ledger, calibration | `lib/job-*`, `lib/recommendation-*`, `lib/career-*`, `app/api/jobs/**`, `scripts/job-*`, `scripts/recommendation-*`, `scripts/ever-jobs-*` |
| 8 | feat(resume): truth-locked studio and templates | `lib/resume-*`, `lib/resume-templates/**`, `components/resume-studio/**`, `components/resume-templates/**`, `app/api/resume/**`, `scripts/resume-*` |
| 9 | feat(assistant): Sona/Taco and AI provider routing | `lib/ai/**`, `lib/sona*`, `lib/assistant/**`, `app/api/agent/**`, `app/api/ai/**`, `scripts/sona-*` |
| 10 | feat(auth): account lifecycle and recovery | `lib/auth-*`, `lib/account-action-tokens.ts`, `app/api/auth/**`, `app/api/account/**`, `scripts/*auth*` |
| 11 | feat(ui): suite pages, mobile, components | `app/suite/**`, `app/tools/**`, `components/**`, `hooks/**`, `types/**`, remaining `app/**` |
| 12 | docs + config | `*.md`, `docs/**`, `firestore.*`, `firebase.json`, `next.config.js`, `package.json`, `tsconfig.json`, `tailwind.config.ts` |

Anything unmatched lands in a thirteenth `chore: remaining working tree` commit rather than being silently dropped.

---

## 5. Secrets — handle manually

Four files are gitignored, absent from GitHub, and **irreplaceable**. `recover-repo.ps1` copies them explicitly:

| File | Size | Status |
| --- | --- | --- |
| `.env` | 2.4 KB | secret — gitignored, never committed |
| `.env.local` | 5.7 KB | secret — gitignored, never committed |
| `.env.cloudrun.yaml` | 5.3 KB | secret — gitignored, never committed |
| `hermes-agent-keys.txt` | 5.3 KB | secret — gitignored, never committed |
| `.env.production` | 795 B | **tracked by design — not a secret** |

`.env.production` is the exception and it matters. It contains only `NEXT_PUBLIC_*` values — public Firebase config and the Stripe *publishable* key, all of which end up in the client bundle regardless — plus the `FIREBASE_MFA_PROJECT_ENABLED` boolean flag. Its own first line reads *"Public Firebase config (safe to embed)"*. It is **not** gitignored, is already tracked, and the Docker build needs it for build-time SSG. It must stay committed. `commit-batches.ps1` puts it in the config batch and confirms this in preflight output.

Verify all five landed in `C:\dev\talent-consulting` before retiring the old folder. The four secrets are refused by `commit-batches.ps1` unconditionally; if any of them is ever found *tracked*, the script stops and tells you to rotate the credentials rather than just unstage.

> ⚠️ `hermes-agent-keys.txt` is not a dotfile, so it was captured inside `_backup/root-config.tar.gz`, which was delivered to your chat. That archive contains live agent keys. Don't forward it, and rotate those keys if you'd rather not have them sitting in a chat attachment. The `.env*` files are dotfiles and were **not** included in any archive sent to you.

---

## 6. Preventing recurrence

1. **Keep git repositories out of OneDrive, Dropbox and Google Drive.** This is the root cause. Sync clients corrupt `.git` by moving files independently of each other.
2. **Push more often.** 2.5 months and 904 changed files between commits is what turned a recoverable sync glitch into permanent loss of three refs.
3. **Add a periodic integrity check** — `git fsck --no-progress` catches a missing pack within days rather than months.
4. Optional: set `git config --global core.fsmonitor false` on network or sync-backed filesystems.
