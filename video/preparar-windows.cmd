@echo off
rem Prepara el proyecto en Windows SIN renderizar: dependencias, carpeta de la cancion y comprobacion de GPU.
cd /d "%~dp0"
echo == Herramientas ==
where bun >nul 2>nul || (echo Falta bun: winget install Oven-sh.Bun  y abre una terminal nueva & pause & exit /b 1)
where ffmpeg >nul 2>nul || (echo Falta ffmpeg: winget install Gyan.FFmpeg  y abre una terminal nueva & pause & exit /b 1)
echo bun y ffmpeg encontrados
echo.
echo == Dependencias del proyecto ==
call bun install
echo.
echo == Cancion ==
if not exist public\audio mkdir public\audio
if exist public\audio\heroes-tonight.mp3 (
  echo public\audio\heroes-tonight.mp3 encontrada
) else (
  echo Falta la cancion. Descargala de https://ncs.io/HeroesTonight y guardala como
  echo   %~dp0public\audio\heroes-tonight.mp3
  echo Abro la carpeta...
  start "" "%~dp0public\audio"
)
echo.
echo == Comprobacion de GPU y codificador (unos segundos, no renderiza) ==
call bun run check:heroes:amd
echo.
echo Cuando quieras renderizar: doble clic en render-heroes-amd.cmd
pause
