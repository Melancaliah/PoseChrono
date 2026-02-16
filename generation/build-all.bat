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

echo [PoseChrono] Build release Eagle (latest)...
call npm run release:eagle:latest
if errorlevel 1 (
  echo [PoseChrono] Echec release:eagle:latest.
  pause
  exit /b 1
)

echo [PoseChrono] Sync version desktop depuis manifest.json...
call npm run version:sync-desktop
if errorlevel 1 (
  echo [PoseChrono] Echec version:sync-desktop.
  pause
  exit /b 1
)

echo [PoseChrono] Build release Windows...
call npm run release:windows
if errorlevel 1 (
  echo [PoseChrono] Echec release:windows.
  pause
  exit /b 1
)

echo [PoseChrono] OK. Sorties:
echo - dist\eagle-plugin\ (chemin fixe pour import Eagle)
echo - dist\eagle\posechrono-eagle-*.zip
echo - dist\windows-YYYY-MM-DD_THH-mm_NN\posechrono-desktop-*-setup.exe
echo.
echo Note: si dist\eagle-plugin n'est pas mis a jour, ferme Eagle puis relance ce script.
pause
endlocal
