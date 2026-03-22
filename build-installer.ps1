#Requires -Version 5.1
<#
.SYNOPSIS
    Builds the Trading Strategy Comparator Windows installer (.exe).

.DESCRIPTION
    Runs four stages in order:
      1. Frontend :Vite production build  (frontend/dist/)
      2. Backend  :PyInstaller bundle     (backend/dist/trading-backend/)
      2.5 Stage   :Robocopy to electron/.stage/backend/  (deterministic copy)
      3. Electron :NSIS installer         (dist-installer/*.exe)

.PARAMETER SkipFrontend
    Skip the Vite build step (use if frontend/dist/ is already up to date).

.PARAMETER SkipBackend
    Skip the PyInstaller step (use if backend/dist/trading-backend/ is already built).

.PARAMETER SkipElectron
    Skip the staging + electron-builder step.

.EXAMPLE
    .\build-installer.ps1
    .\build-installer.ps1 -SkipFrontend -SkipBackend   # re-stage and rebuild installer only
#>
param(
    [switch]$SkipFrontend,
    [switch]$SkipBackend,
    [switch]$SkipElectron
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── Paths ─────────────────────────────────────────────────────────────────────
$ROOT           = $PSScriptRoot
$PYTHON         = "C:\Users\sakth\Desktop\vayu\.venv\Scripts\python.exe"
$FRONTEND       = Join-Path $ROOT "frontend"
$BACKEND        = Join-Path $ROOT "backend"
$ELECTRON       = Join-Path $ROOT "electron"
$DIST_OUT       = Join-Path $ROOT "dist-installer"
$BACKEND_SRC    = Join-Path $BACKEND "dist\trading-backend"
$STAGED_BACKEND = Join-Path $ELECTRON ".stage\backend"

# ── Helpers ───────────────────────────────────────────────────────────────────
function Step($msg) {
    Write-Host ""
    Write-Host "  [$msg]" -ForegroundColor Cyan
    Write-Host "  $('-' * 60)" -ForegroundColor DarkGray
}
function Ok($msg)   { Write-Host "  [OK]   $msg" -ForegroundColor Green }
function Fail($msg) { Write-Host "  [FAIL] $msg" -ForegroundColor Red; exit 1 }
function Info($msg) { Write-Host "  ...    $msg" -ForegroundColor Gray }

function Require($path, $label) {
    if (-not (Test-Path $path)) { Fail "$label not found: $path" }
}

function Assert-NotLocked($exePath, $label) {
    if (-not (Test-Path $exePath)) { return }
    try {
        $f = [System.IO.File]::Open($exePath, 'Open', 'ReadWrite', 'None')
        $f.Close()
    } catch {
        Fail "$label is locked by another process. Close all instances of the app and retry."
    }
}

# ── Preflight ─────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host " Trading Strategy Comparator:Windows Installer Build" -ForegroundColor White
Write-Host " $(Get-Date -Format 'yyyy-MM-dd HH:mm')" -ForegroundColor DarkGray
Write-Host ""

Require $PYTHON   "Python (vayu venv)"
Require $FRONTEND "frontend/"
Require $BACKEND  "backend/"
Require $ELECTRON "electron/"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail "node not found on PATH" }
if (-not (Get-Command npm  -ErrorAction SilentlyContinue)) { Fail "npm not found on PATH"  }

Info "Python : $PYTHON"
Info "Node   : $(node --version)"
Info "npm    : $(npm --version)"

# ── Stage 1: Frontend ─────────────────────────────────────────────────────────
if (-not $SkipFrontend) {
    Step "Stage 1 / 3:Vite production build"
    Push-Location $FRONTEND
    try {
        Info "Running: npm run build"
        npm run build
        if ($LASTEXITCODE -ne 0) { Fail "Frontend build failed (exit $LASTEXITCODE)" }
        $distFiles = (Get-ChildItem "$FRONTEND\dist" -Recurse -File).Count
        Ok "Frontend built:$distFiles files in frontend/dist/"
    } finally { Pop-Location }
} else {
    Info "Stage 1 skipped (-SkipFrontend)"
    Require "$FRONTEND\dist\index.html" "frontend/dist/index.html"
}

Require "$FRONTEND\dist\index.html" "frontend/dist/index.html (required for PyInstaller)"

# ── Stage 2: Backend (PyInstaller) ────────────────────────────────────────────
if (-not $SkipBackend) {
    Step "Stage 2 / 3:PyInstaller backend bundle"

    Info "Checking PyInstaller…"
    $pyiCheck = & $PYTHON -c "import PyInstaller; print(PyInstaller.__version__)" 2>&1
    if ($LASTEXITCODE -ne 0) {
        Info "PyInstaller not found:installing…"
        & $PYTHON -m pip install pyinstaller --quiet
        if ($LASTEXITCODE -ne 0) { Fail "Could not install PyInstaller" }
        Ok "PyInstaller installed"
    } else {
        Ok "PyInstaller $pyiCheck"
    }

    Push-Location $BACKEND
    try {
        Info "Running: pyinstaller trading-backend.spec --clean"
        & $PYTHON -m PyInstaller trading-backend.spec --clean --noconfirm
        if ($LASTEXITCODE -ne 0) { Fail "PyInstaller build failed (exit $LASTEXITCODE)" }

        Require "$BACKEND_SRC\trading-backend.exe"                     "trading-backend.exe"
        Require "$BACKEND_SRC\_internal\app\main.py"                   "bundled app/main.py"
        Require "$BACKEND_SRC\_internal\shared"                        "bundled shared/"
        Require "$BACKEND_SRC\_internal\frontend_dist\index.html"      "bundled frontend_dist/index.html"

        $bundleSize = [math]::Round((Get-ChildItem $BACKEND_SRC -Recurse -File |
            Measure-Object Length -Sum).Sum / 1MB, 1)
        Ok "Backend bundle: ${bundleSize} MB  ->  backend/dist/trading-backend/"
    } finally { Pop-Location }
} else {
    Info "Stage 2 skipped (-SkipBackend)"
    Require "$BACKEND_SRC\trading-backend.exe"                "trading-backend.exe"
    Require "$BACKEND_SRC\_internal\frontend_dist\index.html" "bundled frontend_dist/index.html"
}

# ── Stage 2.5: Stage backend for deterministic Electron packaging ──────────────
if (-not $SkipElectron) {
    Step "Stage 2.5 / 3:Staging backend (robocopy -> electron/.stage/backend/)"

    # Check for lock on any previously staged exe
    Assert-NotLocked "$STAGED_BACKEND\trading-backend.exe" "Staged trading-backend.exe"

    # Clean and recreate the stage directory
    $stageParent = Split-Path $STAGED_BACKEND -Parent
    if (Test-Path $stageParent) {
        Info "Cleaning previous stage…"
        Remove-Item $stageParent -Recurse -Force -ErrorAction Stop
    }
    New-Item -ItemType Directory -Path $STAGED_BACKEND -Force | Out-Null

    # Robocopy:copies every file and subfolder verbatim
    Info "Copying: $BACKEND_SRC  ->  $STAGED_BACKEND"
    $robocopyArgs = @($BACKEND_SRC, $STAGED_BACKEND, "/E", "/NFL", "/NDL", "/NJH", "/NJS", "/NC", "/NS", "/NP")
    & robocopy @robocopyArgs
    # robocopy exit codes: 0-7 are successes, 8+ are errors
    if ($LASTEXITCODE -ge 8) { Fail "robocopy staging failed (exit $LASTEXITCODE)" }

    # Assert every critical file survived the copy
    $stagingChecks = @(
        @{ Path = "$STAGED_BACKEND\trading-backend.exe";                      Label = "staged trading-backend.exe" },
        @{ Path = "$STAGED_BACKEND\_internal\app\main.py";                    Label = "staged _internal/app/main.py" },
        @{ Path = "$STAGED_BACKEND\_internal\shared";                         Label = "staged _internal/shared/" },
        @{ Path = "$STAGED_BACKEND\_internal\frontend_dist\index.html";       Label = "staged _internal/frontend_dist/index.html" }
    )
    foreach ($c in $stagingChecks) {
        if (-not (Test-Path $c.Path)) { Fail "Staging incomplete:$($c.Label) missing" }
    }

    $stagedFiles = (Get-ChildItem $STAGED_BACKEND -Recurse -File).Count
    $srcFiles    = (Get-ChildItem $BACKEND_SRC    -Recurse -File).Count
    if ($stagedFiles -ne $srcFiles) {
        Fail "Staging file count mismatch: source=$srcFiles staged=$stagedFiles"
    }
    Ok "Backend staged:$stagedFiles files  ->  electron/.stage/backend/"
}

# ── Stage 3: Electron installer ───────────────────────────────────────────────
if (-not $SkipElectron) {
    Step "Stage 3 / 3:electron-builder NSIS installer"

    # Check for lock on any leftover win-unpacked backend before electron-builder runs
    $prevUnpacked = "$DIST_OUT\win-unpacked"
    if (Test-Path $prevUnpacked) {
        Assert-NotLocked "$prevUnpacked\resources\backend\trading-backend.exe" "Previous win-unpacked backend exe"
        Info "Removing previous win-unpacked…"
        Remove-Item $prevUnpacked -Recurse -Force -ErrorAction SilentlyContinue
        if (Test-Path $prevUnpacked) {
            Fail "Could not remove $prevUnpacked. Close all app instances and retry."
        }
        Ok "Previous win-unpacked removed"
    }

    Push-Location $ELECTRON
    try {
        Info "Running: npm install"
        npm install --prefer-offline --loglevel error
        if ($LASTEXITCODE -ne 0) { Fail "npm install failed in electron/" }

        Info "Running: electron-builder --win nsis"
        npm run build
        if ($LASTEXITCODE -ne 0) { Fail "electron-builder failed (exit $LASTEXITCODE)" }
    } finally { Pop-Location }

    # ── Post-build assertions ──────────────────────────────────────────────────
    $unpackedChecks = @(
        @{ Path = "$DIST_OUT\win-unpacked\Trading Strategy Comparator.exe";                      Label = "win-unpacked Electron exe" },
        @{ Path = "$DIST_OUT\win-unpacked\resources\app.asar";                                   Label = "win-unpacked app.asar" },
        @{ Path = "$DIST_OUT\win-unpacked\resources\backend\trading-backend.exe";                Label = "win-unpacked backend exe" },
        @{ Path = "$DIST_OUT\win-unpacked\resources\backend\_internal\frontend_dist\index.html"; Label = "win-unpacked frontend_dist/index.html" }
    )
    foreach ($c in $unpackedChecks) {
        if (-not (Test-Path $c.Path)) { Fail "Incomplete build artifact: $($c.Label) missing" }
    }
    Ok "win-unpacked structure verified"

    # Find installer
    $installer = Get-ChildItem $DIST_OUT -Filter "*.exe" -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match "Setup" } | Sort-Object LastWriteTime -Descending | Select-Object -First 1

    if ($installer) {
        $sizeMB = [math]::Round($installer.Length / 1MB, 1)
        Ok "Installer: $($installer.FullName)  (${sizeMB} MB)"
    } else {
        Fail "Installer .exe not found in $DIST_OUT"
    }
} else {
    Info "Stage 3 skipped (-SkipElectron)"
}

# ── Done ──────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host " Build complete!" -ForegroundColor Green
Write-Host ""
$final = Get-ChildItem $DIST_OUT -Filter "*.exe" -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match "Setup" } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($final) {
    Write-Host " Installer : $($final.FullName)" -ForegroundColor White
    Write-Host ""
    Write-Host " Run the Setup .exe to install, then launch from Start Menu / Desktop." -ForegroundColor DarkGray
}
Write-Host ""
