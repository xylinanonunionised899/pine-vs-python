param(
  [Parameter(Mandatory = $true)]
  [string]$PdfPath,

  [string]$OutputPath
)

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$defaultOutputDir = Join-Path $repoRoot "data\cache\pdf_batch"

if (-not (Test-Path $PdfPath)) {
  throw "PDF not found: $PdfPath"
}

$pdftotext = Get-Command pdftotext.exe -ErrorAction SilentlyContinue
if (-not $pdftotext) {
  $fallback = "C:\Program Files\Git\mingw64\bin\pdftotext.exe"
  if (Test-Path $fallback) {
    $pdftotextPath = $fallback
  } else {
    throw "pdftotext.exe not found. Expected it on PATH or at $fallback"
  }
} else {
  $pdftotextPath = $pdftotext.Source
}

if (-not $OutputPath) {
  $safeName = [IO.Path]::GetFileNameWithoutExtension($PdfPath) -replace "[^a-zA-Z0-9._-]", "_"
  $OutputPath = Join-Path $defaultOutputDir "$safeName.txt"
}

$outputDir = Split-Path $OutputPath -Parent
if (-not (Test-Path $outputDir)) {
  New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
}

& $pdftotextPath -layout -nopgbrk -enc UTF-8 $PdfPath $OutputPath
Write-Output $OutputPath
