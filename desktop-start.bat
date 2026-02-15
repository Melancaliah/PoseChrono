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

if not exist "apps\desktop\node_modules" (
  echo [PoseChrono] Installation des dependances desktop...
  call npm --prefix apps/desktop install
  if errorlevel 1 (
    echo [PoseChrono] Echec npm install.
    pause
    exit /b 1
  )
)

echo [PoseChrono] Lancement de la version desktop...
call npm --prefix apps/desktop run start
if errorlevel 1 (
  echo [PoseChrono] Echec du lancement.
  pause
  exit /b 1
)

endlocal
