@echo off
rem Printer agentini ishga tushiradi (sozlamalar oynada kiritiladi). Uzilsa qayta ishga tushadi.
cd /d "%~dp0.."
:loop
node agent\agent.js
timeout /t 5 >nul
goto loop
