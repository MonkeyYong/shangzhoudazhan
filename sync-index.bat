@echo off
rem Sync the GitHub Pages entry (index.html) from the source app file.
rem Source = the single *.html under .\codes\  (kept ASCII/wildcard to avoid
rem embedding the Chinese filename, so cmd codepage cannot break the copy).
rem Run after editing codes\*.html. Double-click or run from any shell.
setlocal
set "SRC=%~dp0codes"
set "DST=%~dp0index.html"
set "FOUND="
for %%f in ("%SRC%\*.html") do (
  copy /Y "%%f" "%DST%" >nul && set "FOUND=1"
)
if not defined FOUND (
  echo [sync] ERROR: no .html found in %SRC%
  exit /b 1
)
echo [sync] index.html updated from codes\*.html
endlocal
