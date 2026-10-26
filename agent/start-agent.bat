@echo off
rem Sozlang: server manzili, agent kaliti va Xprinter nomi (Windows "Printerlar" dagi aniq nom)
set SERVER_URL=http://localhost:3000
set AGENT_KEY=agent-uchun-maxfiy-kalit
set PRINTER_NAME=Xprinter XP-365B
cd /d "%~dp0.."
:loop
node agent\agent.js
timeout /t 5 >nul
goto loop
