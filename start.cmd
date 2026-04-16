@echo off
title FinalRep

echo.
echo  ==========================================
echo   FinalRep - Iniciando servicios...
echo  ==========================================
echo.

:: Verificar que existan las carpetas
if not exist "server" (
    echo [ERROR] No se encuentra la carpeta server\
    pause
    exit /b 1
)
if not exist "client" (
    echo [ERROR] No se encuentra la carpeta client\
    pause
    exit /b 1
)

:: Verificar dependencias base
where python >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python no esta disponible en PATH
    pause
    exit /b 1
)

where pip >nul 2>&1
if errorlevel 1 (
    echo [ERROR] pip no esta disponible en PATH
    pause
    exit /b 1
)

where npm.cmd >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm no esta disponible en PATH
    pause
    exit /b 1
)

:: Verificar dependencias de backend y autoinstalar si faltan
echo [0/2] Verificando dependencias Python del backend...
python -c "import fastapi, uvicorn, sqlmodel, alembic" >nul 2>&1
if errorlevel 1 (
    echo [INFO] Faltan dependencias de Python. Instalando server\requirements.txt...
    python -m pip install -r "%~dp0server\requirements.txt"
    if errorlevel 1 (
        echo [ERROR] No se pudieron instalar las dependencias del backend
        pause
        exit /b 1
    )
)

:: Iniciar backend en nueva ventana
echo [1/2] Iniciando backend (FastAPI)...
start "FinalRep - Backend" cmd /k "cd /d ""%~dp0server"" && python -m uvicorn main:app --host 0.0.0.0 --port 8000"

:: Esperar 3 segundos para que el backend arranque
timeout /t 3 /nobreak >nul

:: Iniciar frontend en nueva ventana
echo [2/2] Iniciando frontend (React)...
start "FinalRep - Frontend" cmd /k "cd /d ""%~dp0client"" && npm.cmd run dev -- --host 0.0.0.0 --port 5173"

echo.
echo  Servicios iniciados:
echo    Backend  ^> http://localhost:8000
echo    API Docs ^> http://localhost:8000/docs
echo    Frontend ^> http://localhost:5173
echo.
echo  Cierra las ventanas de cada servicio para detenerlos.
echo.
pause
