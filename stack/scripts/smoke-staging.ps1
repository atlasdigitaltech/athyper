# ============================================================
# athyper Stack -- SMOKE TEST (PowerShell)
# Location:
#   stack/scripts/smoke-staging.ps1
# Usage:
#   .\smoke-staging.ps1                                       (auto-detect env)
#   .\smoke-staging.ps1 C:\path\bootstrap.env                 (single env file)
#   .\smoke-staging.ps1 C:\path\bootstrap.env C:\path\secrets.env  (two-file)
#   .\smoke-staging.ps1 -Insecure                             (skip TLS verify)
#
# PowerShell companion to smoke-staging.sh. Mirrors the bash script's checks
# and exit semantics so Windows hosts get the same smoke coverage as Linux.
#
# Exit codes: 0 = all clean | 1 = one or more failures
# ============================================================

[CmdletBinding()]
param(
    [Parameter(Position = 0)] [string] $EnvFile = '',
    [Parameter(Position = 1)] [string] $EnvFile2 = '',
    [switch] $Insecure
)

$ErrorActionPreference = 'Continue'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$StackDir  = Split-Path -Parent $ScriptDir

# ----------------------------
# Resolve env files (two-file model)
# ----------------------------
if (-not $EnvFile) {
    $candidate = Join-Path $StackDir 'env\.env'
    if (Test-Path $candidate) {
        $EnvFile = $candidate
    } else {
        Write-Host "FATAL: no env file specified and $candidate not found" -ForegroundColor Red
        Write-Host "Pass the path explicitly: .\smoke-staging.ps1 C:\path\to\.env" -ForegroundColor Red
        Write-Host "(.env.example is intentionally NOT auto-sourced -- placeholder values would mask real failures.)" -ForegroundColor Red
        exit 1
    }
    if (-not $EnvFile2 -and (Test-Path '/opt/stack/athyper/secrets/.env')) {
        $EnvFile2 = '/opt/stack/athyper/secrets/.env'
    }
}

if (-not (Test-Path $EnvFile)) {
    Write-Host "FATAL: env file not found: $EnvFile" -ForegroundColor Red
    exit 1
}
if ($EnvFile2 -and -not (Test-Path $EnvFile2)) {
    Write-Host "FATAL: secrets env file not found: $EnvFile2" -ForegroundColor Red
    exit 1
}

# ----------------------------
# Parse env file -- quote-aware, # is only a comment outside of values
# ----------------------------
function Parse-EnvFile {
    param([string] $Path, [hashtable] $Map)
    foreach ($line in (Get-Content -LiteralPath $Path -Encoding UTF8)) {
        $t = $line.TrimEnd("`r")
        if ($t.Trim() -eq '' -or $t.Trim().StartsWith('#')) { continue }
        $idx = $t.IndexOf('=')
        if ($idx -lt 1) { continue }
        $k = $t.Substring(0, $idx).Trim()
        $v = $t.Substring($idx + 1).Trim()
        # Quoted value → strip the quotes, keep '#' intact
        if ($v.Length -ge 2) {
            if (($v.StartsWith('"') -and $v.EndsWith('"')) -or
                ($v.StartsWith("'") -and $v.EndsWith("'"))) {
                $v = $v.Substring(1, $v.Length - 2)
                $Map[$k] = $v
                continue
            }
        }
        # Unquoted → strip trailing ` #...` comment if any
        if ($v -match '^(.*?)(?:\s+#.*)?$') { $v = $Matches[1].TrimEnd() }
        $Map[$k] = $v
    }
}

$envMap = @{}
Parse-EnvFile -Path $EnvFile -Map $envMap
if ($EnvFile2) { Parse-EnvFile -Path $EnvFile2 -Map $envMap }

function Get-EnvOr {
    param([string] $Key, [string] $Default = '')
    if ($envMap.ContainsKey($Key) -and $envMap[$Key]) { return $envMap[$Key] }
    return $Default
}

$project     = Get-EnvOr 'COMPOSE_PROJECT_NAME' 'athyper'
$environment = Get-EnvOr 'ENVIRONMENT' 'local'
$apiHost     = Get-EnvOr 'APPS_ATHYPER_API_HOST'
$neonHost    = Get-EnvOr 'APPS_ATHYPER_NEON_HOST'
if (-not $neonHost) { $neonHost = Get-EnvOr 'APPS_ATHYPER_WEB_HOST' }
$meshHost    = Get-EnvOr 'APPS_ATHYPER_MESH_HOST'
$adminHost   = Get-EnvOr 'APPS_ATHYPER_ADMIN_HOST'
$iamHost     = Get-EnvOr 'IAM_HOST'
$iamRealm    = Get-EnvOr 'IAM_DEFAULT_REALM' 'athyper'
$neonRealm   = Get-EnvOr 'NEON_KEYCLOAK_REALM'
$meshRealm   = Get-EnvOr 'MESH_KEYCLOAK_REALM'
$adminRealm  = Get-EnvOr 'ADMIN_KEYCLOAK_REALM'
$s3Endpoint  = Get-EnvOr 'S3_ENDPOINT' 'http://127.0.0.1:9000'
$redisUser   = Get-EnvOr 'MEMORYCACHE_USER' 'default'
$redisPass   = Get-EnvOr 'MEMORYCACHE_PASSWORD'

$scheme = if ($environment -eq 'local') { 'http' } else { 'https' }

if ($environment -eq 'local') {
    if (-not $apiHost)   { $apiHost   = 'api.athyper.local' }
    if (-not $neonHost)  { $neonHost  = 'neon.athyper.local' }
    if (-not $meshHost)  { $meshHost  = 'mesh.athyper.local' }
    if (-not $adminHost) { $adminHost = 'admin.athyper.local' }
    if (-not $iamHost)   { $iamHost   = 'iam.athyper.local' }
}

$skipTls = $Insecure.IsPresent -or ($environment -eq 'local')

# Windows PowerShell 5.1 has no -SkipCertificateCheck; install a global callback
# instead. Only when explicitly insecure or running against the local stack.
if ($skipTls -and $PSVersionTable.PSVersion.Major -lt 6) {
    try {
        [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
        [System.Net.ServicePointManager]::SecurityProtocol =
            [System.Net.SecurityProtocolType]::Tls12 -bor `
            [System.Net.SecurityProtocolType]::Tls11 -bor `
            [System.Net.SecurityProtocolType]::Tls
    } catch { }
}

# ----------------------------
# Counters
# ----------------------------
$script:Passes   = 0
$script:Fails    = 0
$script:Skips    = 0
$script:FailMsgs = New-Object System.Collections.Generic.List[string]

function Pass([string]$msg) { Write-Host "  OK    $msg"; $script:Passes++ }
function Fail([string]$msg) {
    Write-Host "  FAIL  $msg"
    $script:Fails++
    [void]$script:FailMsgs.Add($msg)
}
function Skip([string]$msg) { Write-Host "  SKIP  $msg"; $script:Skips++ }
function Warn([string]$msg) { Write-Host "  WARN  $msg" }

function Invoke-DockerSilent {
    param([string[]] $Arguments)
    # Suppress stderr without using `2>` (avoids PS5.1 NativeCommandError)
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = 'docker'
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError  = $true
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow  = $true
    foreach ($a in $Arguments) { [void]$psi.ArgumentList.Add($a) }
    try {
        $p = [System.Diagnostics.Process]::Start($psi)
    } catch {
        return [pscustomobject]@{ ExitCode = 127; StdOut = ''; StdErr = $_.Exception.Message }
    }
    $stdout = $p.StandardOutput.ReadToEnd()
    $stderr = $p.StandardError.ReadToEnd()
    $p.WaitForExit()
    return [pscustomobject]@{
        ExitCode = $p.ExitCode
        StdOut   = $stdout.Trim()
        StdErr   = $stderr.Trim()
    }
}

# PS 5.1 ProcessStartInfo has no ArgumentList -- fall back to Arguments string
if (-not (New-Object System.Diagnostics.ProcessStartInfo).PSObject.Properties.Match('ArgumentList').Count) {
    function Invoke-DockerSilent {
        param([string[]] $Arguments)
        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName = 'docker'
        $psi.RedirectStandardOutput = $true
        $psi.RedirectStandardError  = $true
        $psi.UseShellExecute = $false
        $psi.CreateNoWindow  = $true
        # Quote any arg containing whitespace
        $psi.Arguments = ($Arguments | ForEach-Object {
            if ($_ -match '\s') { '"' + ($_ -replace '"','\"') + '"' } else { $_ }
        }) -join ' '
        try {
            $p = [System.Diagnostics.Process]::Start($psi)
        } catch {
            return [pscustomobject]@{ ExitCode = 127; StdOut = ''; StdErr = $_.Exception.Message }
        }
        $stdout = $p.StandardOutput.ReadToEnd()
        $stderr = $p.StandardError.ReadToEnd()
        $p.WaitForExit()
        return [pscustomobject]@{
            ExitCode = $p.ExitCode
            StdOut   = $stdout.Trim()
            StdErr   = $stderr.Trim()
        }
    }
}

function Test-DockerAvailable {
    return [bool](Get-Command docker -ErrorAction SilentlyContinue)
}

function HttpCheck {
    param(
        [string] $Label,
        [string] $Url,
        [int]    $Expected = 200
    )
    try {
        $resp = Invoke-WebRequest -Uri $Url -TimeoutSec 15 -UseBasicParsing -ErrorAction Stop
        $code = [int]$resp.StatusCode
        if ($code -eq $Expected) {
            Pass "$Label -> HTTP $code"
        } else {
            Fail "$Label -> expected HTTP $Expected, got $code ($Url)"
        }
    } catch [System.Net.WebException] {
        $we = $_.Exception
        $code = if ($we.Response) { [int]$we.Response.StatusCode } else { 0 }
        if ($code -gt 0) {
            if ($code -eq $Expected) { Pass "$Label -> HTTP $code" }
            else { Fail "$Label -> expected HTTP $Expected, got $code ($Url)" }
        } else {
            $reason = if ($we.Status) { $we.Status.ToString() } else { 'no response' }
            Fail "$Label -> $reason ($Url)"
        }
    } catch {
        Fail "$Label -> $($_.Exception.Message) ($Url)"
    }
}

# ----------------------------
# Header
# ----------------------------
$tlsNote = if ($skipTls) { ' (TLS verify OFF)' } else { '' }
Write-Host ''
Write-Host '============================================================'
Write-Host '  athyper Smoke Test'
Write-Host "  environment : $environment"
Write-Host "  project     : $project"
Write-Host "  bootstrap   : $EnvFile"
if ($EnvFile2) { Write-Host "  secrets     : $EnvFile2" }
Write-Host "  scheme      : $scheme$tlsNote"
$hostsLine = 'api={0} neon={1} mesh={2} admin={3} iam={4}' -f `
    ($apiHost   | ForEach-Object { if ($_) { $_ } else { '<unset>' } }), `
    ($neonHost  | ForEach-Object { if ($_) { $_ } else { '<unset>' } }), `
    ($meshHost  | ForEach-Object { if ($_) { $_ } else { '<unset>' } }), `
    ($adminHost | ForEach-Object { if ($_) { $_ } else { '<unset>' } }), `
    ($iamHost   | ForEach-Object { if ($_) { $_ } else { '<unset>' } })
Write-Host "  hosts       : $hostsLine"
Write-Host '============================================================'
Write-Host ''

# ----------------------------
# [1/8] Container status
# ----------------------------
$expected = New-Object System.Collections.Generic.List[string]
$expected.AddRange([string[]]@(
    "$project-db-1",
    "$project-dbpool-apps-1",
    "$project-dbpool-session-1",
    "$project-memorycache-1",
    "$project-objectstorage-1",
    "$project-gateway-1",
    "$project-iam-1",
    "$project-api-1"
))
if ($environment -eq 'local' -or $neonHost)  { [void]$expected.Add("$project-neon-1") }
if ($environment -eq 'local' -or $meshHost)  { [void]$expected.Add("$project-mesh-1") }
if ($environment -eq 'local' -or $adminHost) { [void]$expected.Add("$project-admin-1") }

Write-Host '[1/8] Docker container status...'
if (-not (Test-DockerAvailable)) {
    Skip 'Docker not in PATH -- skipping container checks'
} else {
    foreach ($cname in $expected) {
        $r = Invoke-DockerSilent @('inspect', '--format', '{{.State.Status}}', $cname)
        if ($r.ExitCode -eq 0 -and $r.StdOut -eq 'running') {
            Pass "container: $cname"
        } else {
            $state = if ($r.StdOut) { $r.StdOut } else { 'missing' }
            Fail "container: $cname (state=$state)"
        }
    }
    $r = Invoke-DockerSilent @('ps', '--format', '{{.Names}}')
    $allRunning = 0
    if ($r.ExitCode -eq 0 -and $r.StdOut) {
        $allRunning = @($r.StdOut -split "`n" | Where-Object { $_ -match "^$([regex]::Escape($project))-" }).Count
    }
    if ($allRunning -lt $expected.Count) {
        Warn "total containers running under project: $allRunning (expected >= $($expected.Count))"
    } else {
        Pass "total containers running under project: $allRunning"
    }
}

# ----------------------------
# [2/8] Postgres readiness
# ----------------------------
Write-Host ''
Write-Host '[2/8] Postgres direct readiness...'
if (Test-DockerAvailable) {
    $r = Invoke-DockerSilent @('inspect', "$project-db-1")
    if ($r.ExitCode -eq 0) {
        $r = Invoke-DockerSilent @('exec', "$project-db-1", 'pg_isready', '-q')
        if ($r.ExitCode -eq 0) { Pass 'Postgres pg_isready' }
        else { Fail 'Postgres pg_isready returned non-zero' }
    } else { Skip "container $project-db-1 not found" }
} else { Skip 'Docker not in PATH' }

# ----------------------------
# [3/8] PgBouncer pools
# ----------------------------
Write-Host ''
Write-Host '[3/8] PgBouncer pools...'
if (Test-DockerAvailable) {
    $pools = @(
        @{ Container = "$project-dbpool-apps-1";    Port = 6432; Label = 'apps' },
        @{ Container = "$project-dbpool-session-1"; Port = 6433; Label = 'session' }
    )
    foreach ($pool in $pools) {
        $r = Invoke-DockerSilent @('inspect', $pool.Container)
        if ($r.ExitCode -eq 0) {
            $r = Invoke-DockerSilent @('exec', $pool.Container, 'pg_isready', '-h', '127.0.0.1', '-p', "$($pool.Port)", '-q')
            if ($r.ExitCode -eq 0) {
                Pass "PgBouncer $($pool.Label) (:$($pool.Port))"
            } else {
                Fail "PgBouncer $($pool.Label) (:$($pool.Port)) not ready"
            }
        } else {
            Skip "container $($pool.Container) not found"
        }
    }
} else { Skip 'Docker not in PATH' }

# ----------------------------
# [4/8] Redis ping -- ACL-aware
# ----------------------------
Write-Host ''
Write-Host '[4/8] Redis ping...'
if (Test-DockerAvailable) {
    $r = Invoke-DockerSilent @('inspect', "$project-memorycache-1")
    if ($r.ExitCode -eq 0) {
        if ($redisPass) {
            $r = Invoke-DockerSilent @('exec', "$project-memorycache-1",
                'redis-cli', '--no-auth-warning', '--user', $redisUser, '-a', $redisPass, 'ping')
        } else {
            $r = Invoke-DockerSilent @('exec', "$project-memorycache-1",
                'redis-cli', '--user', $redisUser, 'ping')
        }
        if ($r.StdOut -match 'PONG') {
            Pass "Redis ping -> PONG (user=$redisUser)"
        } else {
            $got = if ($r.StdOut) { $r.StdOut } else { $r.StdErr }
            Fail "Redis ping failed (user=$redisUser, got: $got)"
        }
    } else { Skip "container $project-memorycache-1 not found" }
} else { Skip 'Docker not in PATH' }

# ----------------------------
# [5/8] MinIO health
# ----------------------------
Write-Host ''
Write-Host '[5/8] MinIO HTTP health...'
HttpCheck 'MinIO liveness' "$($s3Endpoint.TrimEnd('/'))/minio/health/live"

# ----------------------------
# [6/8] API liveness + readiness
# ----------------------------
Write-Host ''
Write-Host '[6/8] API service endpoints...'
if ($apiHost) {
    HttpCheck 'API /livez'  "${scheme}://${apiHost}/livez"
    HttpCheck 'API /readyz' "${scheme}://${apiHost}/readyz"
} else {
    Skip 'API host not configured (set APPS_ATHYPER_API_HOST)'
}

# ----------------------------
# [7/8] Application planes
# ----------------------------
Write-Host ''
Write-Host '[7/8] Application planes...'
if ($neonHost)  { HttpCheck 'Neon /livez'  "${scheme}://${neonHost}/livez" }
else            { Skip 'Neon host not configured (set APPS_ATHYPER_NEON_HOST or APPS_ATHYPER_WEB_HOST)' }
if ($meshHost)  { HttpCheck 'Mesh /livez'  "${scheme}://${meshHost}/livez" }
else            { Skip 'Mesh host not configured (set APPS_ATHYPER_MESH_HOST)' }
if ($adminHost) { HttpCheck 'Admin /livez' "${scheme}://${adminHost}/livez" }
else            { Skip 'Admin host not configured (set APPS_ATHYPER_ADMIN_HOST)' }

# ----------------------------
# [8/8] IAM OIDC discovery -- per realm
# ----------------------------
Write-Host ''
Write-Host '[8/8] IAM OIDC discovery...'
if (-not $iamHost) {
    Skip 'IAM host not configured (set IAM_HOST)'
} else {
    $seen = @{}
    $realmsToCheck = New-Object System.Collections.Generic.List[string]
    foreach ($r in @($iamRealm, $neonRealm, $meshRealm, $adminRealm)) {
        if (-not $r) { continue }
        if ($seen.ContainsKey($r)) { continue }
        $seen[$r] = $true
        [void]$realmsToCheck.Add($r)
    }
    foreach ($realm in $realmsToCheck) {
        HttpCheck "IAM realm '$realm' /.well-known/openid-configuration" `
            "${scheme}://${iamHost}/realms/${realm}/.well-known/openid-configuration"
    }
}

# ----------------------------
# Summary
# ----------------------------
Write-Host ''
Write-Host '============================================================'
$total = $script:Passes + $script:Fails + $script:Skips
if ($script:Fails -gt 0) {
    Write-Host "  RESULT: FAILED -- $($script:Passes) passed, $($script:Fails) failed, $($script:Skips) skipped ($total checks)"
    Write-Host ''
    foreach ($msg in $script:FailMsgs) { Write-Host "    x $msg" }
    Write-Host '============================================================'
    exit 1
} elseif ($script:Skips -gt 0) {
    Write-Host "  RESULT: PASSED with skips -- $($script:Passes) passed, 0 failed, $($script:Skips) skipped ($total checks)"
    Write-Host '============================================================'
    exit 0
} else {
    Write-Host "  RESULT: PASSED -- $($script:Passes) passed ($total checks)"
    Write-Host '============================================================'
    exit 0
}
