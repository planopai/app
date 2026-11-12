# =====================================================================
# Central das TVs - Plano PAI (12/11/2026)
# Controla pelo PC as TVs Android das salas (SALA 01/02/03 e PAINEL 01/02/03) usando o ADB pela rede.
#
# Como usar: dê dois cliques em "Abrir Central das TVs.bat". O navegador abre em http://localhost:8790
# - Acha as TVs sozinha na rede (porta 5555) e mostra pelo NOME de cada uma (o IP pode mudar: tudo bem).
# - Volume (+, -, mudo, valor exato), ligar/desligar a tela, abrir o TV Bro, abrir/recarregar a página, print, reiniciar.
# - Lembra das TVs já vistas (tvs-conhecidas.json): TV desligada continua na tela e pode ser ligada pela rede
#   (Wake-on-LAN), se a TV tiver "ligar pela rede / Wi-Fi em espera".
# Só funciona neste PC (o painel só atende em localhost) e só com TVs que já autorizaram este PC
# ("Permitir depuração" > "Sempre permitir deste computador").
#
# Requisitos: Windows 10/11 com PowerShell 5.1 (já vem no Windows) e o adb.exe (Platform-Tools).
# Por padrão procura o adb em C:\adb\adb.exe; para usar outro lugar, edite $AdbPath abaixo.
# =====================================================================

$ErrorActionPreference = 'Stop'
$Porta    = 8790
$AdbPath  = 'C:\adb\adb.exe'
$Pasta    = Split-Path -Parent $MyInvocation.MyCommand.Path
$Config   = Join-Path $Pasta 'tvs.json'          # nomes e endereços das páginas de cada TV (criado na 1ª vez)
$Prints   = Join-Path $Pasta 'prints'
$Conhecidas = Join-Path $Pasta 'tvs-conhecidas.json'   # nome, último IP e MAC de cada TV já encontrada
$PacoteTvBro = 'com.phlox.tvwebbrowser'                # navegador TV Bro (o pacote é confirmado em cada TV)

if (-not (Test-Path $AdbPath)) {
    $achado = Get-Command adb.exe -ErrorAction SilentlyContinue
    if ($achado) { $AdbPath = $achado.Source }
    else {
        Write-Host ""
        Write-Host "  Não encontrei o adb.exe em C:\adb." -ForegroundColor Red
        Write-Host "  Baixe o Platform-Tools (developer.android.com/tools/releases/platform-tools)," -ForegroundColor Yellow
        Write-Host "  descompacte em C:\adb e abra a Central de novo." -ForegroundColor Yellow
        Read-Host "  Aperte Enter para fechar"
        exit 1
    }
}
if (-not (Test-Path $Prints)) { New-Item -ItemType Directory -Path $Prints | Out-Null }

# ---------------------------------------------------------------------
# Páginas de cada TV (para o botão "Abrir página"). Edite tvs.json se mudar algum endereço.
# ---------------------------------------------------------------------
if (-not (Test-Path $Config)) {
    $padrao = [ordered]@{
        'SALA 01'   = 'https://planoassistencialintegrado.com.br/mensagens-tv/'
        'SALA 02'   = 'https://planoassistencialintegrado.com.br/mensagens-tv-sala-02/'
        'SALA 03'   = 'https://planoassistencialintegrado.com.br/mensagens-tv-sala-03/'
        'PAINEL 01' = 'https://planoassistencialintegrado.com.br/painel-01/'
        'PAINEL 02' = 'https://planoassistencialintegrado.com.br/painel-02/'
        'PAINEL 03' = 'https://planoassistencialintegrado.com.br/painel-03/'
    }
    ($padrao | ConvertTo-Json) | Out-File -FilePath $Config -Encoding UTF8
}
function Ler-Paginas {
    try {
        $j = Get-Content -Path $Config -Raw -Encoding UTF8 | ConvertFrom-Json
        $h = @{}
        foreach ($p in $j.PSObject.Properties) { $h[$p.Name.ToUpper().Trim()] = [string]$p.Value }
        return $h
    } catch { return @{} }
}

# ---------------------------------------------------------------------
# ADB
# ---------------------------------------------------------------------
function Adb {
    param([string[]]$Argumentos, [int]$TempoMs = 8000)
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $AdbPath
    $psi.Arguments = ($Argumentos | ForEach-Object { if ($_ -match '[\s"]') { '"' + ($_ -replace '"', '\"') + '"' } else { $_ } }) -join ' '
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true
    $p = [System.Diagnostics.Process]::Start($psi)
    $saidaTask = $p.StandardOutput.ReadToEndAsync()
    $erroTask = $p.StandardError.ReadToEndAsync()
    if (-not $p.WaitForExit($TempoMs)) { try { $p.Kill() } catch {} ; return 'TEMPO_ESGOTADO' }
    return ($saidaTask.Result + $erroTask.Result).Trim()
}

function Rede-Base {
    # Pega a faixa 192.168.x. do Wi-Fi/rede em uso (a que tem gateway).
    $cfg = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -ne $null -and $_.NetAdapter.Status -eq 'Up' } | Select-Object -First 1
    if (-not $cfg) { return $null }
    $ip = ($cfg.IPv4Address | Select-Object -First 1).IPAddress
    $partes = $ip.Split('.')
    return @{ Base = "$($partes[0]).$($partes[1]).$($partes[2])."; Meu = $ip }
}

function Procurar-Portas([string]$Base, [int]$PortaTv) {
    # Testa todos os endereços da rede ao mesmo tempo (leva ~1,5 s).
    $testes = @()
    for ($i = 1; $i -le 254; $i++) {
        $c = New-Object System.Net.Sockets.TcpClient
        $testes += [pscustomobject]@{ Ip = "$Base$i"; Cliente = $c; Tarefa = $c.ConnectAsync("$Base$i", $PortaTv) }
    }
    try { [System.Threading.Tasks.Task]::WaitAll([System.Threading.Tasks.Task[]]($testes.Tarefa), 1500) | Out-Null } catch {}
    $abertos = @()
    foreach ($t in $testes) {
        if ($t.Tarefa.Status -eq 'RanToCompletion' -and $t.Cliente.Connected) { $abertos += $t.Ip }
        try { $t.Cliente.Close() } catch {}
    }
    return $abertos
}

function Ler-Conhecidas {
    try {
        $j = Get-Content -Path $Conhecidas -Raw -Encoding UTF8 | ConvertFrom-Json
        $h = @{}
        foreach ($p in $j.PSObject.Properties) { $h[$p.Name] = $p.Value }
        return $h
    } catch { return @{} }
}
function Gravar-Conhecidas($H) {
    try { ($H | ConvertTo-Json -Depth 4) | Out-File -FilePath $Conhecidas -Encoding UTF8 } catch {}
}

function Mac-Da-Tv([string]$Alvo) {
    foreach ($ifc in 'wlan0', 'eth0') {
        $m = Adb @('-s', $Alvo, 'shell', 'cat', "/sys/class/net/$ifc/address") 4000
        if ($m -match '^([0-9a-f]{2}:){5}[0-9a-f]{2}$' -and $m -ne '00:00:00:00:00:00' -and $m -ne '02:00:00:00:00:00') { return $m.Trim() }
    }
    return ''
}

function Pacote-Navegador([string]$Alvo) {
    $lista = Adb @('-s', $Alvo, 'shell', 'pm', 'list', 'packages') 6000
    if ($lista -match "package:($([regex]::Escape($PacoteTvBro)))\b") { return $PacoteTvBro }
    foreach ($linha in ($lista -split "`n")) {
        if ($linha -match 'package:(\S*(tvbro|tvwebbrowser)\S*)') { return $Matches[1].Trim() }
    }
    return ''
}

function Acordar-Pela-Rede([string]$Mac, [string]$Ip) {
    # Wake-on-LAN: "pacote mágico" (6x FF + 16x o MAC) para a rede inteira.
    $bytesMac = $Mac -split '[:-]' | ForEach-Object { [Convert]::ToByte($_, 16) }
    $lista = New-Object System.Collections.Generic.List[byte]
    for ($i = 0; $i -lt 6; $i++) { $lista.Add(0xFF) }
    for ($i = 0; $i -lt 16; $i++) { foreach ($b in $bytesMac) { $lista.Add([byte]$b) } }
    $pacote = $lista.ToArray()
    $udp = New-Object System.Net.Sockets.UdpClient
    $udp.EnableBroadcast = $true
    $destinos = @('255.255.255.255')
    if ($Ip -match '^(\d+\.\d+\.\d+)\.\d+$') { $destinos += "$($Matches[1]).255" }
    foreach ($d in $destinos) { foreach ($porta in 9, 7) { for ($i = 0; $i -lt 3; $i++) { [void]$udp.Send($pacote, $pacote.Length, $d, $porta) } } }
    $udp.Close()
}

$script:TVs = @()     # lista atual: Nome, Ip, Status, Volume, VolumeMax, Tela
$script:UltimaBusca = $null

function Info-Tv([string]$Alvo) {
    $nome = Adb @('-s', $Alvo, 'shell', 'settings', 'get', 'global', 'device_name') 4000
    if ($nome -match 'unauthorized') { return @{ Status = 'nao_autorizada'; Nome = '' } }
    if ($nome -match 'offline|TEMPO_ESGOTADO|error|not found') { return @{ Status = 'offline'; Nome = '' } }
    if (-not $nome -or $nome -eq 'null') { $nome = Adb @('-s', $Alvo, 'shell', 'getprop', 'ro.product.model') 4000 }
    $tela = Adb @('-s', $Alvo, 'shell', 'dumpsys', 'power') 5000
    $ligada = $null
    if ($tela -match 'mWakefulness=(\w+)') { $ligada = ($Matches[1] -eq 'Awake') }
    $vol = Ler-Volume $Alvo
    return @{ Status = 'ok'; Nome = $nome.Trim(); Tela = $ligada; Volume = $vol.Atual; VolumeMax = $vol.Max }
}

function Ler-Volume([string]$Alvo) {
    $s = Adb @('-s', $Alvo, 'shell', 'cmd', 'media_session', 'volume', '--stream', '3', '--get') 4000
    if ($s -match 'volume is (\d+) in range \[(\d+)\.\.(\d+)\]') { return @{ Atual = [int]$Matches[1]; Max = [int]$Matches[3] } }
    $s = Adb @('-s', $Alvo, 'shell', 'media', 'volume', '--stream', '3', '--get') 4000
    if ($s -match 'volume is (\d+) in range \[(\d+)\.\.(\d+)\]') { return @{ Atual = [int]$Matches[1]; Max = [int]$Matches[3] } }
    # TVs TCL (painéis) não respondem aos comandos acima: lê do relatório de áudio do Android.
    $d = Adb @('-s', $Alvo, 'shell', 'dumpsys', 'audio') 6000
    $bloco = [regex]::Match($d, '(?s)- STREAM_MUSIC:(.*?)(- STREAM_|\z)')
    if ($bloco.Success) {
        $b = $bloco.Groups[1].Value
        $max = $null; $atual = $null
        if ($b -match 'Max:\s*(\d+)') { $max = [int]$Matches[1] }
        if ($b -match 'streamVolume:\s*(\d+)') { $atual = [int]$Matches[1] }
        elseif ($b -match 'Current:[^\r\n]*?\(speaker\):\s*(\d+)') { $atual = [int]$Matches[1] }
        elseif ($b -match 'Current:[^\r\n]*?\):\s*(\d+)') { $atual = [int]$Matches[1] }
        if ($max -ne $null -and $atual -ne $null) {
            # O relatório guarda o volume x10 em alguns Androids antigos.
            if ($atual -gt $max -and ($atual % 10) -eq 0) { $atual = [int]($atual / 10) }
            return @{ Atual = $atual; Max = $max }
        }
    }
    return @{ Atual = $null; Max = $null }
}

function Buscar-TVs {
    $rede = Rede-Base
    if (-not $rede) { return @{ erro = 'O PC não está conectado em nenhuma rede.' } }
    $ips = Procurar-Portas $rede.Base 5555
    $lista = @()
    foreach ($ip in $ips) {
        $alvo = "${ip}:5555"
        Adb @('connect', $alvo) 5000 | Out-Null
        $info = Info-Tv $alvo
        $nome = $(if ($info.Nome) { $info.Nome } else { $ip })
        $mac = ''
        $nav = ''
        if ($info.Status -eq 'ok') {
            $mac = Mac-Da-Tv $alvo
            $nav = Pacote-Navegador $alvo
            $conh = Ler-Conhecidas
            $antes = $conh[$nome]
            if (-not $mac -and $antes) { $mac = [string]$antes.mac }
            $conh[$nome] = @{ ip = $ip; mac = $mac; navegador = $nav; visto = (Get-Date -Format 'dd/MM/yyyy HH:mm') }
            Gravar-Conhecidas $conh
        }
        $lista += [pscustomobject]@{
            nome = $nome
            ip = $ip
            status = $info.Status
            tela = $info.Tela
            volume = $info.Volume
            volumeMax = $info.VolumeMax
            mac = $mac
            navegador = $nav
            visto = ''
        }
    }
    # TVs que já apareceram antes e agora não responderam (desligadas ou fora do Wi-Fi).
    $conh = Ler-Conhecidas
    foreach ($nome in $conh.Keys) {
        if (-not ($lista | Where-Object { $_.nome -eq $nome })) {
            $c = $conh[$nome]
            $lista += [pscustomobject]@{
                nome = $nome; ip = [string]$c.ip; status = 'fora_da_rede'; tela = $false; volume = $null; volumeMax = $null
                mac = [string]$c.mac; navegador = [string]$c.navegador; visto = [string]$c.visto
            }
        }
    }
    $script:TVs = @($lista | Sort-Object nome)
    $script:UltimaBusca = Get-Date
    return @{ rede = $rede.Base + 'x'; pc = $rede.Meu; tvs = $script:TVs; hora = (Get-Date -Format 'HH:mm:ss') }
}

function Tv-Por-Ip([string]$Ip) {
    foreach ($t in $script:TVs) { if ($t.ip -eq $Ip) { return $t } }
    return $null
}

function Executar([string]$Ip, [string]$Acao, [string]$Valor) {
    $tv = Tv-Por-Ip $Ip
    if (-not $tv) { return @{ ok = $false; msg = 'TV não encontrada. Clique em "Procurar TVs".' } }
    $alvo = "${Ip}:5555"
    if ($tv.status -ne 'ok' -and $Acao -ne 'ligar') {
        return @{ ok = $false; msg = 'A TV está fora da rede (desligada ou sem Wi-Fi). Use "Ligar" ou ligue pelo controle e clique em Procurar TVs.' }
    }
    if ($Acao -eq 'ligar' -and $tv.status -ne 'ok') {
        if (-not $tv.mac) { return @{ ok = $false; msg = 'Não sei o endereço físico (MAC) desta TV para ligar pela rede. Ligue pelo controle uma vez com a Central aberta e clique em Procurar TVs.' } }
        Acordar-Pela-Rede $tv.mac $tv.ip
        return @{ ok = $true; tv = $tv; msg = 'Pedido de ligar enviado pela rede. Se a TV aceitar, ela aparece em até 1 minuto: clique em Procurar TVs.' }
    }
    $teclas = @{
        'vol_mais' = 'KEYCODE_VOLUME_UP'; 'vol_menos' = 'KEYCODE_VOLUME_DOWN'; 'mudo' = 'KEYCODE_VOLUME_MUTE'
        'ligar' = 'KEYCODE_WAKEUP'; 'desligar' = 'KEYCODE_SLEEP'; 'voltar' = 'KEYCODE_BACK'; 'inicio' = 'KEYCODE_HOME'
        'recarregar' = 'KEYCODE_F5'
    }
    $saida = ''
    switch ($Acao) {
        { $teclas.ContainsKey($_) } { $saida = Adb @('-s', $alvo, 'shell', 'input', 'keyevent', $teclas[$Acao]) }
        'volume' {
            $n = 0
            if (-not [int]::TryParse($Valor, [ref]$n)) { return @{ ok = $false; msg = 'Volume inválido.' } }
            $saida = Adb @('-s', $alvo, 'shell', 'cmd', 'media_session', 'volume', '--stream', '3', '--set', [string]$n)
            if ($saida -match 'Unknown|Error|not found') { $saida = Adb @('-s', $alvo, 'shell', 'media', 'volume', '--stream', '3', '--set', [string]$n) }
            $agora = Ler-Volume $alvo
            if ($agora.Atual -ne $null -and $agora.Atual -ne $n) {
                # Não obedeceu ao valor direto (TCL): chega lá apertando Vol+/Vol- quantas vezes precisar.
                for ($volta = 0; $volta -lt 3 -and $agora.Atual -ne $n; $volta++) {
                    $dif = $n - $agora.Atual
                    $tecla = $(if ($dif -gt 0) { '24' } else { '25' })
                    $qtd = [Math]::Min([Math]::Abs($dif), 40)
                    Adb (@('-s', $alvo, 'shell', 'input', 'keyevent') + (@($tecla) * $qtd)) 15000 | Out-Null
                    $agora = Ler-Volume $alvo
                }
            }
            $saida = ''
        }
        'tvbro' {
            $pac = $tv.navegador
            if (-not $pac) { $pac = Pacote-Navegador $alvo; $tv.navegador = $pac }
            if (-not $pac) { return @{ ok = $false; msg = 'O TV Bro não está instalado nesta TV.' } }
            $saida = Adb @('-s', $alvo, 'shell', 'monkey', '-p', $pac, '-c', 'android.intent.category.LAUNCHER', '1')
            if ($saida -match 'No activities found|aborted') { return @{ ok = $false; msg = "Não consegui abrir o TV Bro ($saida)." } }
            $saida = ''
        }
        'abrir_pagina' {
            $paginas = Ler-Paginas
            $url = $paginas[$tv.nome.ToUpper().Trim()]
            if (-not $url) { return @{ ok = $false; msg = "Sem endereço para '$($tv.nome)' no arquivo tvs.json." } }
            $pac = $tv.navegador
            if (-not $pac) { $pac = Pacote-Navegador $alvo; $tv.navegador = $pac }
            if ($pac) {
                # Abre o endereço dentro do TV Bro (o navegador das TVs).
                $saida = Adb @('-s', $alvo, 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', $url, '-p', $pac)
                if ($saida -match 'Error|unable to resolve') { $saida = Adb @('-s', $alvo, 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', $url) }
            } else {
                $saida = Adb @('-s', $alvo, 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', $url)
            }
            if ($saida -match 'Error') { return @{ ok = $false; msg = "Não consegui abrir a página ($saida)." } }
            $saida = ''
        }
        'reiniciar' { $saida = Adb @('-s', $alvo, 'reboot') 6000 }
        default { return @{ ok = $false; msg = 'Ação desconhecida.' } }
    }
    if ($saida -match 'TEMPO_ESGOTADO|error:|offline|unauthorized') { return @{ ok = $false; msg = "A TV não respondeu ($saida)." } }
    Start-Sleep -Milliseconds 250
    $vol = Ler-Volume $alvo
    $tv.volume = $vol.Atual; $tv.volumeMax = $vol.Max
    if ($Acao -eq 'ligar') { $tv.tela = $true }
    if ($Acao -eq 'desligar') { $tv.tela = $false }
    return @{ ok = $true; tv = $tv }
}

function Tirar-Print([string]$Ip) {
    if (-not (Tv-Por-Ip $Ip)) { return $null }
    $arq = Join-Path $Prints ("tv_" + ($Ip -replace '\.', '_') + '.png')
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $AdbPath
    $psi.Arguments = "-s ${Ip}:5555 exec-out screencap -p"
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.CreateNoWindow = $true
    $p = [System.Diagnostics.Process]::Start($psi)
    $ms = New-Object System.IO.MemoryStream
    $copia = $p.StandardOutput.BaseStream.CopyToAsync($ms)
    if (-not $p.WaitForExit(15000)) { try { $p.Kill() } catch {}; return $null }
    $copia.Wait(3000) | Out-Null
    $bytes = $ms.ToArray()
    # TVs TCL escrevem avisos ("Init wrapper sys mutex...") antes da imagem: corta tudo antes do início do PNG.
    $ini = -1
    for ($i = 0; $i -lt [Math]::Min($bytes.Length - 4, 4096); $i++) {
        if ($bytes[$i] -eq 0x89 -and $bytes[$i + 1] -eq 0x50 -and $bytes[$i + 2] -eq 0x4E -and $bytes[$i + 3] -eq 0x47) { $ini = $i; break }
    }
    if ($ini -lt 0) { return $null }
    if ($ini -gt 0) { $bytes = [byte[]]$bytes[$ini..($bytes.Length - 1)] }
    if ($bytes.Length -lt 100) { return $null }
    [System.IO.File]::WriteAllBytes($arq, $bytes)
    return $bytes
}

# ---------------------------------------------------------------------
# Servidor da página (só localhost)
# ---------------------------------------------------------------------
function Responder($Ctx, [int]$Codigo, [string]$Tipo, [byte[]]$Corpo) {
    $r = $Ctx.Response
    $r.StatusCode = $Codigo
    $r.ContentType = $Tipo
    $r.Headers.Add('Cache-Control', 'no-store')
    $r.ContentLength64 = $Corpo.Length
    $r.OutputStream.Write($Corpo, 0, $Corpo.Length)
    $r.OutputStream.Close()
}
function Json($Ctx, $Obj) {
    $t = $Obj | ConvertTo-Json -Depth 6 -Compress
    Responder $Ctx 200 'application/json; charset=utf-8' ([System.Text.Encoding]::UTF8.GetBytes($t))
}

$HtmlArq = Join-Path $Pasta 'central-tvs.html'
$ouvinte = New-Object System.Net.HttpListener
$ouvinte.Prefixes.Add("http://localhost:$Porta/")
try { $ouvinte.Start() } catch {
    Write-Host "  A porta $Porta já está em uso (a Central já está aberta?)." -ForegroundColor Yellow
    Start-Process "http://localhost:$Porta/"
    exit 0
}

Write-Host ""
Write-Host "  Central das TVs - Plano PAI" -ForegroundColor Yellow
Write-Host "  Aberta em http://localhost:$Porta  (deixe esta janela aberta; feche para encerrar)"
Write-Host ""
Start-Process "http://localhost:$Porta/"

while ($ouvinte.IsListening) {
    $ctx = $ouvinte.GetContext()
    try {
        $req = $ctx.Request
        $caminho = $req.Url.AbsolutePath
        $q = $req.QueryString
        # Aceita só pedidos da própria máquina e da própria página (evita outro site mandar comandos).
        if (-not $req.IsLocal) { Responder $ctx 403 'text/plain' ([byte[]]@()); continue }
        if ($caminho -ne '/' -and $req.Headers['X-Central'] -ne '1' -and $caminho -notlike '/print*') {
            Responder $ctx 403 'text/plain' ([System.Text.Encoding]::UTF8.GetBytes('proibido')); continue
        }
        switch -Wildcard ($caminho) {
            '/' {
                $html = [System.IO.File]::ReadAllBytes($HtmlArq)
                Responder $ctx 200 'text/html; charset=utf-8' $html
            }
            '/api/buscar' {
                Write-Host "  $(Get-Date -Format 'HH:mm:ss')  procurando TVs..."
                Json $ctx (Buscar-TVs)
            }
            '/api/acao' {
                if ($req.HttpMethod -ne 'POST') { Responder $ctx 405 'text/plain' ([byte[]]@()); break }
                $ip = [string]$q['ip']; $acao = [string]$q['acao']; $valor = [string]$q['valor']
                if ($ip -notmatch '^\d{1,3}(\.\d{1,3}){3}$') { Json $ctx @{ ok = $false; msg = 'IP inválido.' }; break }
                Write-Host "  $(Get-Date -Format 'HH:mm:ss')  $acao $valor -> $ip"
                Json $ctx (Executar $ip $acao $valor)
            }
            '/print*' {
                $ip = [string]$q['ip']
                if ($ip -notmatch '^\d{1,3}(\.\d{1,3}){3}$') { Responder $ctx 400 'text/plain' ([byte[]]@()); break }
                $png = Tirar-Print $ip
                if ($png) { Responder $ctx 200 'image/png' $png } else { Responder $ctx 404 'text/plain' ([byte[]]@()) }
            }
            default { Responder $ctx 404 'text/plain' ([byte[]]@()) }
        }
    } catch {
        Write-Host "  erro: $($_.Exception.Message)" -ForegroundColor Red
        try { Json $ctx @{ ok = $false; msg = $_.Exception.Message } } catch {}
    }
}
