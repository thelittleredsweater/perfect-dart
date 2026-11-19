# Recupere la cle de la ressource Azure Speech via Azure CLI et l'ecrit dans
# %USERPROFILE%\.perfect-darts\azure-speech.json (hors du projet). La cle n'est jamais affichee.
param(
  [string]$Group = 'perfect-darts',
  [string]$Name = 'perfect-darts-voix-7k3',
  [string]$Region = 'francecentral'
)
$az = (Get-Command az -ErrorAction SilentlyContinue).Source
if (-not $az) { $az = 'C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd' }
if (-not (Test-Path $az)) { Write-Host 'Azure CLI introuvable : installe-le d abord (winget install Microsoft.AzureCLI).' -ForegroundColor Red; exit 1 }

& $az account show 1>$null 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Connexion Azure : valide-la dans la fenetre du navigateur qui s ouvre.' -ForegroundColor Cyan
  & $az login --only-show-errors 1>$null
  if ($LASTEXITCODE -ne 0) { Write-Host 'Connexion Azure annulee ou echouee.' -ForegroundColor Red; exit 1 }
}

$key = (& $az cognitiveservices account keys list -g $Group -n $Name --query key1 -o tsv --only-show-errors)
if ($LASTEXITCODE -ne 0 -or -not $key) { Write-Host 'Impossible de lire la cle (ressource ou abonnement introuvable).' -ForegroundColor Red; exit 1 }
$key = $key.Trim()

$dir = Join-Path $env:USERPROFILE '.perfect-darts'
New-Item -ItemType Directory -Force $dir | Out-Null
$file = Join-Path $dir 'azure-speech.json'
$json = @{ key = $key; region = $Region } | ConvertTo-Json
[System.IO.File]::WriteAllText($file, $json, [System.Text.UTF8Encoding]::new($false))
Write-Host "Cle enregistree ($($key.Length) caracteres) dans $file" -ForegroundColor Green
