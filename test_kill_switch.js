const WebSocket = require('ws');

async function testKillSwitch() {
  console.log('\n=== KILL SWITCH TEST ===\n');
  
  let testsPassed = 0;
  let testsFailed = 0;
  
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.log('❌ TEST TIMEOUT');
      testsFailed++;
      printResults();
      resolve();
    }, 15000);
    
    const ws1 = new WebSocket('ws://localhost:3001');
    let playerId1 = null;
    let gameStarted = false;
    
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
      else if (data.type === 'phase' && data.phase === 'day' && !gameStarted) {
        gameStarted = true;
        console.log(`✓ Game started - Phase: ${data.phase}`);
        testsPassed++;
        
        // Wait a moment then send kill switch
        setTimeout(() => {
          console.log('\n📤 Host sending KILL message...');
          ws1.send(JSON.stringify({ type: 'kill' }));
        }, 500);
      }
      else if (data.type === 'shutdown') {
        console.log(`✓ SHUTDOWN message received`);
        testsPassed++;
        console.log('📡 Server sent shutdown notification to client');
      }
    });
    
    ws1.addEventListener('close', () => {
      console.log('✓ Host connection closed (server shutdown)');
      testsPassed++;
      
      // Verify server is actually down by trying to connect
      setTimeout(() => {
        console.log('\n🔍 Verifying server is down...');
        const testWs = new WebSocket('ws://localhost:3001');
        
        testWs.addEventListener('open', () => {
          console.log('❌ Server still responding - shutdown failed!');
          testsFailed++;
          testWs.close();
          clearTimeout(timeout);
          printResults();
          resolve();
        });
        
        testWs.addEventListener('error', () => {
          console.log('✓ Server is no longer accepting connections');
          testsPassed++;
          clearTimeout(timeout);
          printResults();
          resolve();
        });
      }, 1000);
    });
    
    ws1.addEventListener('error', (error) => {
      console.error('❌ WebSocket error:', error);
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
        console.log('\n🎉 ALL TESTS PASSED - KILL SWITCH WORKING!');
      } else {
        console.log('\n⚠ SOME TESTS FAILED');
      }
      console.log('===================\n');
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
