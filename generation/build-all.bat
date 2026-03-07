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

echo [PoseChrono] Build unifie Eagle + Windows...
call npm run release:all
if errorlevel 1 (
  echo [PoseChrono] Echec release:all.
  pause
  exit /b 1
)

echo.
echo [PoseChrono] OK. Voir le dossier dist\v*\ pour les fichiers de release.
echo   - .zip et .exe a la racine du dossier (prets pour GitHub)
echo   - eagle\ = version store officiel (sans GabContainer)
pause
endlocal
