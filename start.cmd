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

:: Iniciar backend en nueva ventana
echo [1/2] Iniciando backend (FastAPI)...
start "FinalRep - Backend" cmd /k "cd /d "%~dp0server" && pip install -r requirements.txt -q && uvicorn main:app --reload --port 8000"

:: Esperar 3 segundos para que el backend arranque
timeout /t 3 /nobreak >nul

:: Iniciar frontend en nueva ventana
echo [2/2] Iniciando frontend (React)...
start "FinalRep - Frontend" cmd /k "cd /d "%~dp0client" && npm install && npm run dev"

echo.
echo  Servicios iniciados:
echo    Backend  ^> http://localhost:8000
echo    API Docs ^> http://localhost:8000/docs
echo    Frontend ^> http://localhost:5173
echo.
echo  Cierra las ventanas de cada servicio para detenerlos.
echo.
pause
