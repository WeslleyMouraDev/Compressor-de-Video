@echo off
chcp 65001 > nul
title VideoSqueeze - Inicializador

echo.
echo ========================================================
echo               🚀 VideoSqueeze Launcher
echo ========================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERRO] Node.js não foi encontrado no sistema!
    echo Por favor, instale o Node.js em: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo [INFO] Pasta node_modules não encontrada. Instalando dependências...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERRO] Falha ao instalar as dependências.
        pause
        exit /b 1
    )
)

echo [INFO] Iniciando o VideoSqueeze...
echo.
npm start

if %errorlevel% neq 0 (
    echo.
    echo [ERRO] Ocorreu uma falha ao executar a aplicação.
    pause
)
