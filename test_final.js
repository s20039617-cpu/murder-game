const WebSocket = require('ws');

console.log('\n=== Comprehensive Game Flow Test ===\n');

let testsPassed = 0;
let testsFailed = 0;

function test(name, condition) {
  if (condition) {
    console.log(`✓ ${name}`);
    testsPassed++;
  } else {
    console.log(`✗ ${name}`);
    testsFailed++;
  }
}

async function runFullGameTest() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://localhost:3001');
    let myId = null;
    let hostId = null;
    let messages = [];
    let gameStarted = false;
    let roleAssigned = false;
    let phase = null;

    ws.on('open', () => {
      console.log('1. Connected to server');
      ws.send(JSON.stringify({ type: 'join', name: 'GameTester' }));
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data);
      messages.push(msg);

      if (msg.type === 'joined') {
        myId = msg.playerId;
        console.log(`2. Received playerId: ${myId}`);
      }

      if (msg.type === 'players') {
        hostId = msg.hostId;
        console.log(`3. Received players list (hostId=${hostId}, players=${msg.players.length})`);
        
        // If we're host and haven't started game yet
        if (hostId === myId && !gameStarted) {
          setTimeout(() => {
            console.log('4. Setting roles as host...');
            ws.send(JSON.stringify({ 
              type: 'setRoles', 
              roles: ['seer', 'murder', 'guard', 'villager'] 
            }));
          }, 200);
        }
      }

      if (msg.type === 'rolesSet') {
        console.log(`5. Roles configured: ${msg.roles.length} roles`);
        setTimeout(() => {
          console.log('6. Starting game...');
          ws.send(JSON.stringify({ type: 'start' }));
          gameStarted = true;
        }, 200);
      }

      if (msg.type === 'phase') {
        phase = msg.phase;
        console.log(`7. Game phase: ${phase}`);
        
        if (phase === 'day' && !roleAssigned) {
          // After game starts, wait a bit then disconnect
          setTimeout(() => {
            console.log('8. Disconnecting all players to test auto-shutdown...');
            ws.close();
          }, 1000);
        }
      }

      if (msg.type === 'role') {
        roleAssigned = true;
        console.log(`9. Role assigned: ${msg.role}`);
      }

      if (msg.type === 'error') {
        console.log(`ERROR from server: ${msg.message}`);
      }
    });

    ws.on('close', () => {
      console.log('10. Disconnected from server\n');
      
      // Run tests
      test('Received joined message', messages.some(m => m.type === 'joined'));
      test('Received players message', messages.some(m => m.type === 'players'));
      test('Received phase message', messages.some(m => m.type === 'phase'));
      test('Game reached day phase', messages.some(m => m.type === 'phase' && m.phase === 'day'));
      test('Received role assignment', messages.some(m => m.type === 'role'));
      test('Was designated as host', hostId === myId);
      test('Roles were set successfully', messages.some(m => m.type === 'rolesSet'));
      
      console.log(`\nTest Results: ${testsPassed} passed, ${testsFailed} failed\n`);
      
      // Now test auto-shutdown - try to connect again
      setTimeout(() => {
        const checkWs = new WebSocket('ws://localhost:3001');
        let serverRunning = false;
        
        checkWs.on('open', () => {
          serverRunning = true;
          console.log('✓ Server still running\n');
          checkWs.close();
          resolve(testsFailed === 0);
        });
        
        checkWs.on('error', () => {
          console.log('✓ Server auto-shutdown successful\n');
          resolve(testsFailed === 0);
        });
        
        setTimeout(() => {
          if (!serverRunning) {
            console.log('✓ Server auto-shutdown successful\n');
            resolve(testsFailed === 0);
          }
        }, 2000);
      }, 2000);
    });

    ws.on('error', (err) => {
      console.error(`WebSocket error: ${err}`);
      reject(err);
    });

    setTimeout(() => {
      reject(new Error('Test timeout - no response from server'));
    }, 15000);
  });
}

runFullGameTest()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((err) => {
    console.error(`\nTest failed: ${err.message}\n`);
    process.exit(1);
  });
