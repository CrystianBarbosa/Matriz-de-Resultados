@echo off
chcp 65001 >nul
title Atualizar painel - Visitas Demarco DPO
cd /d "%~dp0"
set PYTHONIOENCODING=utf-8

echo.
echo  ================================================
echo   Visitas Demarco - DPO : atualizando o painel
echo  ================================================
echo.
echo  [1/3] Gerando o painel com os dados mais recentes...
python "dashboards\gerar_dashboards.py"
if errorlevel 1 (
  echo.
  echo  ERRO ao gerar o painel. Verifique se a Matriz e a base do app estao fechadas no Excel.
  pause
  exit /b 1
)

echo.
echo  [2/3] Registrando a nova versao...
git add index.html dashboards\gerar_dashboards.py dashboards\templates README.md .gitignore "Atualizar painel.bat"
git diff --cached --quiet
if not errorlevel 1 (
  echo  Nenhuma mudanca desde a ultima publicacao. Nada para enviar.
  echo.
  pause
  exit /b 0
)
for /f "tokens=*" %%d in ('powershell -NoProfile -Command "Get-Date -Format \"dd/MM/yyyy HH:mm\""') do set AGORA=%%d
git commit -q -m "Atualizacao do painel - %AGORA%"

echo.
echo  [3/3] Enviando para o GitHub...
git push
if errorlevel 1 (
  echo.
  echo  ERRO ao enviar. Abra o GitHub Desktop e clique em "Push origin".
  pause
  exit /b 1
)

echo.
echo  Painel atualizado e publicado com sucesso em %AGORA%.
echo.
pause
