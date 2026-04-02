const WebSocket = require('ws');

// Test: Verify that the join button sends a proper signal
async function testButtonSignal() {
  console.log('\n=== BUTTON SIGNAL TEST ===\n');
  
  const ws = new WebSocket('ws://localhost:3000');
  let testsPassed = 0;
  let testsFailed = 0;

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.log('❌ TEST TIMEOUT: Server did not respond');
      testsFailed++;
      ws.close();
      printResults();
      resolve();
    }, 5000);

    ws.addEventListener('open', () => {
      console.log('✓ WebSocket connected');
      testsPassed++;
      
      // Simulate clicking join button - send join message
      console.log('\n📤 Sending JOIN message with name: "TestPlayer1"');
      const joinMessage = {
        type: 'join',
        name: 'TestPlayer1'
      };
      console.log('  Message:', JSON.stringify(joinMessage));
      ws.send(JSON.stringify(joinMessage));
    });

    ws.addEventListener('message', (event) => {
      const data = JSON.parse(event.data);
      console.log(`\n📥 Received message type: "${data.type}"`);
      console.log('  Data:', JSON.stringify(data, null, 2));

      if (data.type === 'joined') {
        console.log('✓ Server confirmed JOIN - player ID:', data.playerId);
        testsPassed++;
        
        // Wait a bit to see if we get players message
        setTimeout(() => {
          console.log('\n📤 Sending second player join (simulating another client)...');
          const ws2 = new WebSocket('ws://localhost:3000');
          
          ws2.addEventListener('open', () => {
            const joinMessage2 = {
              type: 'join',
              name: 'TestPlayer2'
            };
            console.log('  Message:', JSON.stringify(joinMessage2));
            ws2.send(JSON.stringify(joinMessage2));
          });

          ws2.addEventListener('message', (event2) => {
            const data2 = JSON.parse(event2.data);
            if (data2.type === 'players') {
              console.log(`✓ Received PLAYERS broadcast with ${data2.players.length} players`);
              console.log('  Players:', data2.players.map(p => p.name));
              console.log('  Host ID:', data2.hostId);
              testsPassed++;
              
              clearTimeout(timeout);
              ws.close();
              ws2.close();
              printResults();
              resolve();
            }
          });
        }, 500);
      } else if (data.type === 'players') {
        console.log(`✓ Received PLAYERS broadcast with ${data.players.length} players`);
        console.log('  Players:', data.players.map(p => p.name));
        console.log('  Host ID:', data.hostId);
        testsPassed++;
      } else if (data.type === 'error') {
        console.log('⚠ Server error:', data.message);
        testsFailed++;
      }
    });

    ws.addEventListener('error', (error) => {
      console.error('❌ WebSocket error:', error.message);
      testsFailed++;
      clearTimeout(timeout);
      printResults();
      resolve();
    });

    ws.addEventListener('close', () => {
      console.log('\nWebSocket closed');
    });

    function printResults() {
      console.log('\n=== TEST RESULTS ===');
      console.log(`✓ Passed: ${testsPassed}`);
      console.log(`❌ Failed: ${testsFailed}`);
      console.log(`Total: ${testsPassed + testsFailed}`);
      
      if (testsFailed === 0 && testsPassed > 0) {
        console.log('\n🎉 ALL TESTS PASSED - BUTTON SIGNAL WORKING!');
      } else {
        console.log('\n⚠ SOME TESTS FAILED');
      }
      console.log('===================\n');
    }
  });
}

// Run the test
testButtonSignal().then(() => {
  console.log('Test complete');
  process.exit(0);
}).catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
