# Remove a tarefa do agente das Salas do Memorial e fecha o agente.
$NomeTarefa = 'PAI Agente Salas'
try { Stop-ScheduledTask -TaskName $NomeTarefa -ErrorAction SilentlyContinue } catch {}
try { Unregister-ScheduledTask -TaskName $NomeTarefa -Confirm:$false -ErrorAction Stop; Write-Host 'Tarefa removida.' -ForegroundColor Green }
catch { Write-Host 'A tarefa não existia.' -ForegroundColor Yellow }
Get-CimInstance Win32_Process -Filter "Name='pythonw.exe' OR Name='python.exe' OR Name='pyw.exe'" |
    Where-Object { $_.CommandLine -like '*agente_salas.pyw*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; Write-Host "Agente fechado (processo $($_.ProcessId))." }
Write-Host 'A chave (agente.json) continua na pasta. Para invalidá-la, apague o pai-tv-agente.php do servidor.'
Read-Host 'Aperte Enter para fechar' | Out-Null
