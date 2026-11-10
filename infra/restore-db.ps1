$ErrorActionPreference = 'Stop'

$composeArgs = @(
    'compose',
    '-f', (Join-Path $PSScriptRoot 'docker-compose.yml'),
    '--profile', 'demo'
)

function Invoke-Compose([string[]]$Arguments) {
    & docker @composeArgs @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Docker Compose failed: $($Arguments -join ' ')"
    }
}

function Copy-ToContainer([string]$Service, [string]$Source, [string]$ContainerPath) {
    $containerOutput = & docker @composeArgs ps -q $Service
    if ($LASTEXITCODE -ne 0) {
        throw "Could not query container for service '$Service'."
    }
    $containerId = ($containerOutput -join '').Trim()
    if ([string]::IsNullOrWhiteSpace($containerId)) {
        throw "Container for service '$Service' is not running. Start the demo profile first."
    }
    & docker cp $Source "${containerId}:$ContainerPath"
    if ($LASTEXITCODE -ne 0) {
        throw "Could not copy $Source to service '$Service'."
    }
}

$mongoDump = Join-Path $PSScriptRoot 'mongodb\backups\ingestion.archive.gz'
$dynamoDump = Join-Path $PSScriptRoot 'dynamodb\backups\dynamodb.json'
$dynamoRestore = Join-Path $PSScriptRoot 'dynamodb\restore.php'
foreach ($requiredFile in @($mongoDump, $dynamoDump, $dynamoRestore)) {
    if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
        throw "Required backup file not found: $requiredFile"
    }
}

Write-Host 'PostgreSQL backups are restored automatically when its data volume is first initialized.'
Write-Host 'Restoring MongoDB ingestion data...'
Copy-ToContainer 'mongodb' $mongoDump '/tmp/ingestion.archive.gz'
Invoke-Compose @(
    'exec', '-T', 'mongodb', 'sh', '-lc',
    'mongorestore --archive=/tmp/ingestion.archive.gz --gzip --username="$MONGO_INITDB_ROOT_USERNAME" --password="$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase=admin'
)

Write-Host 'Restoring DynamoDB Local tables...'
Copy-ToContainer 'ms-ranking' $dynamoRestore '/tmp/restore-dynamodb.php'
Copy-ToContainer 'ms-ranking' $dynamoDump '/tmp/dynamodb.json'
Invoke-Compose @('exec', '-T', 'ms-ranking', 'php', '/tmp/restore-dynamodb.php', '/tmp/dynamodb.json')

Write-Host 'MongoDB and DynamoDB backups restored.'
