@echo off
chcp 65001 >nul
echo ===========================================
echo   商周大战 - 局域网联机服务器
echo ===========================================
echo.
echo 正在检查 Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo 错误: 未安装 Node.js，请先安装 https://nodejs.org/
    pause
    exit /b 1
)
echo Node.js 已安装
echo.
echo 正在检查依赖...
if not exist node_modules (
    echo 首次运行，正在安装依赖...
    npm install
    echo.
)
echo 依赖已就绪
echo.
echo 正在获取本机 IP 地址...
echo -------------------------------------------
ipconfig | findstr "IPv4"
echo -------------------------------------------
echo.
echo 服务器启动中，请将上述 IP 地址告诉对手
echo 对手需要输入 IP:8080 连接
echo.
echo 按 Ctrl+C 停止服务器
echo.
node server.js
pause
