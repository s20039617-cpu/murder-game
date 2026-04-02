const WebSocket = require('ws');

console.log('\n=== Testing Restart Button (Multi-Player) ===\n');

async function testRestartWithMultiplePlayers() {
  return new Promise((resolve, reject) => {
    let host = null;
    let player2 = null;
    
    let gamePhase = 'waiting';
    let resetReceived = false;
    let phaseAfterReset = null;
    
    const startHost = () => {
      host = new WebSocket('ws://localhost:3001');
      
      host.on('open', () => {
        console.log('[Host] Connected, sending join...');
        host.send(JSON.stringify({ type: 'join', name: 'HostRestart' }));
      });
      
      host.on('message', (data) => {
        const msg = JSON.parse(data);
        
        if (msg.type === 'joined') {
          console.log(`[Host] Joined with ID: ${msg.playerId}`);
        }
        
        if (msg.type === 'players') {
          console.log(`[Host] Players: ${msg.players.length}`);
          
          // If 2 players and host and haven't started yet
          if (msg.players.length === 2 && msg.hostId === msg.players[0].id && gamePhase === 'waiting') {
            setTimeout(() => {
              console.log('[Host] Setting roles for 2 players...');
              host.send(JSON.stringify({ 
                type: 'setRoles', 
                roles: ['murder', 'seer'] 
              }));
            }, 300);
          }
        }
        
        if (msg.type === 'rolesSet') {
          console.log('[Host] Roles configured');
          setTimeout(() => {
            console.log('[Host] Starting game...');
            host.send(JSON.stringify({ type: 'start' }));
          }, 200);
        }
        
        if (msg.type === 'phase') {
          gamePhase = msg.phase;
          console.log(`[Host] Phase: ${msg.phase}`);
          
          // If game is on day phase, restart after 1 second
          if (msg.phase === 'day') {
            setTimeout(() => {
              console.log('[Host] Clicking RESTART button...');
              host.send(JSON.stringify({ type: 'restart' }));
            }, 1000);
          }
        }
        
        if (msg.type === 'reset') {
          resetReceived = true;
          console.log('[Host] ✓ Received RESET message');
        }
        
        if (msg.type === 'role') {
          console.log(`[Host] Role: ${msg.role}`);
        }
      });
      
      host.on('error', (err) => {
        console.error(`[Host] Error: ${err}`);
      });
    };

    const startPlayer2 = () => {
      player2 = new WebSocket('ws://localhost:3001');
      
      player2.on('open', () => {
        console.log('[Player2] Connected, sending join...');
        player2.send(JSON.stringify({ type: 'join', name: 'Player2' }));
      });
      
      player2.on('message', (data) => {
        const msg = JSON.parse(data);
        
        if (msg.type === 'joined') {
          console.log(`[Player2] Joined`);
        }
        
        if (msg.type === 'players') {
          console.log(`[Player2] Players: ${msg.players.length}`);
        }
        
        if (msg.type === 'phase') {
          console.log(`[Player2] Phase: ${msg.phase}`);
        }
        
        if (msg.type === 'reset') {
          console.log('[Player2] ✓ Received RESET message');
          phaseAfterReset = 'reset_received';
        }
        
        if (msg.type === 'role') {
          console.log(`[Player2] Role: ${msg.role}`);
        }
      });
      
      player2.on('error', (err) => {
        console.error(`[Player2] Error: ${err}`);
      });
    };

    // Start host
    startHost();
    
    // Start second player after delay
    setTimeout(() => {
      startPlayer2();
    }, 500);
    
    // Check results after 8 seconds
    setTimeout(() => {
      console.log('\n--- Test Results ---');
      console.log(`Final phase: ${gamePhase}`);
      console.log(`Reset received: ${resetReceived}`);
      console.log(`Phase after reset: ${phaseAfterReset}`);
      
      if (gamePhase === 'day' && resetReceived && phaseAfterReset === 'reset_received') {
        console.log('\n✓ Restart button works! Game was reset and lobby returned.\n');
        host.close();
        player2.close();
        resolve(true);
      } else {
        console.log('\n✗ Restart test did not complete successfully');
        host.close();
        if (player2) player2.close();
        resolve(false);
      }
    }, 8000);

    setTimeout(() => {
      reject(new Error('Test timeout'));
    }, 12000);
  });
}

testRestartWithMultiplePlayers()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((err) => {
    console.error(`\nTest failed: ${err.message}\n`);
    process.exit(1);
  });
