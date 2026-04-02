const WebSocket = require('ws');

const tests = [];
let passCount = 0;
let failCount = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

async function runTests() {
  console.log('\n=== Testing Button Visibility & Auto-Shutdown ===\n');
  
  for (const t of tests) {
    try {
      await t.fn();
      console.log(`✓ ${t.name}`);
      passCount++;
    } catch (e) {
      console.log(`✗ ${t.name}`);
      console.log(`  Error: ${e.message}`);
      failCount++;
    }
  }
  
  console.log(`\n=== Results: ${passCount}/${tests.length} passed ===\n`);
  process.exit(failCount > 0 ? 1 : 0);
}

// Test 1: Host joins and receives players list
test('Host joins and gets host designation', async () => {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://localhost:3001');
    let receivedPlayers = false;
    let isHost = false;

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'join', name: 'HostPlayer' }));
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data);
      
      if (msg.type === 'joined') {
        console.log('  [Test] Received join confirmation');
      }
      
      if (msg.type === 'players') {
        console.log(`  [Test] Received players list: ${msg.players.length} player(s)`);
        isHost = msg.hostId === msg.players[0]?.id;
        receivedPlayers = true;
        console.log(`  [Test] Player is host: ${isHost}`);
        
        if (receivedPlayers && isHost) {
          ws.close();
          resolve();
        }
      }
    });

    ws.on('error', reject);
    setTimeout(() => reject(new Error('Timeout')), 3000);
  });
});

// Test 2: Host starts game and receives phase change
test('Host can start game and receives phase', async () => {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://localhost:3001');
    let myId = null;
    let receivedPhase = false;

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'join', name: 'HostPlayer2' }));
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data);
      
      if (msg.type === 'joined') {
        myId = msg.playerId;
      }
      
      if (msg.type === 'players' && myId) {
        // Send setRoles and start
        ws.send(JSON.stringify({ 
          type: 'setRoles', 
          roles: ['seer', 'murder', 'guard', 'villager'] 
        }));
        
        setTimeout(() => {
          ws.send(JSON.stringify({ type: 'start' }));
        }, 100);
      }
      
      if (msg.type === 'phase') {
        console.log(`  [Test] Received phase: ${msg.phase}`);
        receivedPhase = true;
        if (msg.phase === 'day' && receivedPhase) {
          ws.close();
          resolve();
        }
      }
    });

    ws.on('error', reject);
    setTimeout(() => reject(new Error('Timeout')), 5000);
  });
});

// Test 3: Multi-player game starts and then host disconnects (trigger auto-shutdown)
test('Auto-shutdown triggers when all players disconnect', async () => {
  return new Promise((resolve, reject) => {
    let host = null;
    let player2 = null;
    let hostConnected = false;
    let player2Connected = false;
    let gameStarted = false;

    // Connect host
    host = new WebSocket('ws://localhost:3001');
    host.on('open', () => {
      console.log('  [Test] Host connected');
      host.send(JSON.stringify({ type: 'join', name: 'Host' }));
    });

    host.on('message', (data) => {
      const msg = JSON.parse(data);
      
      if (msg.type === 'joined') {
        hostConnected = true;
      }
      
      if (msg.type === 'players' && hostConnected && !gameStarted) {
        // If we have multiple players, start game
        if (msg.players.length >= 2) {
          console.log(`  [Test] ${msg.players.length} players connected, starting game`);
          host.send(JSON.stringify({ 
            type: 'setRoles', 
            roles: ['seer', 'murder', 'guard', 'villager'] 
          }));
          
          setTimeout(() => {
            host.send(JSON.stringify({ type: 'start' }));
            gameStarted = true;
          }, 100);
        }
      }
      
      if (msg.type === 'phase' && gameStarted) {
        console.log(`  [Test] Game phase changed to: ${msg.phase}`);
      }
    });

    host.on('error', reject);

    // Connect second player after 1 second
    setTimeout(() => {
      player2 = new WebSocket('ws://localhost:3001');
      player2.on('open', () => {
        console.log('  [Test] Player 2 connected');
        player2.send(JSON.stringify({ type: 'join', name: 'Player2' }));
      });

      player2.on('message', (data) => {
        const msg = JSON.parse(data);
        if (msg.type === 'joined') {
          player2Connected = true;
        }
      });

      player2.on('error', reject);
    }, 500);

    // Wait for game to start, then disconnect both players
    setTimeout(() => {
      if (gameStarted) {
        console.log('  [Test] Disconnecting all players to trigger auto-shutdown');
        host.close();
        if (player2) player2.close();
        
        // Give server time to trigger auto-shutdown
        setTimeout(() => {
          console.log('  [Test] Waiting for auto-shutdown to complete');
          resolve();
        }, 1500);
      }
    }, 3000);

    setTimeout(() => reject(new Error('Game never started')), 6000);
  });
});

// Test 4: Verify server is actually shut down (should fail to connect)
test('Server auto-shutdown prevents new connections', async () => {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const ws = new WebSocket('ws://localhost:3001');
      let connected = false;

      ws.on('open', () => {
        connected = true;
        ws.close();
        reject(new Error('Server should have shut down but connection succeeded'));
      });

      ws.on('error', () => {
        console.log('  [Test] Connection rejected (server shut down as expected)');
        resolve();
      });

      setTimeout(() => {
        if (!connected) {
          resolve();
        }
      }, 2000);
    }, 2000);
  });
});

runTests();
