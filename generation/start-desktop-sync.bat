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

set "SYNC_URL=%~1"
if "%SYNC_URL%"=="" set "SYNC_URL=ws://127.0.0.1:8787"

set "POSECHRONO_SYNC_TRANSPORT=ws"
set "POSECHRONO_SYNC_WS_URL=%SYNC_URL%"

echo [PoseChrono] Desktop sync mode: %POSECHRONO_SYNC_TRANSPORT%
echo [PoseChrono] WebSocket URL: %POSECHRONO_SYNC_WS_URL%
echo [PoseChrono] Starting desktop app...
call npm run desktop:start

echo [PoseChrono] Desktop app stopped.
pause
endlocal
