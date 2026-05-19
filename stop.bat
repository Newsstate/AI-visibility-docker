@echo off
title AI Visibility - Stop

echo.
echo  Stopping AI Visibility servers...
echo.

:: Kill processes on ports 3000 and 4000
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    echo  Stopping frontend (PID %%a)...
    taskkill /F /PID %%a >nul 2>&1
)

for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":4000 " ^| findstr "LISTENING"') do (
    echo  Stopping backend (PID %%a)...
    taskkill /F /PID %%a >nul 2>&1
)

echo  [OK] Servers stopped.
echo.
pause
