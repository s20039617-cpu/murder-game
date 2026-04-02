const WebSocket = require('ws');

console.log('\n=== Testing New Phase System ===\n');

async function testPhaseSystem() {
  return new Promise((resolve, reject) => {
    const host = new WebSocket('ws://localhost:3001');
    const player2 = new WebSocket('ws://localhost:3001');
    const player3 = new WebSocket('ws://localhost:3001');
    
    let phaseHistory = [];
    let startTime = Date.now();
    let day1PlayersReceived = null;
    let playerCount = 0;

    const handlePhase = (playerName, msg) => {
      if (msg.type === 'phase') {
        phaseHistory.push({
          phase: msg.phase,
          time: Date.now() - startTime,
          duration: msg.duration,
          day1Players: msg.day1Players,
          playerName: playerName
        });
        console.log(`[${playerName}] ${msg.phase} (${msg.duration}s) - Day1 players: ${msg.day1Players ? msg.day1Players.join(',') : 'N/A'}`);
        
        if (msg.day1Players && !day1PlayersReceived) {
          day1PlayersReceived = msg.day1Players;
        }
      }
    };

    // Host
    host.on('open', () => {
      console.log('[Host] Connected');
      host.send(JSON.stringify({ type: 'join', name: 'TestHost' }));
    });

    host.on('message', (data) => {
      const msg = JSON.parse(data);
      
      if (msg.type === 'joined') {
        console.log('[Host] Joined');
      }
      
      if (msg.type === 'players') {
        console.log(`[Host] Players list: ${msg.players.length} players`);
        if (msg.players.length === 3) {
          setTimeout(() => {
            console.log('[Host] All 3 players connected! Setting roles and starting...');
            host.send(JSON.stringify({ type: 'setRoles', roles: ['seer', 'murder', 'guard'] }));
          }, 300);
        }
      }
      
      if (msg.type === 'rolesSet') {
        setTimeout(() => {
          console.log('[Host] Starting game...');
          host.send(JSON.stringify({ type: 'start' }));
        }, 100);
      }
      
      handlePhase('Host', msg);
    });

    // Player 2
    player2.on('open', () => {
      console.log('[Player2] Connected');
      player2.send(JSON.stringify({ type: 'join', name: 'TestPlayer2' }));
    });

    player2.on('message', (data) => {
      const msg = JSON.parse(data);
      if (msg.type === 'joined') { console.log('[Player2] Joined'); }
      handlePhase('Player2', msg);
    });

    // Player 3
    player3.on('open', () => {
      console.log('[Player3] Connected');
      player3.send(JSON.stringify({ type: 'join', name: 'TestPlayer3' }));
    });

    player3.on('message', (data) => {
      const msg = JSON.parse(data);
      if (msg.type === 'joined') { console.log('[Player3] Joined'); }
      handlePhase('Player3', msg);
    });

    // Check results after 110 seconds (30+30+20+20 = 100s for all phases)
    setTimeout(() => {
      console.log('\n--- Phase Sequence ---');
      const uniquePhases = [...new Set(phaseHistory.map(p => p.phase))];
      console.log(`Phases seen: ${uniquePhases.join(' → ')}`);
      
      console.log('\nPhase timing:');
      phaseHistory.forEach((p, i) => {
        if (i === 0 || phaseHistory[i-1].phase !== p.phase) {
          console.log(`  ${p.phase}: ${p.duration}s (seen at ${(p.time/1000).toFixed(1)}s)`);
        }
      });
      
      console.log(`\nDay1 players selected: ${day1PlayersReceived ? day1PlayersReceived.join(', ') : 'N/A'}`);
      
      const success = uniquePhases.includes('day1') && 
                      uniquePhases.includes('day2') && 
                      uniquePhases.includes('voting') && 
                      uniquePhases.includes('night') &&
                      day1PlayersReceived && day1PlayersReceived.length === 2;
      
      if (success) {
        console.log('\n✅ Phase system works! Sequence: day1 → day2 → voting → night\n');
      } else {
        console.log('\n❌ Phase system incomplete. Phases needed: day1, day2, voting, night\n');
      }
      
      host.close();
      player2.close();
      player3.close();
      resolve(success);
    }, 110000);

    setTimeout(() => reject(new Error('Timeout')), 115000);
  });
}

testPhaseSystem()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((err) => {
    console.error(`\n❌ Test failed: ${err.message}\n`);
    process.exit(1);
  });
