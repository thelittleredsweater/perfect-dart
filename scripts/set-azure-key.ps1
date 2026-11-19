# Enregistre la cle Azure Speech dans %USERPROFILE%\.perfect-darts\azure-speech.json
# (hors du projet, jamais commitee). La saisie est masquee.
$dir = Join-Path $env:USERPROFILE '.perfect-darts'
New-Item -ItemType Directory -Force $dir | Out-Null
$file = Join-Path $dir 'azure-speech.json'
Write-Host ''
Write-Host 'Colle la CLE 1 Azure (clic droit ou Ctrl+V), puis Entree. Elle ne s affiche pas.' -ForegroundColor Cyan
$sec = Read-Host -AsSecureString 'Cle'
$key = [System.Net.NetworkCredential]::new('', $sec).Password.Trim()
if ($key.Length -lt 20) { Write-Host "Cle trop courte ($($key.Length) caracteres) : rien n'a ete enregistre." -ForegroundColor Red; exit 1 }
$json = @{ key = $key; region = 'francecentral' } | ConvertTo-Json
[System.IO.File]::WriteAllText($file, $json, [System.Text.UTF8Encoding]::new($false))
Write-Host "Cle enregistree ($($key.Length) caracteres) dans $file" -ForegroundColor Green
