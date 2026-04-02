const WebSocket = require('ws');

async function testAllButtons() {
  console.log('\n=== COMPREHENSIVE BUTTON TEST ===\n');
  
  let testsPassed = 0;
  let testsFailed = 0;
  const tests = [];
  
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.log('\n⏱️  Test timeout');
      printResults();
      resolve();
    }, 15000);
    
    const ws1 = new WebSocket('ws://localhost:3001');
    
    ws1.addEventListener('open', () => {
      console.log('✓ Client connected');
      tests.push('Connection established');
      testsPassed++;
    });
    
    ws1.addEventListener('message', (event) => {
      const data = JSON.parse(event.data);
      
      // Test 1: Join Button
      if (data.type === 'joined') {
        console.log(`✓ JOIN BUTTON WORKS - Player ID: ${data.playerId}`);
        tests.push('Join button sends message correctly');
        ws1.clientPlayerId = data.playerId;
        testsPassed++;
        
        // Send start game sequence
        setTimeout(() => {
          console.log('\n📤 Testing START BUTTON - Sending roles...');
          ws1.send(JSON.stringify({
            type: 'setRoles',
            roles: ['seer', 'guard', 'murder']
          }));
          
          setTimeout(() => {
            console.log('📤 Testing START BUTTON - Sending start...');
            ws1.send(JSON.stringify({ type: 'start' }));
          }, 200);
        }, 300);
      }
      
      // Test 2: Start Button
      else if (data.type === 'phase' && data.phase === 'day') {
        console.log('✓ START BUTTON WORKS - Game started, phase is day');
        tests.push('Start button initiates game correctly');
        testsPassed++;
        
        // Test restart button
        setTimeout(() => {
          console.log('\n📤 Testing RESTART BUTTON...');
          ws1.send(JSON.stringify({ type: 'restart' }));
        }, 500);
      }
      
      // Test 3: Restart Button
      else if (data.type === 'reset') {
        console.log('✓ RESTART BUTTON WORKS - Game reset received');
        tests.push('Restart button resets game correctly');
        testsPassed++;
        
        // Start game again to test kill button
        setTimeout(() => {
          console.log('\n📤 Testing KILL BUTTON - Starting game again...');
          ws1.send(JSON.stringify({
            type: 'setRoles',
            roles: ['seer', 'murder']
          }));
          
          setTimeout(() => {
            ws1.send(JSON.stringify({ type: 'start' }));
          }, 200);
        }, 300);
      }
      
      // Wait for game to start again, then test kill
      else if (data.type === 'phase' && data.phase === 'day' && tests.length > 3) {
        console.log('\n📤 Testing KILL BUTTON - Sending kill...');
        ws1.send(JSON.stringify({ type: 'kill' }));
      }
      
      // Test 4: Kill Button
      else if (data.type === 'shutdown') {
        console.log('✓ KILL BUTTON WORKS - Server shutdown signal received');
        tests.push('Kill button triggers server shutdown');
        testsPassed++;
      }
    });
    
    ws1.addEventListener('close', () => {
      console.log('✓ Connection closed by server');
      tests.push('Server closed connection gracefully');
      testsPassed++;
      
      setTimeout(() => {
        clearTimeout(timeout);
        printResults();
        resolve();
      }, 500);
    });
    
    ws1.addEventListener('error', (error) => {
      console.error('❌ WebSocket error:', error.message);
      testsFailed++;
      clearTimeout(timeout);
      printResults();
      resolve();
    });
    
    // Send join message
    setTimeout(() => {
      console.log('📤 Testing JOIN BUTTON - Sending join message...');
      ws1.send(JSON.stringify({
        type: 'join',
        name: 'ButtonTestHost'
      }));
    }, 500);
    
    function printResults() {
      console.log('\n=== TEST RESULTS ===');
      console.log(`✓ Passed: ${testsPassed}`);
      console.log(`❌ Failed: ${testsFailed}`);
      console.log('\nTests executed:');
      tests.forEach((test, idx) => {
        console.log(`  ${idx + 1}. ${test}`);
      });
      
      if (testsFailed === 0 && testsPassed >= 5) {
        console.log('\n🎉 ALL BUTTONS WORKING!');
      } else {
        console.log('\n⚠️  SOME TESTS FAILED');
      }
      console.log('===================\n');
    }
  });
}

testAllButtons().then(() => {
  console.log('Button test complete');
  process.exit(0);
}).catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
