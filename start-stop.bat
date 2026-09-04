@echo off
rem ============================================
rem  openapi2doc one-click start/stop
rem  Usage:
rem    start-stop.bat        production: single server (port 3000, serves frontend+API)
rem    start-stop.bat dev    dev mode: API :3000 + frontend :5173 separate
rem ============================================
setlocal
cd /d "%~dp0"

if /i "%~1"=="dev" goto :dev

rem ---------- production: single all-in-one server (port 3000) ----------
set PORT=3000
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%PORT% ^| findstr LISTENING') do set PID=%%a

if defined PID (
    echo [STOP] port %PORT% is used by PID %PID%, killing...
    taskkill /F /PID %PID% >nul 2>&1
    echo [DONE] production server stopped.
) else (
    if not exist "dist\index.html" (
        echo [START] frontend not built, running npm run build ...
        call npm run build
        if errorlevel 1 (
            echo [ERROR] frontend build failed, see logs above.
            endlocal
            exit /b 1
        )
    )
    start "openapi2doc server" cmd /k "npm start"
    echo [START] production server started: http://localhost:%PORT%/
)
endlocal
exit /b

:dev
rem ---------- dev mode: API :3000 + frontend :5173 ----------
set BPORT=3000
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%BPORT% ^| findstr LISTENING') do set PID=%%a

if defined PID (
    echo [STOP] API port %BPORT% is used by PID %PID%, killing...
    taskkill /F /PID %PID% >nul 2>&1
    echo [DONE] dev API stopped (frontend :5173, if running, close manually).
) else (
    start "openapi2doc api" cmd /k "npm run dev:server"
    start "openapi2doc dev" cmd /k "npm run dev"
    echo [START] dev API: http://localhost:%BPORT%   frontend: http://localhost:5173/
)
endlocal
exit /b