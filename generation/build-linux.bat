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

echo [PoseChrono] Sync version desktop depuis manifest.json...
call npm run version:sync-desktop
if errorlevel 1 (
  echo [PoseChrono] Echec version:sync-desktop.
  pause
  exit /b 1
)

echo [PoseChrono] Build release Linux...
call npm run release:linux
if errorlevel 1 (
  echo [PoseChrono] Echec release:linux.
  pause
  exit /b 1
)

echo [PoseChrono] OK. Sorties:
echo - dist\linux-YYYY-MM-DD_Txx-mm_NN\PoseChrono_*.AppImage
echo - dist\linux-YYYY-MM-DD_Txx-mm_NN\release.json
pause
endlocal
