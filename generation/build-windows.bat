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

echo [PoseChrono] Build release Windows...
call npm run release:windows
if errorlevel 1 (
  echo [PoseChrono] Echec release:windows.
  pause
  exit /b 1
)

echo.
echo [PoseChrono] OK. Sortie dans dist\v*_windows_*\
echo   - PoseChrono-Setup-*.exe
pause
endlocal
