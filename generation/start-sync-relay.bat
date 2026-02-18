@echo off
setlocal

set "REPO_ROOT=%~dp0.."
cd /d "%REPO_ROOT%"

if not exist "package.json" (
  echo [PoseChrono] package.json introuvable.
  echo Lance ce fichier depuis le dossier generation du repo PoseChrono.
  pause
  exit /b 1
)

set "SYNC_HOST=%~1"
if "%SYNC_HOST%"=="" set "SYNC_HOST=127.0.0.1"

set "SYNC_PORT=%~2"
if "%SYNC_PORT%"=="" set "SYNC_PORT=8787"

echo [PoseChrono] Demarrage du relay sync sur ws://%SYNC_HOST%:%SYNC_PORT% ...
echo [PoseChrono] Appuie sur CTRL+C pour arreter.
call npm run sync:relay -- --host %SYNC_HOST% --port %SYNC_PORT%

echo [PoseChrono] Relay termine.
pause
endlocal
