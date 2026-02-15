@echo off
setlocal

cd /d "%~dp0"

if not exist "package.json" (
  echo [PoseChrono] package.json introuvable.
  echo Lance ce fichier depuis la racine du repo PoseChrono.
  pause
  exit /b 1
)

if not exist "apps\desktop\package.json" (
  echo [PoseChrono] apps\desktop\package.json introuvable.
  pause
  exit /b 1
)

echo [PoseChrono] Installation/maj des dependances desktop...
call npm --prefix apps/desktop install
if errorlevel 1 (
  echo [PoseChrono] Echec npm install.
  pause
  exit /b 1
)

echo [PoseChrono] Build de l'installateur Windows (.exe)...
set CSC_IDENTITY_AUTO_DISCOVERY=false
call npm --prefix apps/desktop run build:win:unsigned
if errorlevel 1 (
  echo [PoseChrono] Echec build windows.
  pause
  exit /b 1
)

echo [PoseChrono] Build termine. Regarde apps\desktop\dist\
pause
endlocal
