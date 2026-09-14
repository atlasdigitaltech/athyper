param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('neon', 'mesh', 'studio')][string]$Plane,
    [Parameter(Mandatory = $true)]
    [ValidateSet('catl.admin', 'catl.owner', 'athyper.admin', 'athyper.owner')][string]$Actor,
    [ValidateSet('dev', 'qa')][string]$Environment = 'dev',
    [string]$Distro = 'Ubuntu-24.04',
    [string]$RepoPath = '/home/chandravel_natarajan/src/athyper',
    [string]$PlaywrightVersion = '1.60.0',
    [switch]$IsolatedStudio,
    [switch]$IsolatedNeon,
    [switch]$Elevated,
    [switch]$Fresh
)

$ErrorActionPreference = 'Stop'
if ($IsolatedStudio -and ($Environment -ne 'dev' -or $Plane -ne 'studio' -or $Actor -notin @('catl.admin', 'catl.owner'))) {
    throw 'Isolated Studio requires dev/studio and catl.admin or catl.owner.'
}
if ($IsolatedNeon -and ($IsolatedStudio -or $Environment -ne 'dev' -or $Plane -ne 'neon' -or $Actor -notin @('catl.admin', 'catl.owner'))) { throw 'Isolated NEON requires dev/neon and catl.admin or catl.owner.' }
$captureFolder = Join-Path $env:USERPROFILE ".athyper-auth\$Environment\$Plane"
$targetFolder = "\\wsl.localhost\$Distro" + ($RepoPath.TrimEnd('/') -replace '/', '\') + "\tests\e2e\.auth\$Environment\$Plane"
$linuxTargetFolder = "$RepoPath/tests/e2e/.auth/$Environment/$Plane"
$captureOptions = @()
$browserOptions = @()
if ($IsolatedStudio -or $IsolatedNeon) {
    $linuxUserHome = (& wsl.exe -d $Distro -- printenv HOME).Trim()
    if ($LASTEXITCODE -ne 0 -or !$linuxUserHome.StartsWith('/')) { throw 'Cannot resolve WSL home.' }
    $linuxTargetFolder = "$linuxUserHome/.athyper/instances/dev/deployments/bp-enter-isolated-20260911/ui-auth/dev/$Plane"
    $targetFolder = "\\wsl.localhost\$Distro" + ($linuxTargetFolder -replace '/', '\')
    $captureFolder = Join-Path (Join-Path $captureFolder 'bp-enter-isolated') $Actor
    if ($IsolatedStudio) { $captureOptions = @('--isolated-studio') } else { $captureOptions = @('--isolated-neon') }
    $proxyPort = if ($IsolatedStudio) { 13330 } else { 13320 }
    $browserOptions = @("--proxy-server=http://127.0.0.1:$proxyPort")
    Write-Host "Target: isolated BP $Plane through loopback proxy $proxyPort. No access grants are changed."
}
New-Item -ItemType Directory -Force -Path $captureFolder | Out-Null
New-Item -ItemType Directory -Force -Path $targetFolder | Out-Null
$temporaryState = Join-Path $captureFolder ([guid]::NewGuid().ToString() + '.json')
$targetState = Join-Path $targetFolder "$Actor.json"

Push-Location $env:USERPROFILE
try {
    npx.cmd --yes "playwright@$PlaywrightVersion" install chromium
    if ($LASTEXITCODE -ne 0) { throw 'Chromium installation failed.' }

    if ($Elevated) {
        npm.cmd install --prefix $captureFolder --no-audit --no-fund "playwright@$PlaywrightVersion"
        if ($LASTEXITCODE -ne 0) { throw 'Playwright module installation failed.' }
        $repoWindows = "\\wsl.localhost\$Distro" + ($RepoPath.TrimEnd('/') -replace '/', '\')
        $elevatedScript = Join-Path $repoWindows 'tooling\scripts\verification\capture-atlas-elevated-session.cjs'
        $priorPackageRoot = $env:ATLAS_CAPTURE_PACKAGE_ROOT
        try {
            $env:ATLAS_CAPTURE_PACKAGE_ROOT = $captureFolder
            $freshOptions = @()
            if ($Fresh) { $freshOptions = @('--fresh') }
            node.exe $elevatedScript --environment $Environment --plane $Plane --actor $Actor --output $targetState @captureOptions @freshOptions
            if ($LASTEXITCODE -ne 0) { throw 'Elevated capture failed; existing state retained.' }
        } finally {
            $env:ATLAS_CAPTURE_PACKAGE_ROOT = $priorPackageRoot
        }
        & wsl.exe -d $Distro -- chmod 600 "$linuxTargetFolder/$Actor.json"
        if ($LASTEXITCODE -ne 0) { throw 'Setting Linux session permissions failed.' }
        $validatorHome = (& wsl.exe -d $Distro -- printenv HOME).Trim()
        $validatorNode = "$validatorHome/.local/bin/node"
        & wsl.exe -d $Distro -- test -x $validatorNode
        if ($LASTEXITCODE -ne 0) { $validatorNode = 'node' }
        & wsl.exe -d $Distro --cd $RepoPath -- $validatorNode tooling/scripts/verification/check-athyper-auth.mjs --environment $Environment --plane $Plane --actor $Actor --require-elevated @captureOptions
        if ($LASTEXITCODE -ne 0) { throw 'Session capture succeeded, but elevated session validation failed.' }
        return
    }

    Write-Host "Sign in as $Actor in $Environment/$Plane; complete MFA and select the intended tenant."
    Write-Host 'Wait for /home, then close the browser WITHOUT signing out.'
    $loginUrl = "https://$Plane.$Environment.athyper.test/api/auth/login?returnTo=%2Fhome"
    npx.cmd --yes "playwright@$PlaywrightVersion" open --ignore-https-errors "--save-storage=$temporaryState" @browserOptions $loginUrl
    if ($LASTEXITCODE -ne 0 -or !(Test-Path $temporaryState)) { throw 'Capture failed; existing state retained.' }

    $state = Get-Content -Raw $temporaryState | ConvertFrom-Json
    $cookie = $state.cookies | Where-Object {
        $_.name -in @('athyper-session', '__Host-athyper-session') -and $_.value -and
        $_.domain.TrimStart('.') -eq "$Plane.$Environment.athyper.test"
    }
    if (!$cookie) { throw 'No Athyper session cookie captured; existing state retained.' }

    Copy-Item $temporaryState $targetState -Force
    & wsl.exe -d $Distro -- chmod 600 "$linuxTargetFolder/$Actor.json"
    if ($LASTEXITCODE -ne 0) { throw 'State copied, but setting Linux permissions failed.' }
    Write-Host "Saved $linuxTargetFolder/$Actor.json"
    Write-Host 'Run the Ubuntu validator before qualification. The actor label is not identity verification.'
} finally {
    Remove-Item $temporaryState -ErrorAction SilentlyContinue
    Pop-Location
}
