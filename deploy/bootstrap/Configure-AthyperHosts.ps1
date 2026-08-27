[CmdletBinding()]
param(
  [switch]$Apply,
  [switch]$Json
)

$ErrorActionPreference = "Stop"
$hostsPath = Join-Path $env:SystemRoot "System32\drivers\etc\hosts"
$domains = @(
  "api.dev.athyper.test", "iam.dev.athyper.test", "mail.dev.athyper.test",
  "mesh.dev.athyper.test", "minio.dev.athyper.test", "neon.dev.athyper.test",
  "studio.dev.athyper.test",
  "api.qa.athyper.test", "iam.qa.athyper.test", "mesh.qa.athyper.test",
  "neon.qa.athyper.test", "studio.qa.athyper.test",
  "api.stg.athyper.test", "iam.stg.athyper.test", "mesh.stg.athyper.test",
  "neon.stg.athyper.test", "studio.stg.athyper.test"
)
$content = Get-Content -LiteralPath $hostsPath -Raw
$missing = @($domains | Where-Object {
  $escaped = [Regex]::Escape($_)
  $content -notmatch "(?m)^\s*127\.0\.0\.1\s+.*(?:^|\s)$escaped(?:\s|$)"
})
$result = [ordered]@{
  hostsPath = $hostsPath
  mode = if ($Apply) { "apply" } else { "plan" }
  required = $domains.Count
  present = $domains.Count - $missing.Count
  missing = $missing
  changed = $false
}

if ($Apply -and $missing.Count -gt 0) {
  $principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Applying Athyper host mappings requires an elevated Windows PowerShell session."
  }
  $stamp = Get-Date -Format "yyyyMMddTHHmmss"
  $backup = "$hostsPath.athyper-$stamp.bak"
  Copy-Item -LiteralPath $hostsPath -Destination $backup -Force
  $lines = @("", "# BEGIN ATHYPER STACK V2")
  $lines += $missing | ForEach-Object { "127.0.0.1`t$_" }
  $lines += "# END ATHYPER STACK V2"
  [IO.File]::AppendAllText($hostsPath, ($lines -join [Environment]::NewLine) + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
  Clear-DnsClientCache | Out-Null
  $result.changed = $true
  $result.backup = $backup
}

if ($Json) {
  $result | ConvertTo-Json -Depth 4
} else {
  "Athyper hosts: mode=$($result.mode) present=$($result.present) required=$($result.required)"
  if ($missing.Count) {
    "Missing loopback mappings:"
    $missing | ForEach-Object { "  127.0.0.1 $_" }
  } else {
    "All Athyper loopback mappings are present."
  }
  if (-not $Apply -and $missing.Count) {
    "Re-run this script from an elevated Windows PowerShell with -Apply."
  }
}
