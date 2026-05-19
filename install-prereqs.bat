@echo off
title AI Visibility - Install Prerequisites
echo.
echo  ==========================================
echo   Installing Prerequisites (Windows)
echo  ==========================================
echo.
echo  This will install: Node.js, PostgreSQL, Memurai (Redis)
echo  using Windows Package Manager (winget).
echo.
echo  Requires Windows 10/11 with winget installed.
echo  (winget comes pre-installed on Windows 11 and
echo   Windows 10 21H1+. If missing, get it from
echo   the Microsoft Store: "App Installer")
echo.
pause

:: Check winget
where winget >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  [ERROR] winget not found.
    echo  Install "App Installer" from the Microsoft Store, then re-run.
    echo  https://apps.microsoft.com/store/detail/app-installer/9NBLGGH4NNS1
    pause
    exit /b 1
)

echo.
echo  Installing Node.js LTS...
winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
echo.

echo  Installing PostgreSQL 16...
winget install PostgreSQL.PostgreSQL.16 --silent --accept-package-agreements --accept-source-agreements
echo.

echo  Installing Memurai (Redis for Windows)...
winget install Memurai.Memurai --silent --accept-package-agreements --accept-source-agreements
echo.

echo  ==========================================
echo   All prerequisites installed!
echo  ==========================================
echo.
echo  IMPORTANT:
echo   1. Close and reopen this terminal so PATH updates take effect
echo   2. PostgreSQL will ask you to set a password during install
echo      (remember it — start.bat will ask for it)
echo   3. Then run: start.bat
echo.
pause
