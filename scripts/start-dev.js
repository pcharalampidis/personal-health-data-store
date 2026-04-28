#!/usr/bin/env node
/**
 * Start Development Environment Script
 * Runs Hardhat node, deploys contracts, starts backend and frontend
 */

import { spawn, exec } from 'child_process';
import { platform } from 'os';
import { promisify } from 'util';
import http from 'http';

const execAsync = promisify(exec);
const isWindows = platform() === 'win32';
const processes = [];

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step, total, message) {
  log(`[${step}/${total}] ${message}`, 'cyan');
}

// Kill processes on port 8545 only
async function cleanupProcesses() {
  log('    Checking port 8545...', 'yellow');
  
  try {
    if (isWindows) {
      // Only kill processes using port 8545 (not all Node processes)
      await execAsync('for /f "tokens=5" %a in (\'netstat -ano ^| findstr :8545\') do taskkill /F /PID %a 2>nul').catch(() => {});
    } else {
      // Unix/Mac: find and kill only what's on port 8545
      await execAsync('lsof -ti:8545 | xargs kill -9 2>/dev/null || true').catch(() => {});
    }
  } catch (e) {
    // Ignore errors - processes might not exist
  }
  
  log('    Port 8545 cleanup complete!', 'green');
}

// Check if Hardhat node is responding
function checkHardhatNode() {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: 8545,
      path: '/',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, () => {
      resolve(true);
    });
    
    req.on('error', () => {
      resolve(false);
    });
    
    req.write(JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 }));
    req.end();
  });
}

// Run command and return promise
function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      stdio: options.silent ? 'ignore' : 'inherit',
      shell: isWindows,
      detached: !isWindows,
      ...options
    });
    
    if (options.detached) {
      processes.push(proc);
    }
    
    if (!options.detached) {
      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command failed with code ${code}`));
        }
      });
    } else {
      resolve(proc);
    }
  });
}

// Sleep function
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('\n' + '='.repeat(50));
  log('Personal Health Data Store - Startup', 'bright');
  console.log('='.repeat(50) + '\n');

  try {
    // Step 0: Cleanup port 8545
    logStep(0, 6, 'Cleaning up port 8545...');
    await cleanupProcesses();
    await sleep(3000);

    // Step 1: Start Hardhat node
    console.log();
    logStep(1, 6, 'Starting Hardhat node...');
    log('    Launching Hardhat node...', 'yellow');
    
    await runCommand('npx', ['hardhat', 'node'], { 
      detached: true,
      silent: true 
    });
    
    log('    Waiting for node to initialize (8s)...', 'yellow');
    await sleep(8000);
    
    // Verify node is responding
    log('    Verifying node is ready...', 'yellow');
    let nodeReady = await checkHardhatNode();
    if (!nodeReady) {
      log('    Waiting additional 5s...', 'yellow');
      await sleep(5000);
      nodeReady = await checkHardhatNode();
    }
    
    if (!nodeReady) {
      throw new Error('Hardhat node failed to start. Check if port 8545 is available.');
    }
    log('    Hardhat node is ready!', 'green');

    // Step 2: Deploy contracts
    console.log();
    logStep(2, 6, 'Deploying contracts...');
    await runCommand('npx', ['hardhat', 'run', 'scripts/deploy.ts', '--network', 'localhost']);
    log('    Contracts deployed successfully!', 'green');

    // Step 3: Start Backend
    console.log();
    logStep(3, 6, 'Starting Backend...');
    const backendProc = spawn('npm', ['run', 'dev:backend'], {
      stdio: 'inherit',
      shell: isWindows,
      detached: !isWindows
    });
    processes.push(backendProc);
    log('    Backend starting on http://localhost:3001', 'green');

    // Step 4: Start Frontend
    console.log();
    logStep(4, 6, 'Starting Frontend...');
    const frontendProc = spawn('npm', ['run', 'dev:frontend'], {
      stdio: 'inherit',
      shell: isWindows,
      detached: !isWindows
    });
    processes.push(frontendProc);
    log('    Frontend starting on http://localhost:5173', 'green');

    // Step 5: Wait and open browser
    console.log();
    logStep(5, 6, 'Waiting for servers to start...');
    await sleep(5000);
    log('    All servers ready!', 'green');

    console.log('\n' + '='.repeat(50));
    log('All services started successfully!', 'bright');
    console.log('='.repeat(50) + '\n');

    log('Services running:', 'bright');
    log('  - Hardhat Node:      http://127.0.0.1:8545', 'blue');
    log('  - Backend API:       http://localhost:3001', 'blue');
    log('  - Frontend:          http://localhost:5173', 'blue');

    console.log('\nPress Ctrl+C to stop all services\n');

    // Keep script running
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', () => {
      cleanup();
    });

  } catch (error) {
    log(`\nERROR: ${error.message}`, 'red');
    cleanup();
    process.exit(1);
  }
}

function cleanup() {
  console.log('\nStopping all services...\n');
  
  processes.forEach(proc => {
    try {
      if (isWindows) {
        spawn('taskkill', ['/pid', proc.pid, '/f', '/t'], { stdio: 'ignore' });
      } else {
        process.kill(-proc.pid, 'SIGTERM');
      }
    } catch (e) {
      // Process might already be dead
    }
  });
  
  process.exit(0);
}

// Handle cleanup on exit
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

main();
