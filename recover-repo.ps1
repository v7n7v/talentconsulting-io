<#
.SYNOPSIS
    Migrates the Talent Studio working tree out of a damaged, OneDrive-hosted git clone
    into a fresh clone on local disk.

.DESCRIPTION
    The existing .git is missing its pack file (272 unreadable objects), which breaks
    git diff and history traversal. Commit history through 6bfd9a6 is intact on GitHub,
    so the repair is: clone fresh, lay the current working tree on top, keep the secrets.

    This script is NON-DESTRUCTIVE. It never writes to or deletes the source folder.

.PARAMETER Source
    The damaged clone. Defaults to the known OneDrive path.

.PARAMETER Target
    Where the fresh clone goes. Defaults to C:\dev\talent-consulting.

.PARAMETER Branch
    Branch to check out. Defaults to codex/admin-command-grid.

.PARAMETER WhatIf
    Preview only. Nothing is cloned or copied.

.EXAMPLE
    .\recover-repo.ps1 -WhatIf
    .\recover-repo.ps1
#>

[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$Source = "C:\Users\super\OneDrive\Documents\Personal-Projects-20260712T175917Z-2-001\Personal-Projects\Talent Consulting 050926 - Codex",
    [string]$Target = "C:\dev\talent-consulting",
    [string]$Branch = "codex/admin-command-grid",
    [string]$RepoUrl = "https://github.com/v7n7v/talentconsulting-io.git"
)

$ErrorActionPreference = "Stop"

function Write-Step { param($m) Write-Host "`n=== $m ===" -ForegroundColor Cyan }
function Write-Ok   { param($m) Write-Host "  [ok] $m"   -ForegroundColor Green }
function Write-Warn { param($m) Write-Host "  [!!] $m"   -ForegroundColor Yellow }
function Write-Die  { param($m) Write-Host "  [XX] $m"   -ForegroundColor Red; exit 1 }

# Directories that must NOT be copied: build output, dependencies, the damaged .git,
# our own backups, and sync/tooling caches.
$ExcludeDirs = @(
    ".git", "node_modules", ".next", "_backup", ".firebase",
    "test-results", ".playwright-cli", ".seo-audit", ".security-cve",
    "email-previews", "out", "build", ".vercel"
)

# Files that must NOT be copied: build artefacts and OS noise.
$ExcludeFiles = @(
    "tsconfig.tsbuildinfo", "next-env.d.ts", ".DS_Store",
    "firestore-debug.log", "firebase-debug.log", "*.tsbuildinfo"
)

# Gitignored, not on GitHub, irreplaceable. Copied explicitly after robocopy.
$SecretFiles = @(
    ".env", ".env.local", ".env.production", ".env.cloudrun.yaml", "hermes-agent-keys.txt"
)

# ---------------------------------------------------------------- preflight

Write-Step "Preflight"

if (-not (Test-Path -LiteralPath $Source)) { Write-Die "Source not found: $Source" }
Write-Ok "Source found"

try { $null = & git --version } catch { Write-Die "git is not on PATH" }
Write-Ok "git available"

Write-Host "  checking access to $RepoUrl ..." -NoNewline
$remote = & git ls-remote --heads $RepoUrl 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Die "Cannot reach the repo. Authenticate first (gh auth login, or Git Credential Manager), then re-run.`n       $remote"
}
Write-Host " ok" -ForegroundColor Green

if (Test-Path -LiteralPath $Target) {
    $existing = Get-ChildItem -LiteralPath $Target -Force -ErrorAction SilentlyContinue
    if ($existing) { Write-Die "Target exists and is not empty: $Target`n       Move it aside or pass -Target with a different path." }
}
Write-Ok "Target path is clear"

# Warn if the source still holds a lock file.
$lock = Join-Path $Source ".git\index.lock"
if (Test-Path -LiteralPath $lock) {
    Write-Warn "Stale .git\index.lock present in the source. Harmless for this migration (we never write there)."
}

# Count what we are about to move, for the post-copy check.
Write-Host "  counting source files (this can take a minute on OneDrive) ..." -NoNewline
$srcCount = (Get-ChildItem -LiteralPath $Source -Recurse -File -Force -ErrorAction SilentlyContinue |
    Where-Object {
        $p = $_.FullName.Substring($Source.Length).TrimStart('\')
        $top = ($p -split '\\')[0]
        $ExcludeDirs -notcontains $top
    }).Count
Write-Host " $srcCount files" -ForegroundColor Green

# ---------------------------------------------------------------- clone

Write-Step "Cloning fresh from GitHub"

if ($PSCmdlet.ShouldProcess($Target, "git clone $RepoUrl")) {
    $parent = Split-Path -Parent $Target
    if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }

    & git clone $RepoUrl $Target
    if ($LASTEXITCODE -ne 0) { Write-Die "Clone failed" }
    Write-Ok "Cloned to $Target"

    Push-Location $Target
    try {
        # Create the branch locally if it only exists on the remote, or at HEAD if not published.
        $null = & git rev-parse --verify "origin/$Branch" 2>$null
        if ($LASTEXITCODE -eq 0) {
            & git checkout -B $Branch "origin/$Branch" | Out-Null
            Write-Ok "Checked out $Branch (tracking origin/$Branch)"
        } else {
            & git checkout -B $Branch | Out-Null
            Write-Warn "$Branch is not on the remote; created it locally at HEAD"
        }
        $head = (& git rev-parse --short HEAD).Trim()
        Write-Ok "HEAD is $head"

        # This is the assertion that matters: a healthy clone can diff.
        & git diff --shortstat *> $null
        if ($LASTEXITCODE -ne 0) { Write-Die "Fresh clone still cannot diff — stop and investigate." }
        Write-Ok "git diff works — repo integrity confirmed"
    } finally { Pop-Location }
} else {
    Write-Host "  [WhatIf] would clone $RepoUrl -> $Target"
}

# ---------------------------------------------------------------- copy tree

Write-Step "Copying working tree"

if ($PSCmdlet.ShouldProcess($Target, "robocopy working tree")) {
    $xd = @(); foreach ($d in $ExcludeDirs)  { $xd += "/XD"; $xd += (Join-Path $Source $d) }
    $xf = @(); foreach ($f in $ExcludeFiles) { $xf += "/XF"; $xf += $f }

    # /E recurse incl. empty, /COPY:DAT skip ACLs (avoids OneDrive ACL noise),
    # /R:2 /W:2 short retries, /NFL /NDL /NP quiet.
    $args = @($Source, $Target, "/E", "/COPY:DAT", "/R:2", "/W:2", "/NFL", "/NDL", "/NP", "/NJH") + $xd + $xf
    & robocopy @args | Out-Null
    $rc = $LASTEXITCODE

    # robocopy: 0-7 success, 8+ failure.
    if ($rc -ge 8) { Write-Die "robocopy failed with exit code $rc" }
    Write-Ok "Working tree copied (robocopy rc=$rc)"
} else {
    Write-Host "  [WhatIf] would robocopy $Source -> $Target"
}

# ---------------------------------------------------------------- secrets

Write-Step "Copying gitignored secrets"

foreach ($f in $SecretFiles) {
    $src = Join-Path $Source $f
    $dst = Join-Path $Target $f
    if (-not (Test-Path -LiteralPath $src)) { Write-Warn "$f not found in source — skipped"; continue }
    if ($PSCmdlet.ShouldProcess($dst, "copy secret")) {
        Copy-Item -LiteralPath $src -Destination $dst -Force
        Write-Ok "$f"
    } else {
        Write-Host "  [WhatIf] would copy $f"
    }
}

# ---------------------------------------------------------------- verify

Write-Step "Verification"

if (-not $WhatIfPreference) {
    Push-Location $Target
    try {
        $missing = @()
        foreach ($f in $SecretFiles) { if (-not (Test-Path -LiteralPath (Join-Path $Target $f))) { $missing += $f } }
        if ($missing) { Write-Warn "Secrets missing in target: $($missing -join ', ')" }
        else { Write-Ok "All $($SecretFiles.Count) secret files present" }

        & git diff --shortstat *> $null
        if ($LASTEXITCODE -ne 0) { Write-Die "git diff still fails in target" }
        Write-Ok "git diff works"

        $logLines = (& git log --oneline | Measure-Object -Line).Lines
        $revCount = [int](& git rev-list --count HEAD).Trim()
        if ($logLines -ne $revCount) { Write-Warn "history still truncated: log=$logLines rev-list=$revCount" }
        else { Write-Ok "history intact: $revCount commits" }

        Write-Host "`n  running git fsck ..." -ForegroundColor Gray
        $fsck = & git fsck --no-progress 2>&1 | Select-String -Pattern "missing|broken"
        if ($fsck) { Write-Warn "fsck reported issues:`n$fsck" } else { Write-Ok "fsck clean — no missing or broken objects" }

        $changed = (& git status --porcelain | Measure-Object -Line).Lines
        Write-Ok "$changed changed entries staged for review"

        Write-Host "`n  Next: .\commit-batches.ps1 -DryRun" -ForegroundColor Cyan
    } finally { Pop-Location }
} else {
    Write-Host "  [WhatIf] verification skipped"
}

Write-Host "`nDone.`n" -ForegroundColor Green
