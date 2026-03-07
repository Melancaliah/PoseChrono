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

echo.
echo [PoseChrono] OK. Sorties dans dist\PoseChrono_v*_eagle_*\
echo   - Dossier decompresse (plugin Eagle)
echo   - .zip correspondant
pause
endlocal
