@echo off
setlocal EnableExtensions

set "REPO_ROOT=%~dp0.."
cd /d "%REPO_ROOT%"

if not exist "package.json" (
  echo [PoseChrono] package.json introuvable.
  echo Lance ce fichier depuis le dossier generation du repo PoseChrono.
  pause
  exit /b 1
)

if not exist "js\config.js" (
  echo [PoseChrono] js\config.js introuvable.
  pause
  exit /b 1
)

set "CONFIG_FILE=js\config.js"
set "HAS_ERROR=0"
set "FAILED_VARIANTS="
if not exist "dist" mkdir "dist"
for /f %%I in ('node scripts/get-release-folder-name.js') do set "RUN_STAMP=%%I"
if not exist "%TEMP%\PoseChrono" mkdir "%TEMP%\PoseChrono"
set "CONFIG_BACKUP=%TEMP%\PoseChrono\config.js.build-all_multi.%RUN_STAMP%.bak"
for %%F in ("js\config.js.build-all_multi*.bak") do (
  if exist "%%~fF" del /q "%%~fF" >nul 2>nul
)

copy /y "%CONFIG_FILE%" "%CONFIG_BACKUP%" >nul
if errorlevel 1 (
  echo [PoseChrono] Echec sauvegarde de js\config.js.
  if /i not "%POSECHRONO_NO_PAUSE%"=="1" pause
  exit /b 1
)

call :BuildVariant "_SYNC" "true" "true"
if errorlevel 1 (
  set "HAS_ERROR=1"
  set "FAILED_VARIANTS=%FAILED_VARIANTS% _SYNC"
)

call :BuildVariant "_SYNC_LOCAL-ONLY" "true" "false"
if errorlevel 1 (
  set "HAS_ERROR=1"
  set "FAILED_VARIANTS=%FAILED_VARIANTS% _SYNC_LOCAL-ONLY"
)

call :BuildVariant "_NO_SYNC" "false" "false"
if errorlevel 1 (
  set "HAS_ERROR=1"
  set "FAILED_VARIANTS=%FAILED_VARIANTS% _NO_SYNC"
)

:cleanup
if exist "%CONFIG_BACKUP%" (
  copy /y "%CONFIG_BACKUP%" "%CONFIG_FILE%" >nul
  del /q "%CONFIG_BACKUP%" >nul 2>nul
)

if "%HAS_ERROR%"=="1" (
  if defined FAILED_VARIANTS (
    echo [PoseChrono] Variantes en echec:%FAILED_VARIANTS%
  )
  echo [PoseChrono] Echec. La configuration d'origine a ete restauree.
  if /i not "%POSECHRONO_NO_PAUSE%"=="1" pause
  endlocal
  exit /b 1
)

echo [PoseChrono] Nettoyage de la racine dist...
call node scripts/cleanup-dist-root.js
if errorlevel 1 (
  echo [PoseChrono] Echec nettoyage dist.
  if /i not "%POSECHRONO_NO_PAUSE%"=="1" pause
  endlocal
  exit /b 1
)

echo.
echo [PoseChrono] OK. Builds classes dans:
echo - dist\_SYNC\
echo - dist\_SYNC_LOCAL-ONLY\
echo - dist\_NO_SYNC\
if /i not "%POSECHRONO_NO_PAUSE%"=="1" pause
endlocal
exit /b 0

:BuildVariant
setlocal
set "VARIANT_FOLDER=%~1"
set "SYNC_ENABLED=%~2"
set "ALLOW_PUBLIC_SYNC=%~3"

echo.
echo [PoseChrono] ===== Variant %VARIANT_FOLDER% =====
echo [PoseChrono] SYNC.enabled=%SYNC_ENABLED% ; SYNC.allowPublicSync=%ALLOW_PUBLIC_SYNC%

call :SetSyncFlags "%SYNC_ENABLED%" "%ALLOW_PUBLIC_SYNC%"
if errorlevel 1 (
  endlocal
  exit /b 1
)

for /f %%I in ('node scripts/get-release-folder-name.js') do set "RELEASE_FOLDER=%%I"
if not defined RELEASE_FOLDER (
  echo [PoseChrono] Echec lecture version/timestamp.
  endlocal
  exit /b 1
)

set "TARGET_DIR=dist\%VARIANT_FOLDER%\%RELEASE_FOLDER%"

echo [PoseChrono] Build release Eagle...
call npm run release:eagle
if errorlevel 1 (
  echo [PoseChrono] Echec release:eagle.
  endlocal
  exit /b 1
)

echo [PoseChrono] Sync version desktop depuis manifest.json...
call npm run version:sync-desktop
if errorlevel 1 (
  echo [PoseChrono] Echec version:sync-desktop.
  endlocal
  exit /b 1
)

echo [PoseChrono] Build release Windows...
call npm run release:windows
if errorlevel 1 (
  echo [PoseChrono] Echec release:windows.
  endlocal
  exit /b 1
)

echo [PoseChrono] Classement artefacts vers %TARGET_DIR%...
call :CollectArtifacts "%TARGET_DIR%" "%VARIANT_FOLDER%" "%SYNC_ENABLED%" "%ALLOW_PUBLIC_SYNC%"
if errorlevel 1 (
  echo [PoseChrono] Echec classement des artefacts pour %VARIANT_FOLDER%.
  endlocal
  exit /b 1
)

echo [PoseChrono] Variant %VARIANT_FOLDER% terminee.
endlocal
exit /b 0

:SetSyncFlags
setlocal
set "SYNC_ENABLED=%~1"
set "ALLOW_PUBLIC_SYNC=%~2"

node scripts/set-sync-flags.js %SYNC_ENABLED% %ALLOW_PUBLIC_SYNC%
if errorlevel 1 (
  echo [PoseChrono] Echec mise a jour de js\config.js.
  endlocal
  exit /b 1
)

endlocal
exit /b 0

:CollectArtifacts
setlocal
set "TARGET_DIR=%~1"
set "VARIANT_FOLDER=%~2"
set "SYNC_ENABLED=%~3"
set "ALLOW_PUBLIC_SYNC=%~4"

node scripts/collect-multi-artifacts.js "%TARGET_DIR%" "%VARIANT_FOLDER%" "%SYNC_ENABLED%" "%ALLOW_PUBLIC_SYNC%"
if errorlevel 1 (
  endlocal
  exit /b 1
)

endlocal
exit /b 0
