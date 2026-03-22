$workspace = Split-Path -Parent $PSScriptRoot
$vendor = Join-Path $PSScriptRoot 'vendor'
$env:PYTHONPATH = "$vendor;$PSScriptRoot;$workspace"
