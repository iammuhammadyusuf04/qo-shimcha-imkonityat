@echo off
rem Windows ishga tushganda agent avtomatik ochilishi uchun.
set "T=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\PrinterAgent.vbs"
echo CreateObject("WScript.Shell").Run """%~dp0start-agent.bat""", 0 > "%T%"
echo O'rnatildi. Kompyuterni qayta yoqqanda agent o'zi ishga tushadi.
start "" "%~dp0start-agent.bat"
