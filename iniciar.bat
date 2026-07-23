@echo off
chcp 65001 > nul
title VideoSqueeze - Inicializador

echo.
echo ========================================================
echo               VideoSqueeze Launcher
echo ========================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERRO] Node.js nao foi encontrado no sistema!
    echo Por favor, instale o Node.js em: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo [INFO] Pasta node_modules nao encontrada. Instalando dependencias...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERRO] Falha ao instalar as dependencias.
        pause
        exit /b 1
    )
)

echo [INFO] Iniciando o VideoSqueeze...
echo.
call npm start

if %errorlevel% neq 0 (
    echo.
    echo [ERRO] Ocorreu uma falha ao executar a aplicacao.
    pause
)
