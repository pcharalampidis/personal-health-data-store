@echo off
echo =========================================
echo Killing all processes on port 8545
echo =========================================

for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8545 ^| findstr LISTENING') do (
    echo Killing PID: %%a
    taskkill /F /PID %%a
)

for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8545 ^| findstr ESTABLISHED') do (
    echo Killing PID: %%a
    taskkill /F /PID %%a
)

echo.
echo Port 8545 should now be free!
echo.
netstat -ano | findstr :8545 || echo Port 8545 is FREE
echo.
pause
