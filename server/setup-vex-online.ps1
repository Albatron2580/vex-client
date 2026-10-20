# VEX CLIENT - one-click setup for the VEX online service (Modrinth sign-in + friends).
# Run it by double-clicking "Set up VEX online.bat". Safe to run again: finished steps are skipped.
# Works in Windows PowerShell 5.1 and PowerShell 7.

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$Toml = Join-Path $PSScriptRoot 'wrangler.toml'
$Utf8 = New-Object System.Text.UTF8Encoding $false   # no BOM (VEX and wrangler both need that)

function Say($text, $color = 'Gray') { Write-Host $text -ForegroundColor $color }
function Step($n, $text) { Write-Host ''; Write-Host "[$n/8] $text" -ForegroundColor Magenta }
function Done($text) { Write-Host "      OK  $text" -ForegroundColor Green }
function Fail($text) {
  Write-Host ''; Write-Host "  Setup stopped: $text" -ForegroundColor Red
  Write-Host '  Fix that, then double-click the setup again - it continues where it left off.' -ForegroundColor Yellow
  if (-not $env:VEX_SETUP_NO_PAUSE) { Read-Host '  Press Enter to close' | Out-Null }
  exit 1
}
# Runs wrangler and captures its output (non-interactive). Interactive steps (login, picking a
# workers.dev name, typing the secret) call npx directly at script level so prompts reach the window.
function Wrangler([string[]]$WranglerArgs, [switch]$Capture, [switch]$NoPrompt) {
  if ($NoPrompt) { $env:CI = 'true' }
  try { $out = & npx --yes wrangler @WranglerArgs 2>&1 | Out-String; return @{ Code = $LASTEXITCODE; Text = $out } }
  finally { if ($NoPrompt) { Remove-Item Env:CI -ErrorAction SilentlyContinue } }
}
function Read-Toml { [IO.File]::ReadAllText($Toml) }
function Write-Toml($text) { [IO.File]::WriteAllText($Toml, $text, $Utf8) }
function Get-TomlValue($key) { $m = [regex]::Match((Read-Toml), "(?m)^\s*$key\s*=\s*""([^""]*)"""); if ($m.Success) { $m.Groups[1].Value } else { '' } }
function Set-TomlValue($key, $value) { Write-Toml ([regex]::Replace((Read-Toml), "(?m)^(\s*$key\s*=\s*)""[^""]*""", "`${1}""$value""")) }
# Finds the JSON in wrangler's output, skipping warning lines such as "[WARNING] ...".
function Find-Json($text, $open, $close) {
  $lines = $text -split "`r?`n"
  $b = $text.LastIndexOf($close)
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if (-not $lines[$i].TrimStart().StartsWith($open)) { continue }
    $start = $text.IndexOf($lines[$i])
    if ($start -lt 0 -or $b -le $start) { continue }
    try { return ($text.Substring($start, $b - $start + 1) | ConvertFrom-Json -ErrorAction Stop) } catch { }
  }
  return $null
}
function Find-Url($text) { $m = [regex]::Match($text, 'https://[a-z0-9-]+(\.[a-z0-9-]+)*\.workers\.dev'); if ($m.Success) { $m.Value } else { $null } }

Write-Host ''
Write-Host '  VEX CLIENT  -  online service setup' -ForegroundColor Magenta
Write-Host '  This puts Modrinth sign-in and Friends online on your free Cloudflare account.' -ForegroundColor Gray
Write-Host '  You will click "Allow" in your browser and copy one Client ID from Modrinth.' -ForegroundColor Gray

# 1. Node.js -------------------------------------------------------------------------------
Step 1 'Checking Node.js'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    Say '      Node.js is missing - installing it with winget (a Windows window may ask for permission)...'
    & winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
  }
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail 'Node.js is not installed. Get the LTS version from https://nodejs.org, install it, and run this again.' }
}
$nodeMajor = [int](((& node --version) -replace '^v', '').Split('.')[0])
if ($nodeMajor -lt 18) { Fail "Node.js $(& node --version) is too old. Install the LTS version from https://nodejs.org." }
Done "Node.js $(& node --version)"

# 2. Dependencies ---------------------------------------------------------------------------
Step 2 'Installing the tools (first time takes a minute)'
& npm install --no-audit --no-fund --loglevel=error
if ($LASTEXITCODE -ne 0) { Fail 'npm install failed. Check your internet connection.' }
Done 'Tools installed'

# 3. Cloudflare login -----------------------------------------------------------------------
Step 3 'Signing in to Cloudflare'
$who = Wrangler @('whoami') -Capture
if ($who.Text -match 'not authenticated|You are not logged in|wrangler login') {
  Say '      Your browser will open. Log in or create a FREE Cloudflare account, then click "Allow".' 'Yellow'
  & npx --yes wrangler login
  if ($LASTEXITCODE -ne 0) { Fail 'Cloudflare login did not finish.' }
}
Done 'Signed in to Cloudflare'

# 4. Database -------------------------------------------------------------------------------
Step 4 'Creating the friends database'
function Get-DbId { $l = Wrangler @('d1', 'list', '--json') -Capture -NoPrompt; $j = Find-Json $l.Text '[' ']'; if ($j) { ($j | Where-Object { $_.name -eq 'vex-online' } | Select-Object -First 1).uuid } }
$dbId = Get-DbId
if (-not $dbId) {
  $c = Wrangler @('d1', 'create', 'vex-online') -Capture -NoPrompt
  $dbId = Get-DbId
  if (-not $dbId) { Say $c.Text; Fail 'Could not create the database on Cloudflare.' }
}
Set-TomlValue 'database_id' $dbId
$m = Wrangler @('d1', 'migrations', 'apply', 'vex-online', '--remote') -Capture -NoPrompt
if ($m.Code -ne 0 -and $m.Text -notmatch 'No migrations to apply') { Say $m.Text; Fail 'Could not set up the database tables.' }
Done "Database ready ($dbId)"

# 5. Deploy ---------------------------------------------------------------------------------
Step 5 'Putting the service online'
function Deploy-Capture { $d = Wrangler @('deploy') -Capture -NoPrompt; if ($d.Code -ne 0) { return @{ Url = $null; Text = $d.Text } }; @{ Url = (Find-Url $d.Text); Text = $d.Text } }
$dep = Deploy-Capture
if (-not $dep.Url) {
  Say '      Cloudflare needs a name for your workers.dev address. Answer its question below.' 'Yellow'
  & npx --yes wrangler deploy
  $dep = Deploy-Capture
}
if (-not $dep.Url) { Say $dep.Text; Fail 'Deploying to Cloudflare failed.' }
$Url = $dep.Url.TrimEnd('/')
Done "Online at $Url"

# 6. Modrinth application -------------------------------------------------------------------
Step 6 'Connecting Modrinth sign-in'
$clientId = Get-TomlValue 'MODRINTH_CLIENT_ID'
$secrets = Find-Json (Wrangler @('secret', 'list', '--format', 'json') -Capture -NoPrompt).Text '[' ']'
$hasSecret = [bool]($secrets | Where-Object { $_.name -eq 'MODRINTH_CLIENT_SECRET' })
if ($clientId -match 'REPLACE' -or -not $clientId -or -not $hasSecret) {
  $redirect = "$Url/auth/callback"
  try { Set-Clipboard -Value $redirect } catch { }
  Say ''
  Say '      Modrinth is opening in your browser. Click "New application" and fill in:' 'Yellow'
  Say '        Name:          VEX CLIENT' 'White'
  Say "        Redirect URI:  $redirect   (already copied - just paste it)" 'White'
  Say '        Scopes:        only "Read user data"' 'White'
  Say '      Click Save. You will see a Client ID and a Client Secret.' 'Yellow'
  try { Start-Process 'https://modrinth.com/settings/applications' } catch { }
  do {
    $clientId = (Read-Host '      Paste the Client ID here and press Enter').Trim()
    if ($clientId -notmatch '^[A-Za-z0-9_-]{4,64}$') { Say '      That does not look like a Client ID - copy it again from Modrinth.' 'Red' }
  } until ($clientId -match '^[A-Za-z0-9_-]{4,64}$')
  Set-TomlValue 'MODRINTH_CLIENT_ID' $clientId
  Say ''
  Say '      Now paste the Client SECRET when asked below (it stays hidden, and only goes to Cloudflare).' 'Yellow'
  & npx --yes wrangler secret put MODRINTH_CLIENT_SECRET
  if ($LASTEXITCODE -ne 0) { Fail 'Saving the Modrinth secret failed.' }
  $dep = Deploy-Capture
  if (-not $dep.Url) { Say $dep.Text; Fail 'Redeploying with your Modrinth app failed.' }
}
Done "Modrinth app $clientId connected"

# 7. Check ----------------------------------------------------------------------------------
Step 7 'Checking it works'
$ok = $false
for ($i = 0; $i -lt 6 -and -not $ok; $i++) {
  $checkUrl = if ($env:VEX_SETUP_TEST_HEALTH) { $env:VEX_SETUP_TEST_HEALTH } else { "$Url/" }   # test hook only
  try { $h = Invoke-RestMethod -Uri $checkUrl -TimeoutSec 15; $ok = ($h.service -eq 'vex-online') } catch { Start-Sleep -Seconds 3 }
}
if (-not $ok) { Fail "The service at $Url did not answer. Wait a minute and run the setup again." }
Done 'Service answers'

# 8. Point VEX at it ------------------------------------------------------------------------
Step 8 'Connecting VEX CLIENT'
$appData = if ($env:APPDATA) { $env:APPDATA } else { Join-Path $HOME '.config' }
$settingsFile = Join-Path (Join-Path $appData 'VEX CLIENT') 'settings.json'
$running = Get-Process -Name 'VEX CLIENT' -ErrorAction SilentlyContinue
if ($running) {
  Say '      VEX CLIENT is open. It will be closed so the new setting is not overwritten.' 'Yellow'
  $running | Stop-Process -Force; Start-Sleep -Seconds 2
}
$settings = $null
if (Test-Path -LiteralPath $settingsFile) { try { $settings = [IO.File]::ReadAllText($settingsFile) | ConvertFrom-Json } catch { $settings = $null } }
if (-not $settings) { $settings = New-Object PSObject -Property @{ schemaVersion = 2 }; New-Item -ItemType Directory -Force -Path (Split-Path $settingsFile) | Out-Null }
$settings | Add-Member -NotePropertyName onlineServiceUrl -NotePropertyValue $Url -Force
[IO.File]::WriteAllText($settingsFile, ($settings | ConvertTo-Json -Depth 20), $Utf8)
[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'vex-online-url.txt'), $Url, $Utf8)
Done 'VEX will use your service'

Write-Host ''
Write-Host '  All done!' -ForegroundColor Green
Write-Host "  Your VEX online address:  $Url" -ForegroundColor White
Write-Host '  Open VEX CLIENT -> Friends -> "Sign in with Modrinth".' -ForegroundColor Gray
Write-Host '  Send the address above (NOT the secret) to Claude to build it into VEX for your friends.' -ForegroundColor Gray
if (-not $env:VEX_SETUP_NO_PAUSE) { Read-Host '  Press Enter to close' | Out-Null }
