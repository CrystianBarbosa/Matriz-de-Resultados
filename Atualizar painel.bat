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
echo  [1/4] Lancando na Matriz os fechamentos das pastas VERDES...
python "automacao\lancar_fechamentos.py"
if errorlevel 1 (
  echo.
  echo  ERRO no lancamento. A Matriz nao foi alterada. Verifique se ela esta fechada no Excel.
  pause
  exit /b 1
)

echo.
echo  [2/4] Gerando o painel com os dados mais recentes...
python "dashboards\gerar_dashboards.py"
if errorlevel 1 (
  echo.
  echo  ERRO ao gerar o painel. Verifique se a Matriz e a base do app estao fechadas no Excel.
  pause
  exit /b 1
)

echo.
echo  [3/4] Registrando a nova versao...
git add index.html dashboards\gerar_dashboards.py dashboards\templates automacao README.md .gitignore "Atualizar painel.bat"
for /f "tokens=*" %%d in ('powershell -NoProfile -Command "Get-Date -Format \"dd/MM/yyyy HH:mm\""') do set AGORA=%%d
git diff --cached --quiet
if errorlevel 1 (
  git commit -q -m "Atualizacao do painel - %AGORA%"
) else (
  echo  Nenhuma mudanca nova no painel.
)

echo.
echo  [4/4] Enviando para o GitHub...
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
