@echo off
set "PAGINA=file:///%~dp0index.html"
set "PAGINA=%PAGINA:\=/%"
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" "%PAGINA%"
) else if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" (
  start "" "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" "%PAGINA%"
) else (
  start "" msedge "%PAGINA%"
)
