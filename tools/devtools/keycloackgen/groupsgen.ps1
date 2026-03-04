$tenants  = @("demo_my","demo_in","demo_sa","demo_qa","demo_fr","demo_de","demo_ch","demo_us","demo_ca")
$personas = @("viewer","reporter","requester","agent","manager","module_admin","tenant_admin")

# Phase-2 (example): pick modules and orgunits per tenant
$modules  = @("ACC","SRC","SVC")       # expand later
$orgUnits = @("riyadh","jeddah")       # expand per tenant if needed

function New-GroupNode($name, $subGroups=@()) {
  [ordered]@{ name=$name; subGroups=$subGroups }
}

# Global
$global = New-GroupNode "global" @(
  New-GroupNode "tenants" @( New-GroupNode "all" @() )
)

# Tenants root
$tenantNodes = @()

foreach ($t in $tenants) {
  # Phase-1 bundle persona nodes
  $phase1Persona = New-GroupNode "persona" ($personas | ForEach-Object { New-GroupNode $_ @() })
  $phase1All = New-GroupNode "all" @( $phase1Persona )
  $modulesRootChildren = @($phase1All)

  # Phase-2 module nodes (optional)
  foreach ($m in $modules) {
    $personaNodes = @()
    foreach ($p in $personas) {
      # module persona
      $pNode = New-GroupNode $p @()

      # module persona + OU (optional)
      $ouNode = New-GroupNode "orgunit" ($orgUnits | ForEach-Object { New-GroupNode $_ @() })
      $pNode.subGroups = @($ouNode)

      $personaNodes += $pNode
    }
    $mNode = New-GroupNode $m @( New-GroupNode "persona" $personaNodes )
    $modulesRootChildren += $mNode
  }

  $tenantNodes += New-GroupNode $t @(
    New-GroupNode "modules" $modulesRootChildren
  )
}

$tenantsRoot = New-GroupNode "tenants" $tenantNodes

$payload = [ordered]@{
  realm  = "athyper"
  groups = @($global, $tenantsRoot)
}

$payload | ConvertTo-Json -Depth 50 | Out-File -Encoding utf8 ".\athyper-groups-import.json"
Write-Host "Generated: athyper-groups-import.json"
