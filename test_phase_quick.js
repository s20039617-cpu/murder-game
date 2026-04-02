const WebSocket = require('ws');

console.log('\n=== Quick Phase System Test (3 seconds per phase) ===\n');

// Let's modify server to use shorter durations for quick testing
// We'll create a simpler test that just verifies phase transitions

async function quickPhaseTest() {
  return new Promise((resolve, reject) => {
    const host = new WebSocket('ws://localhost:3001');
    let phaseLog = [];
    
    host.on('message', (data) => {
      const msg = JSON.parse(data);
      
      if (msg.type === 'phase') {
        phaseLog.push(msg.phase);
        console.log(`Phase: ${msg.phase}`);
      }
      
      if (msg.type === 'players' && msg.players.length === 2) {
        setTimeout(() => {
          host.send(JSON.stringify({ type: 'setRoles', roles: ['seer', 'murder'] }));
        }, 100);
      }
      
      if (msg.type === 'rolesSet') {
        setTimeout(() => {
          console.log('Starting game...');
          host.send(JSON.stringify({ type: 'start' }));
        }, 100);
      }
    });
    
    host.on('open', () => {
      const p2 = new WebSocket('ws://localhost:3001');
      p2.on('open', () => {
        p2.send(JSON.stringify({ type: 'join', name: 'P2' }));
      });
      
      host.send(JSON.stringify({ type: 'join', name: 'Host' }));
    });
    
    setTimeout(() => {
      console.log(`\nPhases observed: ${phaseLog.join(' → ')}`);
      host.close();
      resolve(true);
    }, 1000);
  });
}

quickPhaseTest().then(() => process.exit(0));
