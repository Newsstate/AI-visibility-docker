@echo off
setlocal enabledelayedexpansion
title AI Visibility - Setup & Start

echo.
echo  ==========================================
echo   AI Visibility - Setup ^& Start
echo  ==========================================
echo.

:: ── Check Node.js ──────────────────────────────────────────────
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] Node.js is not installed.
    echo.
    echo  Please install it from: https://nodejs.org
    echo  Download the LTS version, run the installer, then re-run this script.
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node -v') do set NODE_VER=%%i
echo  [OK] Node.js %NODE_VER% found

:: ── Check npm ──────────────────────────────────────────────────
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] npm not found. Re-install Node.js from nodejs.org
    pause
    exit /b 1
)
echo  [OK] npm found

:: ── Check PostgreSQL ───────────────────────────────────────────
where psql >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  [ERROR] PostgreSQL (psql) is not installed or not in PATH.
    echo.
    echo  Install from: https://www.postgresql.org/download/windows/
    echo  During install, remember the password you set for the 'postgres' user.
    echo  After install, re-run this script.
    echo.
    pause
    exit /b 1
)
echo  [OK] PostgreSQL found

:: ── Check Redis (Memurai or redis-server) ──────────────────────
set REDIS_FOUND=0
where redis-server >nul 2>&1
if %errorlevel% equ 0 set REDIS_FOUND=1
where memurai >nul 2>&1
if %errorlevel% equ 0 set REDIS_FOUND=1

:: Check if Redis/Memurai service is running
sc query Redis >nul 2>&1 && set REDIS_FOUND=1
sc query Memurai >nul 2>&1 && set REDIS_FOUND=1

if %REDIS_FOUND% equ 0 (
    echo.
    echo  [WARNING] Redis not found.
    echo.
    echo  Option A - Memurai (easiest for Windows):
    echo    Download from: https://www.memurai.com/get-memurai
    echo    Install and it runs as a Windows service automatically.
    echo.
    echo  Option B - Redis via WSL2 or Scoop:
    echo    scoop install redis
    echo.
    echo  After installing Redis/Memurai, re-run this script.
    echo.
    pause
    exit /b 1
)
echo  [OK] Redis found

echo.
echo  ── Checking project structure ─────────────────────────────
if not exist "backend\package.json" (
    echo  [ERROR] Cannot find backend\package.json
    echo  Make sure you run this script from the ai-visibility folder.
    pause
    exit /b 1
)
if not exist "frontend\package.json" (
    echo  [ERROR] Cannot find frontend\package.json
    pause
    exit /b 1
)
echo  [OK] Project files found

:: ── Setup .env if missing ──────────────────────────────────────
echo.
echo  ── Environment setup ──────────────────────────────────────
if not exist "backend\.env" (
    echo  Creating backend\.env from template...
    copy "backend\.env.example" "backend\.env" >nul

    echo.
    echo  ============================================================
    echo   IMPORTANT: You need to add your API keys to backend\.env
    echo  ============================================================
    echo.
    echo  Opening backend\.env in Notepad now...
    echo  Fill in at minimum: ANTHROPIC_API_KEY and OPENAI_API_KEY
    echo  Save the file, then come back here and press any key.
    echo.
    start notepad "backend\.env"
    pause
) else (
    echo  [OK] backend\.env already exists
)

:: ── Install backend dependencies ───────────────────────────────
echo.
echo  ── Installing backend dependencies ────────────────────────
if not exist "backend\node_modules" (
    echo  Running npm install in backend... (this may take a minute)
    cd backend
    npm install --silent
    if %errorlevel% neq 0 (
        echo  [ERROR] Backend npm install failed
        pause
        exit /b 1
    )
    cd ..
    echo  [OK] Backend dependencies installed
) else (
    echo  [OK] Backend node_modules already present
)

:: ── Install frontend dependencies ──────────────────────────────
echo.
echo  ── Installing frontend dependencies ───────────────────────
if not exist "frontend\node_modules" (
    echo  Running npm install in frontend... (this may take a minute)
    cd frontend
    npm install --silent
    if %errorlevel% neq 0 (
        echo  [ERROR] Frontend npm install failed
        pause
        exit /b 1
    )
    cd ..
    echo  [OK] Frontend dependencies installed
) else (
    echo  [OK] Frontend node_modules already present
)

:: ── Setup PostgreSQL database ──────────────────────────────────
echo.
echo  ── Setting up database ────────────────────────────────────

:: Load DB vars from .env
for /f "tokens=1,2 delims==" %%a in ('type backend\.env ^| findstr /v "^#" ^| findstr "DATABASE_URL"') do (
    set DB_LINE=%%b
)

set PG_PASSWORD=
set /p PG_PASSWORD="  Enter your PostgreSQL 'postgres' user password: "

:: Create user and database (ignore errors if already exists)
echo  Creating database and user...
set PGPASSWORD=%PG_PASSWORD%
psql -U postgres -h localhost -c "CREATE USER aiv WITH PASSWORD 'aiv_secret';" 2>nul
psql -U postgres -h localhost -c "CREATE DATABASE ai_visibility OWNER aiv;" 2>nul
psql -U postgres -h localhost -c "GRANT ALL PRIVILEGES ON DATABASE ai_visibility TO aiv;" 2>nul
echo  [OK] Database ready

:: ── Run migrations ─────────────────────────────────────────────
echo.
echo  ── Running database migrations ────────────────────────────
cd backend
node src/db/migrate.js
if %errorlevel% neq 0 (
    echo  [ERROR] Migration failed. Check your DATABASE_URL in backend\.env
    echo  Default should be: postgresql://aiv:aiv_secret@localhost:5432/ai_visibility
    cd ..
    pause
    exit /b 1
)
cd ..
echo  [OK] Database migrated

:: ── Start everything ───────────────────────────────────────────
echo.
echo  ==========================================
echo   Starting AI Visibility...
echo  ==========================================
echo.
echo  Backend API  →  http://localhost:4000
echo  Frontend     →  http://localhost:3000
echo.
echo  Press Ctrl+C in either window to stop.
echo.

:: Open browser after short delay
start "" timeout /t 4 /nobreak >nul && start "" "http://localhost:3000"

:: Start backend in new window
start "AI Visibility - Backend" cmd /k "cd backend && npm run dev"

:: Small delay so backend starts first
timeout /t 2 /nobreak >nul

:: Start frontend in new window
start "AI Visibility - Frontend" cmd /k "cd frontend && npm run dev"

echo  Two windows opened:
echo   - "AI Visibility - Backend"  (API server)
echo   - "AI Visibility - Frontend" (React app)
echo.
echo  Browser will open automatically at http://localhost:3000
echo.
pause
