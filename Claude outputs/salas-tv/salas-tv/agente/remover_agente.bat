@echo off
rem remover o agente das Salas do Memorial. Botao direito > Executar como administrador.
net session >nul 2>&1
if errorlevel 1 (
  echo.
  echo Clique com o botao direito neste arquivo e escolha "Executar como administrador".
  echo.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0remover_agente.ps1"
