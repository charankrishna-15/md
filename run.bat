@echo off
echo =============================================
echo   InvenIQ — Inventory Management System
echo =============================================
echo.
echo Starting local server on http://localhost:8080
echo.
echo Press Ctrl+C to stop the server.
echo.
cd /d "%~dp0"
python -m http.server 8080
pause
