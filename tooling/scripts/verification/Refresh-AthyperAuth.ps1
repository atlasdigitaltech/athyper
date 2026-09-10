param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('neon', 'mesh', 'studio')][string]$Plane,
    [Parameter(Mandatory = $true)]
    [ValidateSet('catl.admin', 'catl.owner')][string]$Actor,
    [string]$Distro = 'Ubuntu-24.04',
    [string]$RepoPath = '/home/chandravel_natarajan/src/athyper',
    [string]$PlaywrightVersion = '1.60.0'
)

$ErrorActionPreference = 'Stop'
$captureFolder = Join-Path $env:USERPROFILE ".athyper-auth\dev\$Plane"
$targetFolder = "\\wsl.localhost\$Distro" + ($RepoPath.TrimEnd('/') -replace '/', '\') + "\tests\e2e\.auth\dev\$Plane"
New-Item -ItemType Directory -Force -Path $captureFolder | Out-Null
New-Item -ItemType Directory -Force -Path $targetFolder | Out-Null
$temporaryState = Join-Path $captureFolder ([guid]::NewGuid().ToString() + '.json')
$targetState = Join-Path $targetFolder "$Actor.json"

Push-Location $env:USERPROFILE
try {
    npx.cmd --yes "playwright@$PlaywrightVersion" install chromium
    if ($LASTEXITCODE -ne 0) { throw 'Chromium installation failed.' }

    Write-Host "Sign in as $Actor in $Plane; complete MFA and select the intended tenant."
    Write-Host 'Wait for /home, then close the browser WITHOUT signing out.'
    $loginUrl = "https://$Plane.dev.athyper.test/api/auth/login?returnTo=%2Fhome"
    npx.cmd --yes "playwright@$PlaywrightVersion" open --ignore-https-errors "--save-storage=$temporaryState" $loginUrl
    if ($LASTEXITCODE -ne 0 -or !(Test-Path $temporaryState)) { throw 'Capture failed; existing state retained.' }

    $state = Get-Content -Raw $temporaryState | ConvertFrom-Json
    $cookie = $state.cookies | Where-Object {
        $_.name -in @('athyper-session', '__Host-athyper-session') -and $_.value
    }
    if (!$cookie) { throw 'No Athyper session cookie captured; existing state retained.' }

    Copy-Item $temporaryState $targetState -Force
    & wsl.exe -d $Distro -- chmod 600 "$RepoPath/tests/e2e/.auth/dev/$Plane/$Actor.json"
    if ($LASTEXITCODE -ne 0) { throw 'State copied, but setting Linux permissions failed.' }
    Write-Host "Saved tests/e2e/.auth/dev/$Plane/$Actor.json"
    Write-Host 'Run the Ubuntu validator before qualification. The actor label is not identity verification.'
} finally {
    Remove-Item $temporaryState -ErrorAction SilentlyContinue
    Pop-Location
}
