[CmdletBinding(DefaultParameterSetName = "Single")]
param(
    [Parameter(Mandatory = $true, ParameterSetName = "Single")]
    [ValidateSet("studio", "neon", "mesh")]
    [string] $Plane,

    [Parameter(Mandatory = $true, ParameterSetName = "All")]
    [switch] $All,

    [switch] $DryRun,

    [switch] $Docker,

    [string] $DockerContainer,

    [string] $DatabaseUser,

    [string] $ResumeFrom,

    [switch] $CreateDatabaseOnly,
    [switch] $AuthorizationIdempotency
)

$ErrorActionPreference = "Stop"
$ddlRoot = $PSScriptRoot

if ($All -and -not $DryRun) {
    throw "Apply one plane at a time. -All is intentionally limited to -DryRun."
}
if ($CreateDatabaseOnly -and $All) {
    throw "-CreateDatabaseOnly requires one explicit plane."
}
if ($CreateDatabaseOnly -and $DryRun) {
    throw "Use db:foundation:plan for a dry run; database creation is not part of a manifest."
}
if (-not [string]::IsNullOrWhiteSpace($ResumeFrom) -and ($DryRun -or $CreateDatabaseOnly -or $All)) {
    throw "-ResumeFrom requires one explicit plane apply operation."
}
if (-not [string]::IsNullOrWhiteSpace($DockerContainer)) {
    $Docker = $true
}
if ($Docker -and [string]::IsNullOrWhiteSpace($DockerContainer)) {
    $DockerContainer = if ([string]::IsNullOrWhiteSpace($env:DOCKER_CONTAINER_DB)) {
        "athyper-db-1"
    } else {
        $env:DOCKER_CONTAINER_DB
    }
}
if ([string]::IsNullOrWhiteSpace($DatabaseUser)) {
    $DatabaseUser = if ([string]::IsNullOrWhiteSpace($env:DB_ADMIN_USER)) {
        "athyperadmin"
    } else {
        $env:DB_ADMIN_USER
    }
}
if ($DatabaseUser -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') {
    throw "DatabaseUser must be a simple PostgreSQL identifier."
}

$planes = @{
    studio = @{
        Database = "athyper_studio"
        Manifest = "planes/studio/_manifest.txt"
        Variables = @("ATHYPER_PLATFORM_DATABASE_ADMIN_URL")
    }
    neon = @{
        Database = "athyper_neon"
        Manifest = "planes/neon/_manifest.txt"
        Variables = @("ATHYPER_NEON_DATABASE_ADMIN_URL", "DATABASE_ADMIN_URL")
    }
    mesh = @{
        Database = "athyper_mesh"
        Manifest = "planes/mesh/_manifest.txt"
        Variables = @("ATHYPER_MESH_DATABASE_ADMIN_URL", "MESH_DATABASE_ADMIN_URL")
    }
}


function Get-ConnectionUrl {
    param([hashtable] $Definition)

    foreach ($variableName in $Definition.Variables) {
        $value = [Environment]::GetEnvironmentVariable($variableName)
        if (-not [string]::IsNullOrWhiteSpace($value)) {
            return $value
        }
    }

    return $null
}

function Get-ManifestFiles {
    param([string] $ManifestRelativePath)

    $manifestPath = Join-Path $ddlRoot $ManifestRelativePath
    if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
        throw "Manifest not found: $manifestPath"
    }

    $rootPath = [IO.Path]::GetFullPath($ddlRoot)
    foreach ($line in Get-Content -LiteralPath $manifestPath) {
        $relativePath = $line.Trim()
        if ($relativePath.Length -eq 0 -or $relativePath.StartsWith("#")) {
            continue
        }
        if ([IO.Path]::IsPathRooted($relativePath)) {
            throw "Manifest path must be relative: $relativePath"
        }

        $fullPath = [IO.Path]::GetFullPath((Join-Path $ddlRoot $relativePath))
        if (-not $fullPath.StartsWith($rootPath + [IO.Path]::DirectorySeparatorChar)) {
            throw "Manifest path escapes the DDL root: $relativePath"
        }
        if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
            throw "Manifest file not found: $relativePath"
        }

        [pscustomobject]@{
            RelativePath = $relativePath
            FullPath = $fullPath
        }
    }
}

function Assert-DockerDatabaseContainer {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw "docker is required but was not found on PATH."
    }

    $runningOutput = & docker inspect --format "{{.State.Running}}" $DockerContainer 2>$null
    $running = "$runningOutput".Trim()
    if ($LASTEXITCODE -ne 0 -or $running -ne "true") {
        throw "PostgreSQL container is not running: $DockerContainer"
    }
}

function Ensure-PlaneDatabase {
    param(
        [string] $PlaneName,
        [hashtable] $Definition
    )

    if (-not $Docker) {
        throw "-CreateDatabaseOnly requires -Docker for the existing local stack."
    }

    Assert-DockerDatabaseContainer

    $databaseName = $Definition.Database
    $existsOutput = & docker exec $DockerContainer psql `
        --username $DatabaseUser `
        --dbname postgres `
        --tuples-only `
        --no-align `
        --no-psqlrc `
        --set ON_ERROR_STOP=1 `
        --command "SELECT 1 FROM pg_database WHERE datname = '$databaseName'"
    $exists = "$existsOutput".Trim()
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to inspect databases in $DockerContainer."
    }

    if ($exists -eq "1") {
        Write-Host "Database $databaseName already exists; no changes made."
        return
    }

    Write-Host "Creating database $databaseName owned by $DatabaseUser..."
    & docker exec $DockerContainer createdb `
        --username $DatabaseUser `
        --owner $DatabaseUser `
        --encoding UTF8 `
        --template template0 `
        $databaseName
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to create database $databaseName."
    }

    Write-Host "Database $databaseName created for the $PlaneName plane. Other planes were not modified."
}

function Get-DockerCurrentDatabase {
    param([string] $DatabaseName)

    $actualDatabaseOutput = & docker exec $DockerContainer psql `
        --username $DatabaseUser `
        --dbname $DatabaseName `
        --tuples-only `
        --no-align `
        --no-psqlrc `
        --set ON_ERROR_STOP=1 `
        --command "SELECT current_database()"
    $actualDatabase = "$actualDatabaseOutput".Trim()
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to verify Docker target database $DatabaseName."
    }

    return $actualDatabase
}

function Assert-FreshDatabase {
    param(
        [string] $DatabaseName,
        [string] $ConnectionUrl
    )

    $preflightSql = @"
WITH blockers AS (
    SELECT format('schema:%I', n.nspname) AS object_name
      FROM pg_namespace AS n
     WHERE n.nspname <> 'public'
       AND n.nspname <> 'information_schema'
       AND n.nspname !~ '^pg_'
    UNION ALL
    SELECT format(
               '%s:%I.%I',
               CASE c.relkind
                   WHEN 'r' THEN 'table'
                   WHEN 'p' THEN 'partitioned-table'
                   WHEN 'v' THEN 'view'
                   WHEN 'm' THEN 'materialized-view'
                   WHEN 'S' THEN 'sequence'
                   WHEN 'f' THEN 'foreign-table'
               END,
               n.nspname,
               c.relname
           )
      FROM pg_class AS c
      JOIN pg_namespace AS n
        ON n.oid = c.relnamespace
     WHERE c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
       AND n.nspname <> 'information_schema'
       AND n.nspname !~ '^pg_'
),
sample AS (
    SELECT object_name, count(*) OVER () AS total
      FROM blockers
     ORDER BY object_name
     LIMIT 12
)
SELECT CASE
           WHEN count(*) = 0 THEN '0|'
           ELSE format(
                    '%s|%s',
                    max(total),
                    string_agg(object_name, ', ' ORDER BY object_name)
                )
       END
  FROM sample;
"@

    if ($Docker) {
        $preflightOutput = & docker exec $DockerContainer psql `
            --username $DatabaseUser `
            --dbname $DatabaseName `
            --tuples-only `
            --no-align `
            --no-psqlrc `
            --set ON_ERROR_STOP=1 `
            --command $preflightSql
    } else {
        $preflightOutput = & psql $ConnectionUrl `
            --tuples-only `
            --no-align `
            --no-psqlrc `
            --set ON_ERROR_STOP=1 `
            --command $preflightSql
    }
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to run the fresh-database preflight for $DatabaseName."
    }

    $preflightResult = "$preflightOutput".Trim()
    $parts = $preflightResult -split '\|', 2
    $blockerCount = 0
    if ($parts.Count -lt 1 -or -not [int]::TryParse(
        $parts[0],
        [ref] $blockerCount
    )) {
        throw "Unexpected fresh-database preflight result for $DatabaseName."
    }
    if ($blockerCount -gt 0) {
        $sampleText = if ($parts.Count -eq 2) {
            $parts[1]
        } else {
            "sample unavailable"
        }
        throw (
            "Refusing foundation build: $DatabaseName is not empty " +
            "($blockerCount schema/relation blockers; first: $sampleText). " +
            "The manifests are desired-state fresh-database builds. " +
            "Reset the selected plane before rerunning foundation."
        )
    }
}

function Get-ExpandedSqlContent {
    param(
        [string] $SqlFilePath,
        [System.Collections.Generic.HashSet[string]] $IncludeStack
    )

    $resolvedPath = [IO.Path]::GetFullPath($SqlFilePath)
    $databaseRoot = [IO.Path]::GetFullPath((Join-Path $ddlRoot ".."))
    $allowedPrefix = $databaseRoot + [IO.Path]::DirectorySeparatorChar

    if (-not $resolvedPath.StartsWith(
        $allowedPrefix,
        [StringComparison]::OrdinalIgnoreCase
    )) {
        throw "SQL include escapes server/db: $resolvedPath"
    }
    if (-not (Test-Path -LiteralPath $resolvedPath -PathType Leaf)) {
        throw "SQL include not found: $resolvedPath"
    }
    if (-not $IncludeStack.Add($resolvedPath)) {
        throw "Recursive SQL include detected: $resolvedPath"
    }

    try {
        $builder = [Text.StringBuilder]::new()
        foreach ($line in [IO.File]::ReadLines($resolvedPath)) {
            if ($line -match '^\s*\\ir\s+(.+?)\s*$') {
                $includeValue = $Matches[1].Trim().Trim('"').Trim("'")
                if ([IO.Path]::IsPathRooted($includeValue)) {
                    throw "SQL include must be relative: $includeValue"
                }

                $includePath = [IO.Path]::GetFullPath((
                    Join-Path ([IO.Path]::GetDirectoryName($resolvedPath)) $includeValue
                ))
                $expanded = Get-ExpandedSqlContent `
                    -SqlFilePath $includePath `
                    -IncludeStack $IncludeStack
                [void] $builder.AppendLine(
                    "-- begin included SQL: $includeValue"
                )
                [void] $builder.AppendLine($expanded)
                [void] $builder.AppendLine(
                    "-- end included SQL: $includeValue"
                )
            } else {
                [void] $builder.AppendLine($line)
            }
        }

        return $builder.ToString()
    } finally {
        [void] $IncludeStack.Remove($resolvedPath)
    }
}

function Invoke-DockerSqlFile {
    param(
        [string] $DatabaseName,
        [string] $PlaneName,
        [pscustomobject] $File
    )

    $includeStack = [System.Collections.Generic.HashSet[string]]::new(
        [StringComparer]::OrdinalIgnoreCase
    )
    $sqlContent = Get-ExpandedSqlContent `
        -SqlFilePath $File.FullPath `
        -IncludeStack $includeStack
    $sessionPrelude = @"
SELECT set_config('app.database_plane', '$PlaneName', false);
SELECT set_config(
    'app.current_principal_id',
    '00000000-0000-0000-0000-000000000000',
    false
);
"@

    $sqlInput = $sessionPrelude + [Environment]::NewLine + $sqlContent
    $maximumAttempts = 3
    for ($attempt = 1; $attempt -le $maximumAttempts; $attempt++) {
        $sqlInput |
            & docker exec -i $DockerContainer psql `
                --username $DatabaseUser `
                --dbname $DatabaseName `
                --single-transaction `
                --no-psqlrc `
                --set ON_ERROR_STOP=1 `
                --file -
        if ($LASTEXITCODE -eq 0) {
            return
        }
        if ($attempt -lt $maximumAttempts) {
            Write-Warning "DDL transport failed for $($File.RelativePath); retrying Docker exec ($attempt/$maximumAttempts)."
            Start-Sleep -Seconds $attempt
        }
    }
    throw "DDL failed after $maximumAttempts attempts: $($File.RelativePath)"
}

function Invoke-PlaneBuild {
    param(
        [string] $PlaneName,
        [hashtable] $Definition
    )

    $files = @(Get-ManifestFiles -ManifestRelativePath $Definition.Manifest)
    if (-not [string]::IsNullOrWhiteSpace($ResumeFrom)) {
        $relativePaths = [string[]] @($files | ForEach-Object { $_.RelativePath })
        $resumeIndex = [Array]::IndexOf($relativePaths, $ResumeFrom)
        if ($resumeIndex -lt 0) {
            throw "Resume path is not present in the $PlaneName manifest: $ResumeFrom"
        }
        $files = @($files[$resumeIndex..($files.Count - 1)])
    }
    if ($AuthorizationIdempotency) {
        $files = @($files | Where-Object {
            $path = $_.RelativePath
            $isReferencePhase = $path -match '/(?:12|13|14|15)_[^/]+\.sql$'
            $isRequiredAuthorityReference =
                $path -eq 'common/master/12_system_authority_reference_seed.sql' -or
                $path -eq 'common/audit/12_reference_seed.sql' -or
                $path -eq "planes/$PlaneName/master/12_platform_catalog_reference_seed.sql" -or
                $path -eq "planes/$PlaneName/control/12_platform_catalog_reference_seed.sql" -or
                $path -match "^planes/$PlaneName/authz/(?:12|13|14|15)_.*permission_reference_seed\.sql$"
            -not $isReferencePhase -or $isRequiredAuthorityReference
        })
        $currencyPath = [IO.Path]::GetFullPath((Join-Path $ddlRoot 'common/shared/reference-data/003_currency.sql'))
        $files += [pscustomobject]@{
            RelativePath = 'common/shared/reference-data/003_currency.sql'
            FullPath = $currencyPath
        }
    }
    Write-Host ""
    Write-Host "=== $PlaneName -> $($Definition.Database) ==="

    if ($DryRun) {
        foreach ($file in $files) {
            Write-Host "  $($file.RelativePath)"
        }
        return
    }

    $connectionUrl = $null
    if ($Docker) {
        Assert-DockerDatabaseContainer
        $actualDatabase = Get-DockerCurrentDatabase -DatabaseName $Definition.Database
    } else {
        $connectionUrl = Get-ConnectionUrl -Definition $Definition
        if ([string]::IsNullOrWhiteSpace($connectionUrl)) {
            throw "No database URL configured for $PlaneName. Set one of: $($Definition.Variables -join ', ')"
        }
        if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
            throw "psql is required but was not found on PATH. Use -Docker for the local stack."
        }

        $actualDatabaseOutput = & psql $connectionUrl --tuples-only --no-align --no-psqlrc `
            --set ON_ERROR_STOP=1 --command "SELECT current_database()"
        $actualDatabase = "$actualDatabaseOutput".Trim()
        if ($LASTEXITCODE -ne 0) {
            throw "Unable to verify the target database for $PlaneName."
        }
    }
    if ($actualDatabase -ne $Definition.Database) {
        throw "Refusing $PlaneName build: expected $($Definition.Database), connected to $actualDatabase."
    }

    if ([string]::IsNullOrWhiteSpace($ResumeFrom)) {
        Assert-FreshDatabase `
            -DatabaseName $Definition.Database `
            -ConnectionUrl $connectionUrl
    } else {
        Write-Warning "Resuming $PlaneName at the explicit transactional boundary: $ResumeFrom"
    }

    foreach ($file in $files) {
        Write-Host "  $($file.RelativePath)"
        if ($Docker) {
            Invoke-DockerSqlFile `
                -DatabaseName $Definition.Database `
                -PlaneName $PlaneName `
                -File $file
        } else {
            $includeStack = [System.Collections.Generic.HashSet[string]]::new(
                [StringComparer]::OrdinalIgnoreCase
            )
            $sqlContent = Get-ExpandedSqlContent `
                -SqlFilePath $file.FullPath `
                -IncludeStack $includeStack
            $sessionPrelude = @"
SELECT set_config('app.database_plane', '$PlaneName', false);
SELECT set_config(
    'app.current_principal_id',
    '00000000-0000-0000-0000-000000000000',
    false
);
"@
            ($sessionPrelude + [Environment]::NewLine + $sqlContent) |
                & psql $connectionUrl --single-transaction --no-psqlrc `
                    --set ON_ERROR_STOP=1 --file -
            if ($LASTEXITCODE -ne 0) {
                throw "DDL failed: $($file.RelativePath)"
            }
        }
    }
}

if ($CreateDatabaseOnly) {
    Ensure-PlaneDatabase -PlaneName $Plane -Definition $planes[$Plane]
    exit 0
}

$selectedPlanes = if ($All) {
    @("studio", "neon", "mesh")
} else {
    @($Plane)
}

foreach ($planeName in $selectedPlanes) {
    Invoke-PlaneBuild -PlaneName $planeName -Definition $planes[$planeName]
}

if ($DryRun) {
    Write-Host ""
    Write-Host "Dry run complete; no SQL was executed."
}
