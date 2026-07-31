@echo off
rem 把 codes/layouts/*.json 硬编码进 codes/商周大战.html 源码
rem 适用于 file://（双击 HTML）和 HTTP 两种使用方式
rem 源文件 = codes/商周大战.html，发行副本 = index.html（同步）
setlocal
set "ROOT=%~dp0"
node "%ROOT%update-layouts.cjs"
if %ERRORLEVEL% neq 0 (
  echo [sync] ERROR: update-layouts.cjs failed
  exit /b 1
)
echo [sync] Done - open index.html in browser
endlocal
