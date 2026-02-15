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

echo [PoseChrono] Build releases Eagle + Windows...
call npm run release:all
if errorlevel 1 (
  echo [PoseChrono] Echec release:all.
  pause
  exit /b 1
)

echo [PoseChrono] OK. Sorties:
echo - dist\eagle\posechrono-eagle-*.zip
echo - dist\windows-YYYY-MM-DD_THH-mm_NN\posechrono-desktop-*-setup.exe
pause
endlocal
