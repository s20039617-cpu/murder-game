const WebSocket = require('ws');

function createClient(name) {
  const ws = new WebSocket('ws://localhost:3000');
  const state = { name, ws, id: null, role: null, phase: 'waiting', messages: [], tests: [] };

  ws.on('open', () => {
    state.tests.push(`[${name}] connected`);
    ws.send(JSON.stringify({ type: 'join', payload: { name } }));
  });

  ws.on('message', (m) => {
    try {
      const data = JSON.parse(m.toString());
      if (data.type === 'joined') {
        state.id = data.payload.id;
        state.tests.push(`[${name}] id=${state.id}`);
      } else if (data.type === 'role') {
        state.role = data.payload;
        state.tests.push(`[${name}] role=${state.role}`);
      } else if (data.type === 'phase') {
        state.phase = data.payload.phase;
        state.tests.push(`[${name}] phase=${state.phase}`);
      } else if (data.type === 'guardProtection' || data.type === 'murderKill') {
        state.messages.push(data);
        state.tests.push(`[${name}] ${data.type}: ${JSON.stringify(data.payload)}`);
      }
    } catch (e) { 
      state.tests.push(`[${name}] error: ${e.message}`);
    }
  });

  ws.on('close', () => {});
  return state;
}

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  console.log('=== Guard Protection Test (Fresh) ===\n');
  
  const p1 = createClient('P1');
  const p2 = createClient('P2');
  const p3 = createClient('P3');
  const p4 = createClient('P4');
  const p5 = createClient('P5');

  // Wait for joins
  console.log('Waiting for clients to join...');
  for (let i = 0; i < 20; i++) {
    if (p1.id && p2.id && p3.id && p4.id && p5.id) break;
    await wait(250);
  }
  
  if (!p1.id) {
    console.log('ERROR: Clients failed to join');
    process.exit(1);
  }

  console.log(`All clients joined: P1=${p1.id}, P2=${p2.id}, P3=${p3.id}, P4=${p4.id}, P5=${p5.id}\n`);
  console.log('Diagnostic output:');
  [p1, p2, p3, p4, p5].forEach(p => p.tests.forEach(t => console.log('  ' + t)));
  p1.tests = p2.tests = p3.tests = p4.tests = p5.tests = [];
  console.log('');

  // Configure roles
  console.log('Configuring role set...');
  p1.ws.send(JSON.stringify({ type: 'setRoles', payload: { roles: ['guard', 'murder', 'seer', 'poisoner', 'villager'] } }));
  await wait(500);

  // Start game
  console.log('Starting game...');
  p1.ws.send(JSON.stringify({ type: 'start' }));
  await wait(3000); // longer wait for roles to broadcast

  console.log(`Role assignments:`);
  console.log(`  P1: ${p1.role}`);
  console.log(`  P2: ${p2.role}`);
  console.log(`  P3: ${p3.role}`);
  console.log(`  P4: ${p4.role}`);
  console.log(`  P5: ${p5.role}\n`);

  const guard = [p1, p2, p3, p4, p5].find(p => p.role === 'guard');
  const murder = [p1, p2, p3, p4, p5].find(p => p.role === 'murder');
  const victim = [p1, p2, p3, p4, p5].find(p => p.role === 'villager');

  if (!guard || !murder || !victim) {
    console.log('ERROR: Failed to assign all required roles\n');
    [p1, p2, p3, p4, p5].forEach(p => p.tests.forEach(t => console.log('  ' + t)));
    [p1, p2, p3, p4, p5].forEach(p => p.ws.close());
    process.exit(1);
  }

  console.log(`Confirmed roles assigned:`);
  console.log(`  Guard: ${guard.name}`);
  console.log(`  Murder: ${murder.name}`);
  console.log(`  Victim: ${victim.name}\n`);

  // Wait for night phase
  console.log('Waiting for night phase (up to 60 seconds)...');
  let nightArrived = false;
  for (let i = 0; i < 120; i++) {
    if (guard.phase === 'night' && murder.phase === 'night') {
      console.log('✓ Night phase reached\n');
      nightArrived = true;
      
      // Send actions
      console.log('Sending night actions:');
      guard.ws.send(JSON.stringify({ type: 'nightAction', payload: { target: victim.id } }));
      console.log(`  Guard protects victim (ID: ${victim.id})`);
      
      murder.ws.send(JSON.stringify({ type: 'nightAction', payload: { target: victim.id } }));
      console.log(`  Murder kills victim (ID: ${victim.id})\n`);
      
      break;
    }
    await wait(500);
  }

  if (!nightArrived) {
    console.log('ERROR: Night phase never arrived\n');
    [p1, p2, p3, p4, p5].forEach(p => p.ws.close());
    process.exit(1);
  }

  // Wait for resolution
  await wait(3000);

  console.log('=== TEST RESULTS ===\n');

  // Check guard message
  const guardMsg = guard.messages.find(m => m.type === 'guardProtection');
  if (guardMsg && guardMsg.payload.protected) {
    console.log('✓ Guard received protection confirmation');
  } else {
    console.log('✗ Guard did not receive protection confirmation');
  }

  // Check murder message
  const murderMsg = murder.messages.find(m => m.type === 'murderKill');
  let testPassed = false;
  if (murderMsg) {
    if (murderMsg.payload.killed === false && murderMsg.payload.reason === 'protected') {
      console.log('✓ Murder received kill-blocked message (target protected)');
      console.log('\n✓✓✓ SUCCESS: Guard protection blocks Murder kills!\n');
      testPassed = true;
    } else if (murderMsg.payload.killed === true) {
      console.log('✗ FAIL: Murder kill succeeded when target was protected\n');
    } else {
      console.log(`? Unexpected murder payload: ${JSON.stringify(murderMsg.payload)}\n`);
    }
  } else {
    console.log('✗ Murder did not receive kill result\n');
  }

  // Cleanup
  [p1, p2, p3, p4, p5].forEach(p => p.ws.close());
  await wait(300);
  
  process.exit(testPassed ? 0 : 1);
}

run();
