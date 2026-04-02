const WebSocket = require('ws');

console.log('\n=== Full Restart & Re-start Test ===\n');

async function testFullRestartFlow() {
  return new Promise((resolve, reject) => {
    let host = null;
    let player2 = null;
    
    let phase1 = null;
    let phase2 = null;
    let resetReceived = false;
    let roles1 = null;
    let roles2 = null;

    const startHost = () => {
      host = new WebSocket('ws://localhost:3001');
      
      host.on('open', () => {
        console.log('[Host] Joined server');
        host.send(JSON.stringify({ type: 'join', name: 'TestHost' }));
      });
      
      host.on('message', (data) => {
        const msg = JSON.parse(data);
        
        if (msg.type === 'players' && !phase1) {
          if (msg.players.length === 2) {
            setTimeout(() => {
              console.log('[Host] Setting roles: murder, seer');
              host.send(JSON.stringify({ 
                type: 'setRoles', 
                roles: ['murder', 'seer'] 
              }));
            }, 300);
          }
        }
        
        if (msg.type === 'rolesSet' && !phase1) {
          setTimeout(() => {
            console.log('[Host] Starting game (Game 1)...');
            host.send(JSON.stringify({ type: 'start' }));
          }, 200);
        }
        
        if (msg.type === 'phase' && !phase1) {
          phase1 = msg.phase;
          console.log(`[Host] Game 1 phase: ${msg.phase}`);
          
          if (msg.phase === 'day') {
            setTimeout(() => {
              console.log('[Host] Clicking RESTART...');
              host.send(JSON.stringify({ type: 'restart' }));
            }, 1000);
          }
        }
        
        if (msg.type === 'reset') {
          resetReceived = true;
          console.log('[Host] ✓ Received RESET - back to lobby');
        }
        
        // After reset, start new game with different roles
        if (msg.type === 'players' && resetReceived && !phase2) {
          if (msg.players.length === 2) {
            setTimeout(() => {
              console.log('[Host] Setting new roles: seer, guard');
              host.send(JSON.stringify({ 
                type: 'setRoles', 
                roles: ['seer', 'guard'] 
              }));
            }, 500);
          }
        }
        
        if (msg.type === 'rolesSet' && resetReceived && !phase2) {
          setTimeout(() => {
            console.log('[Host] Starting game (Game 2)...');
            host.send(JSON.stringify({ type: 'start' }));
          }, 200);
        }
        
        if (msg.type === 'phase' && resetReceived && !phase2) {
          phase2 = msg.phase;
          console.log(`[Host] Game 2 phase: ${msg.phase}`);
        }
        
        if (msg.type === 'role') {
          if (!roles1) {
            roles1 = msg.role;
            console.log(`[Host] Game 1 role: ${msg.role}`);
          } else if (!roles2) {
            roles2 = msg.role;
            console.log(`[Host] Game 2 role: ${msg.role}`);
          }
        }
      });
      
      host.on('error', console.error);
    };

    const startPlayer2 = () => {
      player2 = new WebSocket('ws://localhost:3001');
      
      player2.on('open', () => {
        console.log('[Player2] Joined server');
        player2.send(JSON.stringify({ type: 'join', name: 'TestPlayer2' }));
      });
      
      player2.on('message', (data) => {
        const msg = JSON.parse(data);
        
        if (msg.type === 'phase') {
          console.log(`[Player2] Phase: ${msg.phase}`);
        }
        
        if (msg.type === 'reset') {
          console.log('[Player2] ✓ Received RESET');
        }
        
        if (msg.type === 'role') {
          console.log(`[Player2] Role: ${msg.role}`);
        }
      });
      
      player2.on('error', console.error);
    };

    // Start host and player 2
    startHost();
    setTimeout(() => startPlayer2(), 500);
    
    // Check results after 10 seconds
    setTimeout(() => {
      console.log('\n--- Test Results ---');
      console.log(`Game 1 - Phase: ${phase1}, Role: ${roles1}`);
      console.log(`Reset received: ${resetReceived}`);
      console.log(`Game 2 - Phase: ${phase2}, Role: ${roles2}`);
      
      if (phase1 === 'day' && resetReceived && phase2 === 'day' && roles2 !== roles1) {
        console.log('\n✅ SUCCESS! Complete restart & re-start flow works:');
        console.log('   1. Started Game 1 with murder/seer roles');
        console.log('   2. Restarted and returned to lobby');
        console.log('   3. Host changed roles to seer/guard');
        console.log('   4. Started Game 2 with new roles\n');
        host.close();
        player2.close();
        resolve(true);
      } else {
        console.log('\n❌ Test incomplete');
        host.close();
        player2.close();
        resolve(false);
      }
    }, 10000);

    setTimeout(() => reject(new Error('Timeout')), 12000);
  });
}

testFullRestartFlow()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((err) => {
    console.error(`\n❌ Test failed: ${err.message}\n`);
    process.exit(1);
  });
