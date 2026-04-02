const WebSocket = require('ws');

console.log('\n=== Testing Restart Button Fix ===\n');

async function testRestartButton() {
  return new Promise((resolve, reject) => {
    const host = new WebSocket('ws://localhost:3001');
    let hostId = null;
    let phaseHistory = [];
    let messageLog = [];
    let resetReceived = false;

    host.on('open', () => {
      console.log('[Host] Connected, sending join...');
      host.send(JSON.stringify({ type: 'join', name: 'RestartTester' }));
    });

    host.on('message', (data) => {
      const msg = JSON.parse(data);
      messageLog.push(msg.type);

      if (msg.type === 'joined') {
        hostId = msg.playerId;
        console.log(`[Host] Joined with ID: ${hostId}`);
      }

      if (msg.type === 'players') {
        console.log(`[Host] Players list received`);
        // If host and no game started yet
        if (msg.hostId === hostId && !phaseHistory.includes('day')) {
          setTimeout(() => {
            console.log('[Host] Setting roles...');
            host.send(JSON.stringify({ 
              type: 'setRoles', 
              roles: ['seer', 'murder', 'guard'] 
            }));
          }, 200);
        }
      }

      if (msg.type === 'rolesSet') {
        console.log('[Host] Roles set, starting game...');
        setTimeout(() => {
          host.send(JSON.stringify({ type: 'start' }));
        }, 200);
      }

      if (msg.type === 'phase') {
        phaseHistory.push(msg.phase);
        console.log(`[Host] Phase: ${msg.phase}`);

        // If game just started (day phase), wait and then restart
        if (msg.phase === 'day' && phaseHistory.filter(p => p === 'day').length === 1) {
          setTimeout(() => {
            console.log('[Host] Clicking RESTART button...');
            host.send(JSON.stringify({ type: 'restart' }));
          }, 1000);
        }
      }

      if (msg.type === 'reset') {
        resetReceived = true;
        console.log('[Host] ✓ Received RESET message from server');
      }

      if (msg.type === 'error') {
        console.error(`[Host] Error from server: ${msg.message}`);
      }
    });

    host.on('error', (err) => {
      console.error(`[Host] WebSocket error: ${err}`);
      reject(err);
    });

    // Wait 6 seconds then check results
    setTimeout(() => {
      console.log('\n--- Test Results ---');
      console.log(`Messages received: ${messageLog.join(', ')}`);
      console.log(`Phase history: ${phaseHistory.join(' → ')}`);
      console.log(`Reset message received: ${resetReceived}`);

      if (phaseHistory.includes('day') && resetReceived && phaseHistory.includes('waiting')) {
        console.log('\n✓ Restart button works correctly!');
        console.log('  Game started → Host clicked restart → Game returned to lobby\n');
        host.close();
        resolve(true);
      } else {
        console.log('\n✗ Restart button did not work properly');
        host.close();
        resolve(false);
      }
    }, 6000);

    setTimeout(() => {
      reject(new Error('Test timeout'));
    }, 10000);
  });
}

testRestartButton()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((err) => {
    console.error(`\nTest failed: ${err.message}\n`);
    process.exit(1);
  });
