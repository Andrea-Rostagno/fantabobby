@echo off
cd /d "%~dp0"
echo Aggiorno i dati da fantacalcio.it...
python aggiorna.py
if errorlevel 1 (
  echo.
  echo Qualcosa e' andato storto. Serve Python con: pip install requests beautifulsoup4
  pause
  exit /b 1
)
set "PAGINA=file:///%~dp0index.html"
set "PAGINA=%PAGINA:\=/%"
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" "%PAGINA%"
) else if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" (
  start "" "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" "%PAGINA%"
) else (
  start "" msedge "%PAGINA%"
)
timeout /t 3 >nul
