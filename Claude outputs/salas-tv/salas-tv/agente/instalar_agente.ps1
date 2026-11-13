# Instala o agente das Salas do Memorial como tarefa do Windows (roda em segundo plano, sozinho).
# Use pelo instalar_agente.bat (botão direito > Executar como administrador).
$ErrorActionPreference = 'Stop'
$NomeTarefa = 'PAI Agente Salas'
$pasta = Split-Path -Parent $MyInvocation.MyCommand.Path
$script = Join-Path $pasta 'agente_salas.pyw'

function Sair($msg) { Write-Host ''; Write-Host $msg -ForegroundColor Red; Read-Host 'Aperte Enter para fechar' | Out-Null; exit 1 }

if (-not (Test-Path $script)) { Sair "Não achei o agente_salas.pyw nesta pasta ($pasta)." }
if (-not (Test-Path 'C:\adb\adb.exe') -and -not (Test-Path (Join-Path $pasta 'adb.exe'))) {
    Sair 'Não achei o adb.exe em C:\adb. Copie a pasta C:\adb do PC do suporte e rode de novo.'
}

# Python (pythonw = sem janela)
$pyw = (Get-Command pythonw.exe -ErrorAction SilentlyContinue | Select-Object -First 1).Source
if (-not $pyw) { $pyw = (Get-Command pyw.exe -ErrorAction SilentlyContinue | Select-Object -First 1).Source }
if (-not $pyw) { Sair 'Python não encontrado. Instale pelo python.org marcando "Add python.exe to PATH".' }
Write-Host "Python: $pyw"

# Chave do agente (fica só neste PC) + arquivo com o resumo para o servidor
Start-Process -FilePath $pyw -ArgumentList "`"$script`" --gerar-chave" -WorkingDirectory $pasta -Wait
if (-not (Test-Path (Join-Path $pasta 'agente.json'))) { Sair 'Não consegui criar o agente.json (veja o agente.log).' }
Write-Host 'Chave do agente pronta (agente.json).' -ForegroundColor Green

# Mesmo usuário em que está a chave do ADB (%USERPROFILE%\.android): senão as TVs não reconhecem o agente.
$usuario = "$env:USERDOMAIN\$env:USERNAME"
if (-not (Test-Path (Join-Path $env:USERPROFILE '.android\adbkey'))) {
    Write-Host "Atenção: não achei a chave do ADB em $env:USERPROFILE\.android. Copie adbkey e adbkey.pub para lá." -ForegroundColor Yellow
}
Write-Host ''
Write-Host "A tarefa vai rodar com o usuário $usuario."
Write-Host 'Digite a senha do Windows desse usuário para o agente funcionar mesmo sem ninguém logado.'
Write-Host '(Se o usuário não tem senha, deixe em branco: aí o agente só roda com o usuário logado.)'
$senhaSegura = Read-Host 'Senha' -AsSecureString
$senha = [System.Net.NetworkCredential]::new('', $senhaSegura).Password

$acao = New-ScheduledTaskAction -Execute $pyw -Argument "`"$script`"" -WorkingDirectory $pasta
# Reabre a cada 5 min se tiver fechado (com IgnoreNew, não abre um segundo agente).
$repetir = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
$cfg = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew

try {
    if ($senha) {
        $gatilhos = @((New-ScheduledTaskTrigger -AtStartup), $repetir)
        Register-ScheduledTask -TaskName $NomeTarefa -Action $acao -Trigger $gatilhos -Settings $cfg `
            -User $usuario -Password $senha -RunLevel Limited -Force | Out-Null
        Write-Host 'Tarefa criada: inicia quando o PC liga, mesmo sem login.' -ForegroundColor Green
    } else {
        $gatilhos = @((New-ScheduledTaskTrigger -AtLogOn -User $usuario), $repetir)
        $quem = New-ScheduledTaskPrincipal -UserId $usuario -LogonType Interactive -RunLevel Limited
        Register-ScheduledTask -TaskName $NomeTarefa -Action $acao -Trigger $gatilhos -Settings $cfg -Principal $quem -Force | Out-Null
        Write-Host 'Tarefa criada SEM senha: o agente só roda com este usuário logado.' -ForegroundColor Yellow
        Write-Host 'Para rodar sem login, coloque senha no usuário e instale de novo.' -ForegroundColor Yellow
    }
} catch {
    Sair "Não consegui criar a tarefa: $($_.Exception.Message) (senha errada?)"
} finally {
    $senha = $null
}

Start-ScheduledTask -TaskName $NomeTarefa
Write-Host ''
Write-Host 'Agente iniciado.' -ForegroundColor Green
Write-Host 'Falta 1 passo no servidor: suba o arquivo pai-tv-agente.php (desta pasta) para /home2/pla48587/ no cPanel.'
Write-Host 'Depois confira o agente.log nesta pasta e a tela Salas do Memorial no app ("Memorial online").'
Start-Process explorer.exe $pasta
Read-Host 'Aperte Enter para fechar' | Out-Null
