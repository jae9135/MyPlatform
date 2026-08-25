@echo off
REM MyPlatform local scan API (PMD, SpotBugs, Playwright) — double-click to start
cd /d "%~dp0.."
start "MyPlatform API" /MIN powershell -NoExit -ExecutionPolicy Bypass -File "%~dp0start-api-source-scan.ps1"
echo Local API starting on http://127.0.0.1:8001
echo Open portal: http://localhost:3000  (run npm run dev:portal in another terminal, or use Vercel + "내 PC에서 검사")
timeout /t 3 /nobreak >nul
