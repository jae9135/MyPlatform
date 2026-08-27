@echo off
REM MyPlatform local API (all features: source-scan, web-quality, DBManager, ...)
cd /d "%~dp0.."
start "MyPlatform API" /MIN powershell -NoExit -ExecutionPolicy Bypass -File "%~dp0start-api-source-scan.ps1"
echo Local API starting on http://127.0.0.1:8001
echo Portal: npm run dev:portal  ^(apps/portal/.env.local^)
echo Env: apps/api/.env.local ^(DATABASE_URL^) + apps/portal/.env.local
timeout /t 3 /nobreak >nul
