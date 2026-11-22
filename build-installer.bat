@echo off
chcp 65001 >nul
title LionAxon - build the Windows setup
cd /d "%~dp0"

rem The setup holds the whole app (nothing is downloaded while it installs): dist\LionAxon-Setup-x64.exe,
rem and the portable version dist\LionAxon-win-x64.zip. Version 0.1 has not been packaged yet: this is
rem the first try, made with electron-builder.
if not exist "node_modules\electron" call npm install
echo Building the Windows setup and the portable version into .\dist ...
call npm run dist:win
echo.
echo Done. See the "dist" folder.
pause
