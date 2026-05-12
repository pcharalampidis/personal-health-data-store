@echo off

echo =========================================
echo Personal Health Data Store - Startup
echo =========================================
echo.

:: Step 0: Kill anything on port 8545
echo [0/5] Cleaning port 8545...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8545 ^| findstr LISTENING') do (
    echo     Killing %%a
    taskkill /F /PID %%a 2>nul
)
timeout /t 2 /nobreak >nul
echo     Done cleaning
echo.

:: Step 1: Compile Contracts and Start Hardhat node
echo [1/5] Compiling contracts...
call npx hardhat compile
echo.
echo Starting Hardhat node...
start "Hardhat Node" cmd /k "npx hardhat node"
echo     Waiting 10 seconds for node to start...
timeout /t 10 /nobreak >nul
echo     Hardhat node should be running!
echo.

:: Step 2: Deploy contracts
echo [2/5] Deploying contracts...
call npx hardhat run scripts/deploy.ts --network localhost
if errorlevel 1 (
    echo     ERROR: Deploy failed!
    pause
    exit /b 1
)
echo     Contracts deployed!
echo.

:: Step 3: Start Backend
echo [3/5] Starting Backend...
start "Backend Server" cmd /k "npm run dev:backend"
echo.

:: Step 4: Start Frontend
echo [4/5] Starting Frontend...
start "Frontend Server" cmd /k "npm run dev:frontend"
echo.

:: Step 5: Done
echo [5/5] All done!
timeout /t 3 /nobreak >nul
echo.
echo =========================================
echo SUCCESS! All services started
echo =========================================
echo.
echo Open: http://localhost:5173
echo.
echo Press any key to stop all services...
pause >nul

echo Stopping services...
taskkill /F /FI "WINDOWTITLE eq Hardhat*" 2>nul
taskkill /F /FI "WINDOWTITLE eq Backend*" 2>nul
taskkill /F /FI "WINDOWTITLE eq Frontend*" 2>nul
echo Done!
pause
