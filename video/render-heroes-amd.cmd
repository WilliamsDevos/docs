@echo off
rem Renderiza "Heroes Tonight" en Windows con una GPU AMD. Doble clic o: render-heroes-amd.cmd
cd /d "%~dp0"
where bun >nul 2>nul || (echo Falta bun. Instalalo con: winget install Oven-sh.Bun & pause & exit /b 1)
where ffmpeg >nul 2>nul || (echo Falta ffmpeg. Instalalo con: winget install Gyan.FFmpeg & pause & exit /b 1)
if not exist node_modules call bun install
if not exist public\audio\heroes-tonight.mp3 (
  echo Falta la cancion: guarda el MP3 de ncs.io/HeroesTonight como
  echo   %~dp0public\audio\heroes-tonight.mp3
  pause
  exit /b 1
)
call bun run render:heroes:amd
echo.
echo Listo: %~dp0out\heroes-tonight.mp4
pause
