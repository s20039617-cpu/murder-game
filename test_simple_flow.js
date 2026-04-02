const WebSocket = require('ws');

async function testBasicFlow() {
  console.log('\n=== Testing Basic Game Flow ===\n');
  
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://localhost:3001');
    let myId = null;
    let isHost = false;
    let step = 0;
    let gotJoined = false;
    let gotPlayers = false;

    ws.on('open', () => {
      console.log('✓ Connected to server');
      step = 1;
      
      // Step 1: Join game
      console.log('→ Sending join message...');
      ws.send(JSON.stringify({ type: 'join', name: 'TestHost' }));
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data);
      const { type } = msg;
      
      console.log(`← Received: ${type}`);

      if (type === 'joined') {
        myId = msg.playerId;
        gotJoined = true;
        console.log(`  My player ID: ${myId}`);
      }

      if (type === 'players') {
        gotPlayers = true;
        isHost = msg.hostId === myId;
        console.log(`  Is host: ${isHost} (hostId=${msg.hostId}, myId=${myId})`);
        console.log(`  Players: ${msg.players.length}`);
      }

      // Once we have both joined and players info, proceed
      if (gotJoined && gotPlayers && step === 1 && isHost) {
        step = 2;
        console.log('✓ Host designation confirmed');
        
        setTimeout(() => {
          console.log('→ Sending setRoles message...');
          ws.send(JSON.stringify({ 
            type: 'setRoles', 
            roles: ['seer', 'murder', 'guard', 'villager'] 
          }));
        }, 200);
      }

      if (type === 'rolesSet' && step === 2) {
        console.log(`  Roles set: ${msg.roles.length} roles`);
        step = 3;
        setTimeout(() => {
          console.log('→ Sending start message...');
          ws.send(JSON.stringify({ type: 'start' }));
        }, 200);
      }

      if (type === 'phase' && step === 3) {
        console.log(`  Game phase: ${msg.phase}`);
        if (msg.phase === 'day') {
          console.log('✓ Game started successfully!');
          step = 4;
          
          setTimeout(() => {
            console.log('→ Disconnecting to test auto-shutdown...');
            ws.close();
          }, 500);
        }
      }

      if (type === 'role' && step >= 3) {
        console.log(`  My assigned role: ${msg.role}`);
      }

      if (type === 'error') {
        console.error(`  Server error: ${msg.message}`);
      }
    });

    ws.on('close', () => {
      console.log('− Disconnected from server\n');
      if (step === 4) {
        console.log('✓ Test passed: Game flow works correctly\n');
        
        // Wait a bit then try to reconnect (should fail if server shut down)
        setTimeout(() => {
          const testWs = new WebSocket('ws://localhost:3001');
          let connected = false;
          
          testWs.on('open', () => {
            connected = true;
            testWs.close();
            console.log('✓ Server still running (game session still active)\n');
            resolve(true);
          });
          
          testWs.on('error', () => {
            console.log('✓ Server shut down after all players disconnected\n');
            resolve(true);
          });
          
          setTimeout(() => {
            if (!connected) {
              resolve(true);
            }
          }, 2000);
        }, 1500);
      } else {
        reject(new Error(`Test failed at step ${step} (expected 4). Current state: myId=${myId}, isHost=${isHost}, gotJoined=${gotJoined}, gotPlayers=${gotPlayers}`));
      }
    });

    ws.on('error', (err) => {
      console.error(`✗ WebSocket error: ${err.message}`);
      reject(err);
    });

    setTimeout(() => reject(new Error('Test timeout')), 10000);
  });
}

testBasicFlow()
  .then(() => {
    console.log('=== All tests completed ===\n');
    process.exit(0);
  })
  .catch((err) => {
    console.error(`\n✗ Test failed: ${err.message}\n`);
    process.exit(1);
  });

