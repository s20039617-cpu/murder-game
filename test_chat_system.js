const WebSocket = require('ws');

console.log('\n=== Testing Phase-Aware Chat System ===\n');

// Helper function to check if a player is in day1Pairs
function isInDay1Pairs(playerId, day1Pairs) {
  if (!day1Pairs) return false;
  for (const [p1, p2] of day1Pairs) {
    if (p1 === playerId || p2 === playerId) return true;
  }
  return false;
}

async function testChatSystem() {
  return new Promise((resolve, reject) => {
    // Create WebSocket first but don't open yet
    let host;
    let player2;
    let player3;
    
    let day1Players = null;
    let messages = [];
    let phase = 'waiting';

    const handleMessage = (playerName, msg) => {
      if (msg.type === 'phase') {
        phase = msg.phase;
        console.log(`[${playerName}] Phase: ${msg.phase}`);
        if (msg.day1Players) {
          day1Players = msg.day1Players;
          console.log(`[${playerName}] Day1 players: ${day1Players.join(', ')}`);
        }
      }
      
      if (msg.type === 'chat') {
        const fromName = msg.from === '1' ? 'Host' : (msg.from === '2' ? 'Player2' : 'Player3');
        const privacy = msg.private ? '(PRIVATE)' : '(PUBLIC)';
        console.log(`[${playerName}] Chat ${privacy} from ${fromName}: ${msg.text}`);
        messages.push({
          phase,
          playerName,
          from: msg.from,
          text: msg.text,
          private: msg.private
        });
      }
      
      if (msg.type === 'error') {
        console.log(`[${playerName}] Error: ${msg.message}`);
      }
    };

    // Helper to send chat
    const sendChat = (ws, msg, to = null) => {
      const payload = { type: 'chat', text: msg };
      if (to) payload.to = to;
      ws.send(JSON.stringify(payload));
    };

    let testPhase = 0;

    // Host - connect and join first
    host = new WebSocket('ws://localhost:3001');
    host.on('open', () => {
      console.log('[Setup] Host joining...');
      host.send(JSON.stringify({ type: 'join', name: 'TestHost' }));
      
      // After host joins, add player2
      setTimeout(() => {
        player2 = new WebSocket('ws://localhost:3001');
        player2.on('open', () => {
          console.log('[Setup] Player2 joining...');
          player2.send(JSON.stringify({ type: 'join', name: 'TestPlayer2' }));
        });

        player2.on('message', (data) => {
          const msg = JSON.parse(data);
          handleMessage('Player2', msg);
          
          if (msg.type === 'phase' && msg.phase === 'day1' && testPhase === 1) {
            if (isInDay1Pairs('2', msg.day1Pairs)) {
              setTimeout(() => {
                console.log('[Test] Day1: Player2 trying to send message to host...');
                sendChat(player2, 'Yes, I see you!', '1');
              }, 200);
            }
          }
        });
      }, 200);
      
      // After player2, add player3
      setTimeout(() => {
        player3 = new WebSocket('ws://localhost:3001');
        player3.on('open', () => {
          console.log('[Setup] Player3 joining...');
          player3.send(JSON.stringify({ type: 'join', name: 'TestPlayer3' }));
        });

        player3.on('message', (data) => {
          const msg = JSON.parse(data);
          handleMessage('Player3', msg);
          
          if (msg.type === 'phase' && msg.phase === 'day1' && testPhase === 1) {
            if (msg.sleepingPlayer === '3') {
              console.log('[Test] Player3 is the sleeping player');
            } else if (!isInDay1Pairs('3', msg.day1Pairs)) {
              setTimeout(() => {
                console.log('[Test] Day1: Player3 trying to send message (should be BLOCKED - not in pairs)...');
                sendChat(player3, 'Hello?');
              }, 700);
            }
          }
        });
      }, 400);
    });

    host.on('message', (data) => {
      const msg = JSON.parse(data);
      handleMessage('Host', msg);
      
      if (msg.type === 'players' && msg.players.length === 3) {
        setTimeout(() => {
          console.log('[Setup] Host setting roles...');
          host.send(JSON.stringify({ type: 'setRoles', roles: ['seer', 'murder', 'guard'] }));
        }, 100);
      }
      
      if (msg.type === 'rolesSet') {
        setTimeout(() => {
          console.log('[Setup] Host starting game...');
          host.send(JSON.stringify({ type: 'start' }));
        }, 100);
      }
      
      // During day1, the host (who is one of the day1 players) tries to send a message
      if (msg.type === 'phase' && msg.phase === 'day1' && testPhase === 0) {
        if (isInDay1Pairs('1', msg.day1Pairs)) {
          testPhase = 1;
          setTimeout(() => {
            console.log('[Test] Day1: Host trying to send message to player in day1...');
            // Find partner in pairs
            let partner = null;
            for (const [p1, p2] of msg.day1Pairs) {
              if (p1 === '1') {
                partner = p2;
                break;
              } else if (p2 === '1') {
                partner = p1;
                break;
              }
            }
            sendChat(host, 'Is anyone there?', partner);
          }, 500);
        }
      }
    });

    // Check results after 8 seconds
    setTimeout(() => {
      console.log('\n--- Test Results ---');
      const day1Messages = messages.filter(m => m.phase === 'day1');
      const day1PrivateMessages = day1Messages.filter(m => m.private);
      
      console.log(`\nDay1 messages: ${day1Messages.length}`);
      console.log(`Day1 private messages: ${day1PrivateMessages.length}`);
      
      console.log('\nMessage flow:');
      day1Messages.forEach(m => {
        const fromName = m.from === '1' ? 'Host' : (m.from === '2' ? 'Player2' : 'Player3');
        console.log(`  ${fromName}: "${m.text}" (private: ${m.private})`);
      });
      
      const success = day1PrivateMessages.length >= 2; // At least 2 private messages exchanged
      
      if (success) {
        console.log('\n✅ Day1 private chat system works!\n');
      } else {
        console.log('\n❌ Day1 private chat not working as expected\n');
      }
      
      host.close();
      player2.close();
      player3.close();
      resolve(success);
    }, 8000);

    setTimeout(() => reject(new Error('Test timeout')), 10000);
  });
}

testChatSystem()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((err) => {
    console.error(`\n❌ Test failed: ${err.message}\n`);
    process.exit(1);
  });
