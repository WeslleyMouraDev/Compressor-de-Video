@echo off
chcp 65001 > nul
title VideoSqueeze - Compilador de Executavel

echo.
echo ========================================================
echo         VideoSqueeze - Compilador de EXE
echo ========================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERRO] Node.js nao foi encontrado no sistema!
    echo Por favor, instale o Node.js para compilar o projeto: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo [1/3] Instalando dependencias do projeto...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERRO] Falha ao instalar as dependencias.
        pause
        exit /b 1
    )
) else (
    echo [1/3] OK: Dependencias ja instaladas.
)

echo.
echo [2/3] Executando testes de verificacao...
call npm test
if %errorlevel% neq 0 (
    echo [ERRO] Os testes automatizados falharam! A compilacao foi interrompida.
    pause
    exit /b 1
)

echo.
echo [3/3] Gerando executavel com instalador NSIS e versao portatil...
echo        Aguarde, este processo pode levar de 1 a 2 minutos...
echo.

call npm run dist

if %errorlevel% neq 0 (
    echo.
    echo [ERRO] Falha durante a compilacao do executavel.
    pause
    exit /b 1
)

echo.
echo ========================================================
echo COMPILACAO CONCLUIDA COM SUCESSO!
echo ========================================================
echo.
echo Os arquivos executaveis foram gerados em:
echo dist-electron\
echo.
echo  - Instalador com barra de progresso de extracao:
echo    VideoSqueeze Setup 1.0.0.exe
echo.
echo  - Executavel Portatil:
echo    VideoSqueeze 1.0.0.exe
echo ========================================================
echo.

explorer "dist-electron\"
pause
