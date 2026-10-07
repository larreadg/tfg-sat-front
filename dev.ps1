#Requires -Version 5.1
<#
    tfg-sat-front - Dev server sobre HTTPS con la IP local
    ------------------------------------------------------
    Levanta SOLO el frontend (sin tunel, sin tocar el backend):
      1. Detecta la IP local actual (Wi-Fi / conexion activa)
      2. Genera un certificado para esa IP si falta (mkcert si esta instalado,
         si no openssl autofirmado) en `certs/`
      3. Ajusta `angular.json` (allowedHosts + ssl) y el `apiUrl` de
         `environment.development.ts` para apuntar al backend local
      4. Corre `ng serve` en primer plano -> https://<IP>:4200

    Uso (desde tfg-sat-front/):
      npm run dev
      .\dev.ps1 -Ip 192.168.1.50           fuerza una IP concreta
      .\dev.ps1 -Puerto 4300               otro puerto
      .\dev.ps1 -ApiUrl https://otro:3000  apunta el front a otra API
      .\dev.ps1 -SinTocarApi               deja el apiUrl como esta
      .\dev.ps1 -Regenerar                 fuerza un certificado nuevo

    Ctrl+C corta el server.
#>

[CmdletBinding()]
param(
    [string]$Ip,
    [int]$Puerto = 4200,
    [string]$ApiUrl,
    [switch]$SinTocarApi,
    [switch]$Regenerar
)

$ErrorActionPreference = 'Stop'

# --- Rutas -----------------------------------------------------------
$FrontDir    = $PSScriptRoot
$CertsDir    = Join-Path $FrontDir 'certs'
$CertFile    = Join-Path $CertsDir 'cert.pem'
$KeyFile     = Join-Path $CertsDir 'key.pem'
$CertMarker  = Join-Path $CertsDir '.cert-ip'
$AngularJson = Join-Path $FrontDir 'angular.json'
$EnvDevTs    = Join-Path $FrontDir 'src\environments\environment.development.ts'
$BackEnv     = Join-Path (Split-Path $FrontDir -Parent) 'tfg-sat-back\.env'

function Write-Step { param($msg) Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok   { param($msg) Write-Host "    $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "    $msg" -ForegroundColor Yellow }
function Write-Err  { param($msg) Write-Host "    $msg" -ForegroundColor Red }

# UTF-8 sin BOM: TypeScript y JSON no lo toleran bien.
function Set-TextNoBom {
    param([string]$Path, [string]$Text)
    [IO.File]::WriteAllText($Path, $Text, (New-Object Text.UTF8Encoding($false)))
}

function Get-LocalIp {
    # Wi-Fi primero: es la red por la que se prueba desde el celular.
    $wifi = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.InterfaceAlias -match 'Wi-?Fi|Wireless|WLAN|Inalambrica' -and $_.IPAddress -notmatch '^169\.254' } |
        Select-Object -First 1
    if ($wifi) { return $wifi.IPAddress }

    $cfg = Get-NetIPConfiguration -ErrorAction SilentlyContinue |
        Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } |
        Select-Object -First 1
    if ($cfg) { return $cfg.IPv4Address.IPAddress }

    $ip = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -match '^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)' } |
        Select-Object -First 1
    if ($ip) { return $ip.IPAddress }
    return $null
}

# openssl no suele estar en el PATH de PowerShell, pero viene con Git for Windows.
function Find-OpenSsl {
    $cmd = Get-Command openssl -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $candidatos = @(
        "$env:ProgramFiles\Git\usr\bin\openssl.exe",
        "$env:ProgramFiles\Git\mingw64\bin\openssl.exe",
        "$env:LOCALAPPDATA\Programs\Git\usr\bin\openssl.exe",
        "$env:LOCALAPPDATA\Programs\Git\mingw64\bin\openssl.exe"
    )
    foreach ($c in $candidatos) { if (Test-Path $c) { return $c } }
    return $null
}

<#
    Genera cert.pem/key.pem para la IP en `certs/`. Prefiere mkcert: firma con
    una CA local ya confiada, asi el navegador no muestra la advertencia. Si no
    esta, cae a un autofirmado con openssl (hay que aceptar la excepcion una vez).
    Devuelve el texto que describe la herramienta usada.
#>
function New-CertificadoDev {
    param([string]$Direccion)

    $tmp = Join-Path $env:TEMP ("tfg-front-cert-" + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Force -Path $tmp | Out-Null

    # mkcert y openssl escriben en stderr; con EAP='Stop' eso abortaria el script.
    $oldEAP = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        if (Get-Command mkcert -ErrorAction SilentlyContinue) {
            & mkcert -install 2>&1 | Out-Null   # idempotente
            Push-Location $tmp
            & mkcert -key-file key.pem -cert-file cert.pem $Direccion localhost 127.0.0.1 ::1 2>&1 | Out-Null
            Pop-Location
            $origen = 'mkcert (CA local confiada: sin advertencia en el navegador)'
        } else {
            $openssl = Find-OpenSsl
            if (-not $openssl) {
                throw 'No encontre mkcert ni openssl. Instala uno: choco install mkcert (o usa el openssl de Git for Windows).'
            }
            & $openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 365 `
                -keyout (Join-Path $tmp 'key.pem') -out (Join-Path $tmp 'cert.pem') `
                -subj "/CN=$Direccion" `
                -addext "subjectAltName=IP:$Direccion,DNS:localhost,IP:127.0.0.1" 2>&1 | Out-Null
            $origen = 'openssl (autofirmado: el navegador pide aceptar la excepcion una vez)'
        }
    } finally {
        $ErrorActionPreference = $oldEAP
    }

    if (-not (Test-Path (Join-Path $tmp 'cert.pem')) -or -not (Test-Path (Join-Path $tmp 'key.pem'))) {
        Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
        throw 'La herramienta no genero el certificado.'
    }

    New-Item -ItemType Directory -Force -Path $CertsDir | Out-Null
    Copy-Item (Join-Path $tmp 'cert.pem') $CertFile -Force
    Copy-Item (Join-Path $tmp 'key.pem')  $KeyFile  -Force
    Remove-Item $tmp -Recurse -Force
    Set-Content $CertMarker $Direccion -NoNewline -Encoding ascii

    return $origen
}

Write-Host ""
Write-Host "  tfg-sat-front - dev server (HTTPS)" -ForegroundColor Magenta
Write-Host "  ==================================" -ForegroundColor Magenta
Write-Host ""

# --- 1. IP local ------------------------------------------------------
Write-Step "Detectando IP local..."
$IP = if ($Ip) { $Ip } else { Get-LocalIp }
if (-not $IP) {
    Write-Warn "No se pudo detectar la IP automaticamente."
    $IP = Read-Host "    Ingresa tu IP local manualmente"
}
if (-not $IP) { Write-Err "Sin IP, abortando."; exit 1 }
Write-Ok "IP: $IP"

# --- 2. Certificado ---------------------------------------------------
Write-Step "Verificando certificado para $IP..."
$certOk = (-not $Regenerar) -and
          (Test-Path $CertFile) -and (Test-Path $KeyFile) -and
          (Test-Path $CertMarker) -and ((Get-Content $CertMarker -Raw).Trim() -eq $IP)

if ($certOk) {
    Write-Ok "Certificado existente valido para $IP. Se reutiliza."
} else {
    Write-Warn "Generando certificado nuevo..."
    $origen = New-CertificadoDev -Direccion $IP
    Write-Ok "Certificado generado con $origen"
    Write-Ok "certs/cert.pem + certs/key.pem"
}

# --- 3. angular.json: allowedHosts + ssl ------------------------------
Write-Step "Ajustando angular.json..."
if (Test-Path $AngularJson) {
    $texto = [IO.File]::ReadAllText($AngularJson)
    $lista = '"' + (@($IP, 'localhost', '127.0.0.1') -join '", "') + '"'
    $texto = [regex]::Replace($texto, '"allowedHosts":\s*\[[^\]]*\]', ('"allowedHosts": [' + $lista + ']'))
    $texto = [regex]::Replace($texto, '"ssl":\s*(true|false)', '"ssl": true')
    Set-TextNoBom -Path $AngularJson -Text $texto
    Write-Ok "allowedHosts = [$lista], ssl = true"
} else {
    Write-Warn "No existe $AngularJson (raro); se omite."
}

# --- 4. apiUrl del front ----------------------------------------------
if ($SinTocarApi) {
    Write-Step "apiUrl sin tocar (-SinTocarApi)."
} else {
    $url = if ($ApiUrl) { $ApiUrl.TrimEnd('/') } else { "https://${IP}:3000" }
    Write-Step "Apuntando el front a $url ..."
    if (Test-Path $EnvDevTs) {
        $texto = [IO.File]::ReadAllText($EnvDevTs)
        if ($texto -match "apiUrl:\s*'[^']*'") {
            $texto = [regex]::Replace($texto, "apiUrl:\s*'[^']*'", "apiUrl: '$url'")
            Set-TextNoBom -Path $EnvDevTs -Text $texto
            Write-Ok "apiUrl = $url"
        } else {
            Write-Warn "No encontre apiUrl en environment.development.ts"
        }
    } else {
        Write-Warn "No existe $EnvDevTs; se omite."
    }
}

# --- 5. Chequeo (solo aviso) de la config del backend -----------------
# Este script no toca el backend a proposito. Si el CORS no coincide, el front
# levanta igual pero cada request muere en el navegador: mejor avisarlo aca.
if (-not $SinTocarApi -and -not $ApiUrl) {
    $origenEsperado = "https://${IP}:$Puerto"
    if (Test-Path $BackEnv) {
        $envBack = [IO.File]::ReadAllText($BackEnv)
        $m = [regex]::Match($envBack, '(?m)^\s*CORS_ORIGIN\s*=\s*"?([^"\r\n]*)"?\s*$')
        $corsActual = if ($m.Success) { $m.Groups[1].Value.Trim() } else { '' }
        if ($corsActual -ne $origenEsperado) {
            Write-Warn "El backend tiene CORS_ORIGIN=$corsActual y el front va a servir en $origenEsperado."
            Write-Warn "Ajusta CORS_ORIGIN en tfg-sat-back\.env (y reinicia el back) o las requests van a fallar."
        }
    } else {
        Write-Warn "No encontre tfg-sat-back\.env: no puedo verificar el CORS del backend."
    }
}

# --- 6. ng serve en primer plano --------------------------------------
Write-Host ""
Write-Host "  Front:  https://${IP}:$Puerto" -ForegroundColor Magenta
Write-Host "          https://localhost:$Puerto" -ForegroundColor DarkGray
Write-Host "  Ctrl+C para cortar." -ForegroundColor DarkGray
Write-Host ""

Push-Location $FrontDir
try {
    & npx ng serve --host 0.0.0.0 --port $Puerto --ssl --ssl-cert 'certs/cert.pem' --ssl-key 'certs/key.pem'
} finally {
    Pop-Location
}
