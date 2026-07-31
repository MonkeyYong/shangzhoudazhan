@echo off
rem 构建发行版 index.html：把 codes/layouts/*.json 嵌入 HTML，消除 file:// 协议下 fetch 被拦截问题
rem 运行方式：双击 sync-index.bat 或在终端执行
rem 源文件 = codes/商周大战.html，发行版 = index.html
setlocal
set "ROOT=%~dp0"
node "%ROOT%embed-layouts.cjs"
if %ERRORLEVEL% neq 0 (
  echo [sync] ERROR: embed-layouts.cjs failed
  exit /b 1
)
echo [sync] Done — open index.html in browser
endlocal
