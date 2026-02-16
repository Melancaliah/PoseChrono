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

echo [PoseChrono] Verification smoke (code + locales + release Eagle)...
call npm run verify:smoke
if errorlevel 1 (
  echo [PoseChrono] Echec verify:smoke.
  pause
  exit /b 1
)

if exist "dist\eagle-plugin\manifest.json" (
  echo [PoseChrono] Verification dossier Eagle fixe (dist\eagle-plugin)...
  call npm run verify:eagle-dist -- dist/eagle-plugin
  if errorlevel 1 (
    echo [PoseChrono] Echec verify:eagle-dist sur dist\eagle-plugin.
    pause
    exit /b 1
  )
) else (
  echo [PoseChrono] Dossier dist\eagle-plugin absent: lance generation\build-eagle.bat.
)

if exist "dist\windows\release.json" (
  echo [PoseChrono] Verification artefact Windows...
  call npm run verify:windows-dist
  if errorlevel 1 (
    echo [PoseChrono] Echec verify:windows-dist.
    pause
    exit /b 1
  )
) else (
  echo [PoseChrono] Windows dist absent: verify:windows-dist ignore.
  echo [PoseChrono] Lance generation\build-windows.bat puis relance verify.bat pour verifier le .exe.
)

echo [PoseChrono] Verification globale des artefacts...
call npm run verify:builds
if errorlevel 1 (
  echo [PoseChrono] Echec verify:builds.
  pause
  exit /b 1
)

echo [PoseChrono] Verification terminee.
pause
endlocal
