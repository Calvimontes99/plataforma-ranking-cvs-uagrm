$ErrorActionPreference = 'Stop'

$composeArgs = @(
    'compose',
    '-f', (Join-Path $PSScriptRoot 'docker-compose.yml'),
    '--profile', 'demo'
)

$postgresBackupPath = Join-Path $PSScriptRoot 'postgres\backups'
$mongoBackupPath = Join-Path $PSScriptRoot 'mongodb\backups'
$dynamoBackupPath = Join-Path $PSScriptRoot 'dynamodb\backups'
New-Item -ItemType Directory -Force -Path $postgresBackupPath, $mongoBackupPath, $dynamoBackupPath | Out-Null

function Invoke-Compose([string[]]$Arguments) {
    & docker @composeArgs @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Docker Compose failed: $($Arguments -join ' ')"
    }
}

function Get-ContainerId([string]$Service) {
    $containerOutput = & docker @composeArgs ps -q $Service
    if ($LASTEXITCODE -ne 0) {
        throw "Could not query container for service '$Service'."
    }
    $containerId = ($containerOutput -join '').Trim()
    if ([string]::IsNullOrWhiteSpace($containerId)) {
        throw "Container for service '$Service' is not running. Start the demo profile first."
    }
    return $containerId
}

function Copy-FromContainer([string]$Service, [string]$ContainerPath, [string]$Destination) {
    $containerId = Get-ContainerId $Service
    & docker cp "${containerId}:$ContainerPath" $Destination
    if ($LASTEXITCODE -ne 0) {
        throw "Could not copy $ContainerPath from service '$Service'."
    }
}

function Copy-ToContainer([string]$Service, [string]$Source, [string]$ContainerPath) {
    $containerId = Get-ContainerId $Service
    & docker cp $Source "${containerId}:$ContainerPath"
    if ($LASTEXITCODE -ne 0) {
        throw "Could not copy $Source to service '$Service'."
    }
}

Write-Host 'Exporting PostgreSQL application databases...'
Invoke-Compose @(
    'exec', '-T', 'postgres', 'sh', '-lc',
    'pg_dump --format=custom --username="$POSTGRES_USER" --dbname="$VACANCIES_DB" --file=/tmp/vacancies.dump && pg_dump --format=custom --username="$POSTGRES_USER" --dbname="$CQRS_DB" --file=/tmp/read-model.dump'
)
Copy-FromContainer 'postgres' '/tmp/vacancies.dump' (Join-Path $postgresBackupPath 'vacancies.dump')
Copy-FromContainer 'postgres' '/tmp/read-model.dump' (Join-Path $postgresBackupPath 'read-model.dump')

Write-Host 'Exporting MongoDB ingestion database...'
Invoke-Compose @(
    'exec', '-T', 'mongodb', 'sh', '-lc',
    'mongodump --archive=/tmp/ingestion.archive.gz --gzip --db="$MONGO_INITDB_DATABASE" --username="$MONGO_INITDB_ROOT_USERNAME" --password="$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase=admin'
)
Copy-FromContainer 'mongodb' '/tmp/ingestion.archive.gz' (Join-Path $mongoBackupPath 'ingestion.archive.gz')

Write-Host 'Exporting DynamoDB Local tables...'
Copy-ToContainer 'ms-ranking' (Join-Path $PSScriptRoot 'dynamodb\export.php') '/tmp/export-dynamodb.php'
Invoke-Compose @('exec', '-T', 'ms-ranking', 'php', '/tmp/export-dynamodb.php', '/tmp/dynamodb.json')
Copy-FromContainer 'ms-ranking' '/tmp/dynamodb.json' (Join-Path $dynamoBackupPath 'dynamodb.json')

Write-Host ''
Write-Host "Backups created under:`n  $postgresBackupPath`n  $mongoBackupPath`n  $dynamoBackupPath"
Write-Host 'Treat these files as confidential; they may contain candidate personal data.'
