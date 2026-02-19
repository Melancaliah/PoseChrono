@echo off
setlocal enabledelayedexpansion
title PoseChrono Sync Server

echo ====================================================
echo      PoseChrono - Local Sync Server
echo ====================================================
echo.
echo This server allows multiple devices to connect
echo together on your local network.
echo.

:: Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in your PATH.
    echo Please install Node.js from https://nodejs.org to use the local server.
    echo.
    pause
    exit /b 1
)

:: Find local IP addresses
echo Your local IP addresses to connect:
echo ----------------------------------------------------
set "FIRST_IP="
for /f "tokens=2 delims=:" %%i in ('ipconfig ^| findstr /C:"IPv4 Address" /C:"Adresse IPv4" /C:"IPv4"') do (
    set ip=%%i
    set ip=!ip: =!
    echo ws://!ip!:8787
    if not defined FIRST_IP (
        set "FIRST_IP=!ip!"
        <nul set /p ="ws://!ip!:8787" | clip
    )
)
echo ----------------------------------------------------
if defined FIRST_IP (
    echo.
    echo [OK] Copied to clipboard: ws://%FIRST_IP%:8787
    echo      Send this address to your guests so they can join!
)
echo.
echo Keep this window open during your session.
echo.
echo Starting server...
echo.

:: Launch the server using relative path from this script's location
set "SERVER_SCRIPT=%~dp0..\..\scripts\sync-relay-server.js"

if exist "%SERVER_SCRIPT%" (
    node "%SERVER_SCRIPT%"
) else (
    echo [ERROR] Could not find %SERVER_SCRIPT%
    echo Make sure the addon files are completely extracted.
    echo.
    pause
    exit /b 1
)

pause
