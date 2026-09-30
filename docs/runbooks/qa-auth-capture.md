# Capture existing QA users from Windows and validate in WSL

The existing capture scripts support DEV and QA. DEV remains the default.
Use `-Environment qa` in PowerShell and `--environment qa` in Node. QA uses
standard HTTPS without `:8443`.

In Windows PowerShell:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
$atlasRepo = '\\wsl.localhost\Ubuntu-24.04\home\chandravel_natarajan\src\athyper'
$refreshScript = Join-Path $atlasRepo 'tooling\scripts\verification\Refresh-AthyperAuth.ps1'

& $refreshScript -Environment qa -Plane neon -Actor catl.admin
& $refreshScript -Environment qa -Plane neon -Actor catl.owner
& $refreshScript -Environment qa -Plane studio -Actor catl.admin
& $refreshScript -Environment qa -Plane studio -Actor catl.owner
```

For each window, sign in, complete MFA, select CirrusAtlantic, and wait for
`/home`. Close the capture browser without signing out. Credentials remain in the
issuer's browser UI. Actor-specific files are saved under
`tests/e2e/.auth/qa/<plane>/<actor>.json`.

In Ubuntu/WSL, validate all four sessions:

```bash
cd ~/src/athyper
for plane in neon studio; do
  for actor in catl.admin catl.owner; do
    node tooling/scripts/verification/check-athyper-auth.mjs \
      --environment qa --plane "$plane" --actor "$actor" || break 2
  done
done
```

The validator checks the actual account, tenant and plane. Each successful QA
validation also saves a private qualification copy under
`~/.athyper/qualification/sessions/qa/<plane>/<actor>.json`. No `--activate` is
needed for these maker/checker copies.

To select one account for existing E2E commands:

```bash
node tooling/scripts/verification/check-athyper-auth.mjs \
  --environment qa --plane neon --actor catl.admin --activate
export PLAYWRIGHT_NEON_BASE_URL="https://neon.qa.athyper.test"
export PLAYWRIGHT_REUSE_AUTH_STATE=neon
```

Repeat with `--actor catl.owner` when selecting the approver. `--activate` replaces
only the selected plane's compatibility file (`tests/e2e/.auth/neon.json`);
actor-specific DEV and QA files remain separate. Use uppercase
`PLAYWRIGHT_NEON_BASE_URL`. Studio uses `PLAYWRIGHT_STUDIO_BASE_URL` and
`PLAYWRIGHT_REUSE_AUTH_STATE=studio`.

## Elevated Atlas/step-up capture

Use this when the journey requires elevated assurance. It verifies the actor and
tenant, invokes the normal step-up flow when necessary, and waits for interactive
MFA. It does not approve a business request or publication.

```powershell
$atlasRepo = '\\wsl.localhost\Ubuntu-24.04\home\chandravel_natarajan\src\athyper'
$atlasCapture = Join-Path $env:USERPROFILE '.athyper-auth'

npm.cmd install --prefix $atlasCapture --no-audit --no-fund playwright@1.60.0
if ($LASTEXITCODE -ne 0) { throw 'Playwright installation failed' }
& "$atlasCapture\node_modules\.bin\playwright.cmd" install chromium
if ($LASTEXITCODE -ne 0) { throw 'Chromium installation failed' }

$env:ATLAS_CAPTURE_PACKAGE_ROOT = $atlasCapture
node.exe "$atlasRepo\tooling\scripts\verification\capture-atlas-elevated-session.cjs" `
  --environment qa `
  --plane neon `
  --actor catl.owner `
  --output "$atlasRepo\tests\e2e\.auth\qa\neon\catl.owner.json"
```

Then run the Ubuntu validator for that QA actor again. The default output path is
already environment-specific, so `--output` may be omitted. Use `athyper.owner`
only when deliberately testing that tenant and its QA credentials are configured;
Cirrus qualification uses `catl.admin` and `catl.owner`.

Node syntax checks and five focused identity/environment validation tests passed.
The interactive Windows capture requires the user's desktop and was not executed
by the agent.

## Explicit elevated QA capture

Ordinary `Refresh-AthyperAuth.ps1` captures login; it does not initiate step-up.
For publication/approval qualification, use its new `-Elevated` option in Windows
PowerShell after setting `$refreshScript` as above:

```powershell
& $refreshScript -Environment qa -Plane studio -Actor catl.owner -Elevated
& $refreshScript -Environment qa -Plane neon -Actor catl.owner -Elevated
```

This invokes the existing interactive OIDC step-up capture, waits for elevated
assurance, preserves the prior file on failure, then runs the WSL validator and
syncs the qualification session automatically. Do not close the browser until
capture reports success. The validator must report `"assurance": "elevated"`.

A separate WSL verification is available:

```bash
node tooling/scripts/verification/check-athyper-auth.mjs --environment qa --plane studio --actor catl.owner --require-elevated
```

If the file timestamp does not change or validation still reports baseline,
retain the terminal error for diagnosis. Repeated ordinary refresh does not
satisfy an elevated-session requirement.
