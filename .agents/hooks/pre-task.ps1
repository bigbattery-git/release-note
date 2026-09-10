[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$requiredFiles = @(
    (Join-Path $repositoryRoot 'AGENTS.md'),
    (Join-Path $repositoryRoot '.agents\AGENTS.md')
)

foreach ($requiredFile in $requiredFiles) {
    if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
        Write-Error "Required harness file is missing: $requiredFile"
        exit 1
    }
}

Write-Output "Harness pre-task check passed: $repositoryRoot"
