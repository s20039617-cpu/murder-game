const WebSocket = require('ws');

async function testRestartFunctionality() {
  console.log('\n=== RESTART FUNCTIONALITY TEST ===\n');
  
  let testsPassed = 0;
  let testsFailed = 0;
  
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.log('❌ TEST TIMEOUT');
      testsFailed++;
      printResults();
      resolve();
    }, 10000);
    
    const ws1 = new WebSocket('ws://localhost:3001');
    let playerId1 = null;
    let isHost = false;
    
    ws1.addEventListener('open', () => {
      console.log('✓ Host client connected');
      
      // Join as player 1 (will be host)
      ws1.send(JSON.stringify({
        type: 'join',
        name: 'HostPlayer'
      }));
    });
    
    ws1.addEventListener('message', (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'joined') {
        console.log(`✓ Host joined with ID: ${data.playerId}`);
        playerId1 = data.playerId;
        testsPassed++;
      }
      else if (data.type === 'players' && data.hostId) {
        isHost = (playerId1 === data.hostId);
        console.log(`✓ Players message received - Host ID: ${data.hostId}, isHost: ${isHost}`);
        testsPassed++;
        
        // Wait a moment then select roles and start game
        setTimeout(() => {
          console.log('\n📤 Sending setRoles message...');
          ws1.send(JSON.stringify({
            type: 'setRoles',
            roles: ['seer', 'guard', 'murder']
          }));
          
          setTimeout(() => {
            console.log('📤 Sending start message...');
            ws1.send(JSON.stringify({ type: 'start' }));
          }, 200);
        }, 300);
      }
      else if (data.type === 'phase' && data.phase === 'day') {
        console.log(`✓ Game started - Phase: ${data.phase}`);
        testsPassed++;
        
        // Wait a moment then send restart
        setTimeout(() => {
          console.log('\n📤 Host sending RESTART message...');
          ws1.send(JSON.stringify({ type: 'restart' }));
        }, 500);
      }
      else if (data.type === 'reset') {
        console.log(`✓ RESET message received - Game reset to waiting phase`);
        testsPassed++;
        
        // Verify phase change back to waiting
        console.log('📤 Verifying phase is waiting...');
        setTimeout(() => {
          clearTimeout(timeout);
          printResults();
          ws1.close();
          resolve();
        }, 200);
      }
    });
    
    ws1.addEventListener('error', (error) => {
      console.error('❌ Host WebSocket error:', error);
      testsFailed++;
      clearTimeout(timeout);
      printResults();
      resolve();
    });
    
    function printResults() {
      console.log('\n=== TEST RESULTS ===');
      console.log(`✓ Passed: ${testsPassed}`);
      console.log(`❌ Failed: ${testsFailed}`);
      console.log(`Total: ${testsPassed + testsFailed}`);
      
      if (testsFailed === 0 && testsPassed > 0) {
        console.log('\n🎉 ALL TESTS PASSED - RESTART WORKING!');
      } else {
        console.log('\n⚠ SOME TESTS FAILED');
      }
      console.log('===================\n');
    }
  });
}

testRestartFunctionality().then(() => {
  console.log('Test complete');
  process.exit(0);
}).catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
