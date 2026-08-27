@echo off
REM ============================================================
REM 研习台 · 一键部署（提交并推送到 GitHub Pages）
REM 用法：双击本文件即可。会更新版本号、提交、推送。
REM 认证：优先用 GitHub CLI 的临时 token（不明文存密码）；
REM       若未装 gh，则退回 git 已配置的 origin。
REM ============================================================
cd /d %~dp0

REM 提交说明（默认带时间戳）
set "MSG=update: %date% %time%"

REM 更新版本号（格式 YYYY-MM-DD.HHMMSS），触发手机端自动刷新拿到新版
for /f "tokens=*" %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd.HHmmss"') do set "VER=%%i"
echo %VER%> version.txt

where gh >nul 2>nul
if not errorlevel 1 (
  for /f "tokens=*" %%i in ('gh auth token') do set "GH_TOKEN=%%i"
)

if defined GH_TOKEN (
  git add -A
  git commit -m "%MSG%"
  git push https://FHRU1118:%GH_TOKEN%@github.com/FHRU1118/FHRU_academic_system.git main
) else (
  git add -A
  git commit -m "%MSG%"
  git push origin main
)

if errorlevel 1 (
  echo.
  echo 推送失败，请检查网络或 GitHub 登录状态。
  pause
  exit /b 1
)

echo.
echo 部署完成。约 1 分钟后手机刷新即可看到更新。
echo 若首次启用 GitHub Pages，请到仓库 Settings -> Pages 确认已发布。
pause
