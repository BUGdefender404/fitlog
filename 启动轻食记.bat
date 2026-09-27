@echo off
chcp 65001 >nul
cd /d %~dp0
echo ================================
echo   轻食记 服务器启动中...
echo   启动后手机连同一 Wi-Fi 访问
echo   页面会打印局域网地址和二维码
echo ================================
npm start
pause
