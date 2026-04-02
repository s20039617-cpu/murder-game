const WebSocket = require('ws');

console.log('\n=== Multi-Player Game Flow Test ===\n');

async function runMultiPlayerTest() {
  return new Promise((resolve, reject) => {
    let host = null;
    let player2 = null;
    let player3 = null;
    
    let hostId = null;
    let hostState = { joined: false, gotPlayers: false, rolesSet: false, gameStarted: false };
    let player2State = { joined: false, gotPlayers: false, gameStarted: false };
    let player3State = { joined: false, gotPlayers: false, gameStarted: false };
    
    const startHost = () => {
      host = new WebSocket('ws://localhost:3001');
      
      host.on('open', () => {
        console.log('[Host] Connected, sending join...');
        host.send(JSON.stringify({ type: 'join', name: 'GameHost' }));
      });
      
      host.on('message', (data) => {
        const msg = JSON.parse(data);
        
        if (msg.type === 'joined') {
          hostId = msg.playerId;
          hostState.joined = true;
          console.log(`[Host] Joined with ID: ${hostId}`);
        }
        
        if (msg.type === 'players') {
          hostState.gotPlayers = true;
          console.log(`[Host] Players list received: ${msg.players.length} players, hostId=${msg.hostId}`);
          
          // If 3 players and we're host, set roles and start
          if (msg.players.length === 3 && msg.hostId === hostId && !hostState.rolesSet) {
            setTimeout(() => {
              console.log('[Host] All players joined! Setting roles...');
              host.send(JSON.stringify({ 
                type: 'setRoles', 
                roles: ['seer', 'murder', 'guard'] 
              }));
            }, 300);
          }
        }
        
        if (msg.type === 'rolesSet') {
          hostState.rolesSet = true;
          console.log('[Host] Roles configured');
          setTimeout(() => {
            console.log('[Host] Starting game...');
            host.send(JSON.stringify({ type: 'start' }));
          }, 200);
        }
        
        if (msg.type === 'phase') {
          hostState.gameStarted = true;
          console.log(`[Host] Game phase: ${msg.phase}`);
        }
        
        if (msg.type === 'role') {
          console.log(`[Host] Role assigned: ${msg.role}`);
        }
      });
      
      host.on('error', (err) => {
        console.error(`[Host] WebSocket error: ${err}`);
      });
    };

    const startPlayer = (id) => {
      const player = new WebSocket('ws://localhost:3001');
      
      player.on('open', () => {
        console.log(`[Player${id}] Connected, sending join...`);
        player.send(JSON.stringify({ type: 'join', name: `Player${id}` }));
      });
      
      player.on('message', (data) => {
        const msg = JSON.parse(data);
        
        if (msg.type === 'joined') {
          if (id === 2) {
            player2State.joined = true;
            console.log(`[Player2] Joined with ID: ${msg.playerId}`);
          } else {
            player3State.joined = true;
            console.log(`[Player3] Joined with ID: ${msg.playerId}`);
          }
        }
        
        if (msg.type === 'players') {
          if (id === 2) {
            player2State.gotPlayers = true;
          } else {
            player3State.gotPlayers = true;
          }
          console.log(`[Player${id}] Players list received: ${msg.players.length} players`);
        }
        
        if (msg.type === 'phase') {
          if (id === 2) {
            player2State.gameStarted = true;
          } else {
            player3State.gameStarted = true;
          }
          console.log(`[Player${id}] Game phase: ${msg.phase}`);
        }
        
        if (msg.type === 'role') {
          console.log(`[Player${id}] Role assigned: ${msg.role}`);
        }
      });
      
      player.on('error', (err) => {
        console.error(`[Player${id}] WebSocket error: ${err}`);
      });
      
      return player;
    };

    // Start host
    startHost();
    
    // Join players after delays
    setTimeout(() => {
      player2 = startPlayer(2);
    }, 500);
    
    setTimeout(() => {
      player3 = startPlayer(3);
    }, 1000);
    
    // Check results after 8 seconds
    setTimeout(() => {
      console.log('\n--- Test Results ---');
      console.log(`Host - Joined: ${hostState.joined}, GotPlayers: ${hostState.gotPlayers}, RolesSet: ${hostState.rolesSet}, GameStarted: ${hostState.gameStarted}`);
      console.log(`Player2 - Joined: ${player2State.joined}, GotPlayers: ${player2State.gotPlayers}, GameStarted: ${player2State.gameStarted}`);
      console.log(`Player3 - Joined: ${player3State.joined}, GotPlayers: ${player3State.gotPlayers}, GameStarted: ${player3State.gameStarted}`);
      
      const allSuccessful = hostState.joined && hostState.gotPlayers && hostState.rolesSet && hostState.gameStarted &&
                           player2State.joined && player2State.gotPlayers && player2State.gameStarted &&
                           player3State.joined && player3State.gotPlayers && player3State.gameStarted;
      
      if (allSuccessful) {
        console.log('\n✓ Multi-player game flow works correctly!\n');
        console.log('Now disconnecting all players to test auto-shutdown...');
      } else {
        console.log('\n✗ Some tests failed');
      }
      
      // Close all connections
      if (host) host.close();
      if (player2) player2.close();
      if (player3) player3.close();
      
      // Wait for auto-shutdown and verify
      setTimeout(() => {
        const testWs = new WebSocket('ws://localhost:3001');
        let connected = false;
        
        testWs.on('open', () => {
          connected = true;
          testWs.close();
          console.log('✗ Server still running (wanted auto-shutdown)\n');
          resolve(false);
        });
        
        testWs.on('error', () => {
          console.log('✓ Server auto-shutdown successful!\n');
          resolve(true);
        });
        
        setTimeout(() => {
          if (!connected) {
            resolve(true);
          }
        }, 1500);
      }, 1500);
    }, 8000);

    setTimeout(() => {
      reject(new Error('Test timeout'));
    }, 15000);
  });
}

runMultiPlayerTest()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((err) => {
    console.error(`\nTest failed: ${err.message}\n`);
    process.exit(1);
  });
