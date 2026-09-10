[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$gitDirectory = Join-Path $repositoryRoot '.git'

if (-not (Test-Path -LiteralPath $gitDirectory)) {
    Write-Error "Git metadata was not found: $gitDirectory"
    exit 1
}

Push-Location $repositoryRoot
try {
    git diff --check
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
}
finally {
    Pop-Location
}

Write-Output 'Harness post-task check passed: git diff --check'
