param([Parameter(Mandatory=$true)][ValidateSet('catl.admin','catl.owner')][string]$Actor,[switch]$StepUp)
$ErrorActionPreference='Stop'
$repo='\\wsl.localhost\Ubuntu-24.04\home\chandravel_natarajan\src\athyper'
$packageRoot=Join-Path $env:USERPROFILE ".athyper-auth\dev\neon\bp-enter-isolated\$Actor"
if (!(Test-Path (Join-Path $packageRoot 'node_modules\playwright\package.json'))) { throw 'Existing interactive capture package missing' }
$target='\\wsl.localhost\Ubuntu-24.04\home\chandravel_natarajan\.athyper\instances\dev\deployments\bp-enter-isolated-20260911\ui-auth\dev\neon\'+$Actor+'.json'
$priorPackageRoot=$env:ATLAS_CAPTURE_PACKAGE_ROOT
try {
 $env:ATLAS_CAPTURE_PACKAGE_ROOT=$packageRoot
 $captureOptions=@();if($StepUp){$captureOptions=@("--step-up")}
 node.exe "$repo\tooling\scripts\verification\isolated-enter\capture-normal-neon-session.cjs" --plane neon --actor $Actor --output $target @captureOptions
 if($LASTEXITCODE -ne 0){throw 'Normal isolated capture failed; existing saved state retained'}
 & wsl.exe -d Ubuntu-24.04 -- chmod 600 "/home/chandravel_natarajan/.athyper/instances/dev/deployments/bp-enter-isolated-20260911/ui-auth/dev/neon/$Actor.json"
} finally {$env:ATLAS_CAPTURE_PACKAGE_ROOT=$priorPackageRoot}
