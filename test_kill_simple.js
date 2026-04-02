const WebSocket = require('ws');

async function testKillSwitch() {
  console.log('\n=== KILL SWITCH TEST ===\n');
  
  let testsPassed = 0;
  let testsFailed = 0;
  let shutdownReceived = false;
  let connectionClosed = false;
  
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.log('\n⏱️  Test timeout - verifying results');
      checkResults();
    }, 12000);
    
    const ws1 = new WebSocket('ws://localhost:3001');
    
    ws1.addEventListener('open', () => {
      console.log('✓ Client connected to server');
      testsPassed++;
      
      // Join as player (first player = host)
      console.log('📤 Sending join message...');
      ws1.send(JSON.stringify({
        type: 'join',
        name: 'KillTestHost'
      }));
    });
    
    ws1.addEventListener('message', (event) => {
      const data = JSON.parse(event.data);
      console.log(`📥 Received: ${data.type}`);
      
      if (data.type === 'joined') {
        console.log(`✓ Joined with player ID: ${data.playerId}`);
        testsPassed++;
        
        // Start the game
        setTimeout(() => {
          console.log('📤 Sending start game message...');
          ws1.send(JSON.stringify({
            type: 'setRoles',
            roles: ['seer', 'murder']
          }));
          ws1.send(JSON.stringify({ type: 'start' }));
        }, 200);
      }
      else if (data.type === 'phase' && data.phase === 'day') {
        console.log('✓ Game started successfully');
        testsPassed++;
        
        // Send kill command
        setTimeout(() => {
          console.log('📤 Host sending KILL SERVER message...');
          ws1.send(JSON.stringify({ type: 'kill' }));
        }, 300);
      }
      else if (data.type === 'shutdown') {
        console.log('✓ Received shutdown notification from server');
        shutdownReceived = true;
        testsPassed++;
      }
    });
    
    ws1.addEventListener('close', () => {
      connectionClosed = true;
      console.log('✓ Connection closed (server shutdown)');
      testsPassed++;
      
      // Give server time to fully shut down, then check if port is free
      setTimeout(checkIfServerDown, 1500);
    });
    
    ws1.addEventListener('error', (error) => {
      console.error('❌ WebSocket error:', error.message);
      testsFailed++;
      checkResults();
    });
    
    function checkIfServerDown() {
      console.log('\n🔍 Checking if server is down...');
      const testWs = new WebSocket('ws://localhost:3001');
      let connectionAttempted = false;
      
      testWs.addEventListener('open', () => {
        console.log('⚠️ Server still accepting connections');
        testWs.close();
        checkResults();
      });
      
      testWs.addEventListener('error', () => {
        console.log('✓ Server is no longer responding - successfully shutdown');
        testsPassed++;
        testWs.close();
        setTimeout(checkResults, 500);
      });
      
      setTimeout(() => {
        if (!connectionAttempted) {
          testWs.close();
          checkResults();
        }
      }, 2000);
    }
    
    function checkResults() {
      clearTimeout(timeout);
      
      console.log('\n=== TEST RESULTS ===');
      console.log(`✓ Passed: ${testsPassed}`);
      console.log(`❌ Failed: ${testsFailed}`);
      console.log(`Total: ${testsPassed + testsFailed}`);
      console.log(`\nDetails:`);
      console.log(`  Shutdown message received: ${shutdownReceived ? '✓' : '❌'}`);
      console.log(`  Connection closed: ${connectionClosed ? '✓' : '❌'}`);
      
      if (testsFailed === 0 && testsPassed >= 5) {
        console.log('\n🎉 ALL TESTS PASSED - KILL SWITCH WORKING!');
      } else {
        console.log('\n⚠️  TESTS INCOMPLETE OR FAILED');
      }
      console.log('===================\n');
      
      resolve();
    }
  });
}

testKillSwitch().then(() => {
  console.log('Test complete');
  process.exit(0);
}).catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
