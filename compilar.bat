@echo off
chcp 65001 > nul
title VideoSqueeze - Compilador de Executavel (.EXE)

echo.
echo ========================================================
echo         📦 VideoSqueeze - Compilador de EXE
echo ========================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERRO] Node.js não foi encontrado no sistema!
    echo Por favor, instale o Node.js para compilar o projeto: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo [1/3] ⚙️  Instalando dependências do projeto...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERRO] Falha ao instalar as dependências.
        pause
        exit /b 1
    )
) else (
    echo [1/3] ✅ Dependências já instaladas.
)

echo.
echo [2/3] 🧪 Executando testes de verificação...
call npm test
if %errorlevel% neq 0 (
    echo [ERRO] Os testes automatizados falharam! A compilação foi interrompida.
    pause
    exit /b 1
)

echo.
echo [3/3] 🔨 Gerando executável com instalador (NSIS) e versão portátil...
echo        (Aguarde, este processo pode levar 1 a 2 minutos...)
echo.

call npm run dist

if %errorlevel% neq 0 (
    echo.
    echo [ERRO] Falha durante a compilação do executável.
    pause
    exit /b 1
)

echo.
echo ========================================================
echo ✅ COMPILAÇÃO CONCLUÍDA COM SUCESSO!
echo ========================================================
echo.
echo Os arquivos executáveis foram gerados em:
echo 📂 dist-electron\
echo.
echo  • Instalador (com barra de progresso de extração):
echo    VideoSqueeze Setup 1.0.0.exe
echo.
echo  • Executável Portátil:
echo    VideoSqueeze 1.0.0.exe
echo ========================================================
echo.

explorer "dist-electron\"
pause
