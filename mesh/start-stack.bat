@echo off
set "MESH_DIR=D:\Products\athyper\mesh"
set "COMPOSE_DIR=%MESH_DIR%\compose"
set "ENV_FILE=%MESH_DIR%\env\.env"
set "MESH_CONFIG=%MESH_DIR:\=/%/config"
set "MESH_DATA=%MESH_DIR:\=/%/data"

docker compose --project-directory "%COMPOSE_DIR%" --env-file "%ENV_FILE%" --profile mesh -f "%COMPOSE_DIR%\mesh.base.yml" -f "%COMPOSE_DIR%\db\mesh-db.yml" -f "%COMPOSE_DIR%\db\mesh-dbpool-apps.yml" -f "%COMPOSE_DIR%\db\mesh-dbpool-auth.yml" -f "%COMPOSE_DIR%\gateway\mesh-gateway.yml" -f "%COMPOSE_DIR%\memorycache\mesh-memorycache.yml" -f "%COMPOSE_DIR%\iam\mesh-iam.yml" -f "%COMPOSE_DIR%\objectstorage\mesh-objectstorage.yml" -f "%COMPOSE_DIR%\mail\mesh-mailhog.yml" -f "%COMPOSE_DIR%\mesh.override.local.yml" up -d --remove-orphans > "D:\tmp\stack-up.log" 2>&1
echo EXIT_CODE=%ERRORLEVEL% >> "D:\tmp\stack-up.log"
