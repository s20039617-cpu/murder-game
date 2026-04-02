#!/usr/bin/env node

/**
 * Port Kill Utility - Finds and kills any process using a specified port
 * Usage: node kill-port.js <port_number>
 * Example: node kill-port.js 3001
 */

const { exec } = require('child_process');
const os = require('os');

const port = process.argv[2];

if (!port) {
  console.error('❌ No port specified');
  console.error('Usage: node kill-port.js <port>');
  console.error('Example: node kill-port.js 3001');
  process.exit(1);
}

if (isNaN(port) || port < 1 || port > 65535) {
  console.error(`❌ Invalid port: ${port}`);
  console.error('Port must be a number between 1 and 65535');
  process.exit(1);
}

console.log(`🔍 Searching for processes using port ${port}...`);

const isWindows = os.platform() === 'win32';
const isLinux = os.platform() === 'linux';
const isMac = os.platform() === 'darwin';

let command;

if (isWindows) {
  // Windows command to find and kill processes on a port
  command = `netstat -ano | findstr :${port}`;
} else if (isLinux) {
  // Linux command
  command = `lsof -i :${port}`;
} else if (isMac) {
  // macOS command
  command = `lsof -i :${port}`;
} else {
  console.error('❌ Unsupported operating system');
  process.exit(1);
}

exec(command, (error, stdout, stderr) => {
  if (error && !isWindows) {
    console.error('❌ Error finding process:', error.message);
    if (stderr.includes('command not found')) {
      console.error('💡 Try installing lsof: sudo apt-get install lsof (Linux) or brew install lsof (macOS)');
    }
    process.exit(1);
  }

  if (!stdout) {
    console.log(`✓ No processes found using port ${port}`);
    process.exit(0);
  }

  console.log('📋 Found:');
  console.log(stdout);

  let pid;

  if (isWindows) {
    // Parse Windows netstat output
    const lines = stdout.split('\n');
    if (lines.length > 0) {
      const parts = lines[0].trim().split(/\s+/);
      pid = parts[parts.length - 1];
    }
  } else {
    // Parse Linux/macOS lsof output
    const lines = stdout.split('\n');
    if (lines.length > 1) {
      const parts = lines[1].split(/\s+/);
      pid = parts[1];
    }
  }

  if (!pid || isNaN(pid)) {
    console.error('❌ Could not extract process ID');
    process.exit(1);
  }

  console.log(`\n🔪 Killing process with PID: ${pid}`);

  const killCommand = isWindows ? `taskkill /PID ${pid} /F` : `kill -9 ${pid}`;

  exec(killCommand, (killError, killStdout, killStderr) => {
    if (killError) {
      console.error('❌ Error killing process:', killError.message);
      process.exit(1);
    }

    console.log(`✓ Successfully killed process ${pid}`);
    console.log(`✓ Port ${port} is now available`);
    process.exit(0);
  });
});
