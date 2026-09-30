param([Parameter(Mandatory=$true)][ValidateSet('catl.admin','catl.owner')][string]$Actor)
$ErrorActionPreference='Stop'
$repo='\\wsl.localhost\Ubuntu-24.04\home\chandravel_natarajan\src\athyper'
$packageRoot=Join-Path $env:USERPROFILE ".athyper-auth\dev\neon\bp-enter-isolated\$Actor"
$state='\\wsl.localhost\Ubuntu-24.04\home\chandravel_natarajan\.athyper\instances\dev\deployments\bp-enter-isolated-20260911\ui-auth\dev\neon\'+$Actor+'.json'
$priorRoot=$env:ATLAS_CAPTURE_PACKAGE_ROOT
try {$env:ATLAS_CAPTURE_PACKAGE_ROOT=$packageRoot;node.exe "$repo\tooling\scripts\verification\isolated-enter\open-manual-neon.cjs" --actor $Actor --state $state} finally {$env:ATLAS_CAPTURE_PACKAGE_ROOT=$priorRoot}
