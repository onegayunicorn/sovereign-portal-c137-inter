<#
.SYNOPSIS
    Build the Sovereign Portal C-137 standalone Windows executable.

.DESCRIPTION
    Runs PyInstaller against apps/soe-core/desktop_launcher.py, bundling the
    shipped website (apps/web-portal) as the `web` data directory so that
    desktop_launcher.resolve_web_root() finds it at sys._MEIPASS/web.

    Outputs dist/windows/SovereignPortalC137.exe, stages the website next to the
    executable as dist/windows/web, and writes dist/windows/SHA256.txt.

    Mirrors the deliverables expected by windows/installer.nsi and
    .github/workflows/windows-exe-release.yml.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File windows/build-exe.ps1
    powershell -ExecutionPolicy Bypass -File windows/build-exe.ps1 -SkipInstall
#>
[CmdletBinding()]
param(
    [string]$Root       = "",
    [string]$Launcher   = "apps/soe-core/desktop_launcher.py",
    [string]$WebsiteSrc = "apps/web-portal",
    [string]$OutputDir  = "dist/windows",
    [string]$ExeName    = "SovereignPortalC137",
    [switch]$SkipInstall,
    [switch]$Console
)

$ErrorActionPreference = "Stop"

# Resolve the repository root explicitly. $PSScriptRoot is not reliably
# populated inside a param() default block under Windows PowerShell 5.1.
if ([string]::IsNullOrWhiteSpace($Root)) {
    $scriptDir = $PSScriptRoot
    if ([string]::IsNullOrWhiteSpace($scriptDir)) { $scriptDir = Split-Path -Parent $PSCommandPath }
    if ([string]::IsNullOrWhiteSpace($scriptDir)) { $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition }
    if ([string]::IsNullOrWhiteSpace($scriptDir)) { throw "Cannot determine the script directory." }
    $Root = (Resolve-Path (Join-Path $scriptDir "..")).Path
}
$Root = (Resolve-Path $Root).Path

function Write-Step([string]$msg) { Write-Host "==> $msg" -ForegroundColor Cyan }

Write-Step "Sovereign Portal C-137 - Windows .exe build"
Write-Host "Root:       $Root"
Write-Host "Launcher:   $Launcher"
Write-Host "Website:    $WebsiteSrc"
Write-Host "Output:     $OutputDir"

$launcherPath = Join-Path $Root $Launcher
$websitePath  = Join-Path $Root $WebsiteSrc
$outPath      = Join-Path $Root $OutputDir

if (-not (Test-Path $launcherPath)) {
    throw "desktop_launcher.py not found at $launcherPath"
}
if (-not (Test-Path $websitePath)) {
    Write-Warning "Website source '$websitePath' not found - bundling an empty placeholder."
    New-Item -ItemType Directory -Force -Path $websitePath | Out-Null
}

# 1. Ensure PyInstaller is available.
if (-not $SkipInstall) {
    Write-Step "Installing PyInstaller"
    python -m pip install --disable-pip-version-check --quiet pyinstaller
}

# 2. Fresh output directory.
if (Test-Path $outPath) { Remove-Item -Recurse -Force $outPath }
New-Item -ItemType Directory -Force -Path $outPath | Out-Null

# 3. PyInstaller build.
#    --windowed gives a clean GUI launch; -Console keeps stdout for debugging.
Write-Step "Running PyInstaller"
$sep = [IO.Path]::PathSeparator   # ';' on Windows
$mode = if ($Console) { "--console" } else { "--windowed" }

python -m PyInstaller `
    --noconfirm `
    --clean `
    --onefile `
    $mode `
    --name $ExeName `
    --distpath $outPath `
    --workpath (Join-Path $outPath "_build") `
    --specpath (Join-Path $outPath "_spec") `
    --add-data "$websitePath${sep}web" `
    --collect-submodules uvicorn `
    --hidden-import gateway `
    --hidden-import soe_core `
    --hidden-import voice_omega `
    --hidden-import rick_persona `
    --paths (Join-Path $Root "apps/soe-core") `
    $launcherPath

if ($LASTEXITCODE -ne 0) { throw "PyInstaller failed with exit code $LASTEXITCODE" }

# 4. Stage the website next to the exe as `web`.
Write-Step "Staging bundled website"
$stageWebsite = Join-Path $outPath "web"
New-Item -ItemType Directory -Force -Path $stageWebsite | Out-Null
if (Get-ChildItem -Path $websitePath -Force | Select-Object -First 1) {
    Copy-Item -Recurse -Force (Join-Path $websitePath "*") $stageWebsite
} else {
    Set-Content -Path (Join-Path $stageWebsite "README.txt") `
        -Value "Website bundle placeholder - build apps/web-portal first."
}

# 5. SHA256 checksums.
Write-Step "Writing SHA256.txt"
$exeFull = Join-Path $outPath "$ExeName.exe"
if (-not (Test-Path $exeFull)) { throw "Expected artifact not produced: $exeFull" }

$lines = @()
$hash = (Get-FileHash -Path $exeFull -Algorithm SHA256).Hash
$lines += "$hash  $ExeName.exe"

Get-ChildItem -Path $outPath -Filter *.exe -File | Where-Object { $_.Name -ne "$ExeName.exe" } | ForEach-Object {
    $h = (Get-FileHash -Path $_.FullName -Algorithm SHA256).Hash
    $lines += "$h  $($_.Name)"
}

$shaFile = Join-Path $outPath "SHA256.txt"
$lines | Out-File -FilePath $shaFile -Encoding ascii

Write-Step "Build complete"
Get-ChildItem -Path $outPath -File | Select-Object Name, Length | Format-Table -AutoSize
Write-Host "Artifact: $exeFull"
Write-Host "Checksum: $shaFile"
$lines | ForEach-Object { Write-Host $_ }
