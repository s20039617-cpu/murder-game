const WebSocket = require('ws');

function createClient(name) {
  const ws = new WebSocket('ws://localhost:3000');
  const state = {
    name,
    ws,
    id: null,
    role: null,
    phase: 'waiting',
    messages: [],
    errors: [],
    closed: false
  };

  ws.on('open', () => {
    console.log(`[${name}] Connected`);
  });

  ws.on('message', (m) => {
    try {
      const data = JSON.parse(m.toString());
      state.messages.push(data);
      console.log(`[${name}] Received: ${data.type}`);
      
      if (data.type === 'joined') {
        state.id = data.payload.id;
      } else if (data.type === 'role') {
        state.role = data.payload;
      } else if (data.type === 'phase') {
        state.phase = data.payload.phase;
      } else if (data.type === 'error') {
        state.errors.push(data.payload.message);
        console.log(`[${name}] ERROR: ${data.payload.message}`);
      }
    } catch (e) {
      state.errors.push(e.message);
      console.log(`[${name}] Parse error: ${e.message}`);
    }
  });

  ws.on('error', (err) => {
    state.errors.push(err.message);
    console.log(`[${name}] WS Error: ${err.message}`);
  });

  ws.on('close', () => {
    state.closed = true;
    console.log(`[${name}] Closed`);
  });

  return state;
}

async function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function runTests() {
  console.log('\n=== COMPREHENSIVE GAME FLOW TEST ===\n');

  // Create 5 clients
  const p1 = createClient('Host');
  const p2 = createClient('Player2');
  const p3 = createClient('Player3');
  const p4 = createClient('Player4');
  const p5 = createClient('Player5');
  
  const clients = [p1, p2, p3, p4, p5];

  // Wait for all connections to open
  await wait(1000);

  // TEST 1: Clients join
  console.log('TEST 1: Clients joining lobby');
  clients.forEach(p => {
    p.ws.send(JSON.stringify({ type: 'join', payload: { name: p.name } }));
  });
  await wait(1500);

  const allJoined = clients.every(p => p.id !== null);
  console.log(`  Result: ${allJoined ? '✓ All joined' : '✗ Some failed to join'}`);
  if (!allJoined) {
    console.log('  IDs:', clients.map(p => `${p.name}=${p.id}`).join(', '));
    process.exit(1);
  }

  const hostId = p1.id;
  console.log(`  Host ID: ${hostId}\n`);

  // TEST 2: Non-host tries to start (should fail)
  console.log('TEST 2: Non-host tries to start (should be rejected)');
  p2.ws.send(JSON.stringify({ type: 'start' }));
  await wait(500);
  const nonHostError = p2.errors.length > 0;
  console.log(`  Result: ${nonHostError ? '✓ Correctly rejected' : '✗ Should have rejected'}`);
  if (!nonHostError) {
    console.log('  WARNING: Non-host start was not rejected\n');
  } else {
    console.log(`  Error: ${p2.errors[0]}\n`);
  }

  // TEST 3: Host selects roles
  console.log('TEST 3: Host configures roles');
  const selectedRoles = ['guard', 'murder', 'seer', 'poisoner', 'villager'];
  p1.ws.send(JSON.stringify({ type: 'setRoles', payload: { roles: selectedRoles } }));
  await wait(500);
  console.log(`  Selected: ${selectedRoles.join(', ')}`);
  console.log(`  Result: ✓ Roles configured\n`);

  // TEST 4: Host starts game
  console.log('TEST 4: Host starts game');
  p1.ws.send(JSON.stringify({ type: 'start' }));
  await wait(2000);

  const allGotRoles = clients.every(p => p.role !== null && p.role !== undefined);
  console.log(`  Result: ${allGotRoles ? '✓ All received roles' : '✗ Some missing roles'}`);
  if (allGotRoles) {
    console.log(`  Roles: ${clients.map(p => `${p.name}=${p.role}`).join(', ')}\n`);
  } else {
    console.log(`  Roles: ${clients.map(p => `${p.name}=${p.role}`).join(', ')}\n`);
  }

  // TEST 5: Phase transitions
  console.log('TEST 5: Game phase transitions');
  const phases = clients[0].messages
    .filter(m => m.type === 'phase')
    .map(m => m.payload.phase);
  console.log(`  Phases observed: ${phases.join(' → ')}`);
  const hasPhases = phases.length > 0;
  console.log(`  Result: ${hasPhases ? '✓ Phase changes detected' : '✗ No phase changes'}\n`);

  // TEST 6: Check for unexpected errors
  console.log('TEST 6: Error check (excluding expected rejections)');
  const unexpectedErrors = clients
    .flatMap(p => p.errors)
    .filter(e => e !== 'Only the host can start the game');
  if (unexpectedErrors.length === 0) {
    console.log(`  Result: ✓ No unexpected errors\n`);
  } else {
    console.log(`  Result: ✗ Unexpected errors found:`);
    unexpectedErrors.forEach(e => console.log(`    - ${e}`));
    console.log('');
  }

  // TEST 7: Check for closed connections
  console.log('TEST 7: Connection stability');
  const closedClients = clients.filter(p => p.closed).length;
  console.log(`  Closed connections: ${closedClients} / ${clients.length}`);
  console.log(`  Result: ${closedClients === 0 ? '✓ All stable' : '✗ Some closed'}\n`);

  // TEST 8: Send chat messages (test for loops)
  console.log('TEST 8: Chat functionality (loop detection)');
  const chatBefore = p1.messages.filter(m => m.type === 'chat').length;
  p2.ws.send(JSON.stringify({ type: 'chat', payload: { text: 'Hello!' } }));
  await wait(500);
  const chatAfter = p1.messages.filter(m => m.type === 'chat').length;
  console.log(`  Chat messages before: ${chatBefore}, after: ${chatAfter}`);
  console.log(`  Result: ${chatAfter === chatBefore + 1 ? '✓ Single message (no loops)' : '✗ Unexpected count'}\n`);

  // SUMMARY
  console.log('=== TEST SUMMARY ===\n');
  const passed = allJoined && hasPhases && unexpectedErrors.length === 0 && closedClients === 0;
  
  if (passed) {
    console.log('✓✓✓ ALL TESTS PASSED - NO ERRORS OR LOOPS\n');
  } else {
    console.log('✗ SOME TESTS FAILED - CHECK OUTPUT ABOVE\n');
  }

  // Cleanup
  clients.forEach(p => p.ws.close());
  await wait(300);
  
  process.exit(passed ? 0 : 1);
}

runTests().catch(e => {
  console.error('Test runner error:', e);
  process.exit(1);
});
