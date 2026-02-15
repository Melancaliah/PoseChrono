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

echo [PoseChrono] Build release Eagle...
call npm run release:eagle
if errorlevel 1 (
  echo [PoseChrono] Echec release:eagle.
  pause
  exit /b 1
)

echo [PoseChrono] OK. Sorties:
echo - dist\eagle-plugin-YYYY-MM-DD_THH-mm_NN\
echo - dist\eagle\posechrono-eagle-*.zip
pause
endlocal
