const WebSocket = require('ws');

function createClient(name) {
  const ws = new WebSocket('ws://localhost:3000');
  const state = { name, ws, id: null, role: null, messages: [], phase: 'waiting' };

  ws.on('open', () => {
    console.log(`[${name}] connected`);
    ws.send(JSON.stringify({ type: 'join', payload: { name } }));
  });

  ws.on('message', (m) => {
    try {
      const data = JSON.parse(m.toString());
      if (data.type === 'joined') {
        state.id = data.payload.id;
        console.log(`[${name}] id=${state.id}`);
      } else if (data.type === 'role') {
        state.role = data.payload;
        console.log(`[${name}] role=${state.role}`);
      } else if (data.type === 'phase') {
        state.phase = data.payload.phase;
        console.log(`[${name}] phase=${state.phase}`);
      } else if (data.type === 'guardProtection' || data.type === 'murderKill') {
        state.messages.push(data);
        console.log(`[${name}] ${data.type}:`, data.payload);
      }
    } catch (e) { console.log(`[${name}] error:`, e.message); }
  });

  ws.on('close', () => {});
  return state;
}

async function wait(ms){ return new Promise(r=>setTimeout(r, ms)); }

async function run() {
  console.log('=== Guard Protection Test ===\n');
  
  const p1 = createClient('P1');
  const p2 = createClient('P2');
  const p3 = createClient('P3');
  const p4 = createClient('P4');
  const p5 = createClient('P5');

  // Wait for joins
  console.log('Waiting for all clients to join...');
  for (let i=0;i<20;i++){
    if (p1.id && p2.id && p3.id && p4.id && p5.id) break;
    await wait(250);
  }
  console.log('All clients joined\n');

  // Set roles
  console.log('Setting role configuration...');
  p1.ws.send(JSON.stringify({ type: 'setRoles', payload: { roles: ['guard', 'murder', 'seer', 'poisoner', 'villager'] } }));
  await wait(500);

  // Start
  console.log('Starting game...');
  p1.ws.send(JSON.stringify({ type: 'start' }));
  await wait(3000); // wait longer for roles to broadcast

  console.log(`\nRole assignments:`);
  console.log(`  P1: ${p1.role}`);
  console.log(`  P2: ${p2.role}`);
  console.log(`  P3: ${p3.role}`);
  console.log(`  P4: ${p4.role}`);
  console.log(`  P5: ${p5.role}\n`);

  const guard = [p1,p2,p3,p4,p5].find(p => p.role === 'guard');
  const murder = [p1,p2,p3,p4,p5].find(p => p.role === 'murder');
  const target = [p1,p2,p3,p4,p5].find(p => p.role === 'villager');

  if (!guard || !murder || !target) {
    console.log('ERROR: Setup failed - not all roles assigned\n');
    [p1,p2,p3,p4,p5].forEach(p => p.ws.close());
    process.exit(1);
  }

  console.log(`Team setup:`);
  console.log(`  Guard: ${guard.name} (ID: ${guard.id})`);
  console.log(`  Murder: ${murder.name} (ID: ${murder.id})`);
  console.log(`  Victim: ${target.name} (ID: ${target.id})\n`);

  console.log('Waiting for night phase (up to 60 seconds)...');

  let nightReached = false;
  for (let i=0; i<120; i++){
    if (guard.phase === 'night' && murder.phase === 'night') {
      console.log('✓ Night phase reached!\n');
      nightReached = true;
      
      // Send night actions
      console.log('Sending night actions:');
      guard.ws.send(JSON.stringify({ type: 'nightAction', payload: { target: target.id } }));
      console.log(`  Guard protects target`);
      
      murder.ws.send(JSON.stringify({ type: 'nightAction', payload: { target: target.id } }));
      console.log(`  Murder kills target\n`);
      
      break;
    }
    await wait(500);
  }

  if (!nightReached) {
    console.log('ERROR: Night phase not reached\n');
    [p1,p2,p3,p4,p5].forEach(p => p.ws.close());
    process.exit(1);
  }

  console.log('Waiting for resolution...');
  await wait(3000);

  console.log('\n=== RESULTS ===\n');
  
  const guardMsg = guard.messages.find(m => m.type === 'guardProtection');
  const murderMsg = murder.messages.find(m => m.type === 'murderKill');

  let success = false;

  if (guardMsg) {
    console.log(`✓ Guard received protection confirmation`);
  } else {
    console.log(`✗ Guard did not receive protection message`);
  }

  if (murderMsg) {
    if (murderMsg.payload.killed === false && murderMsg.payload.reason === 'protected') {
      console.log(`✓ Murder received kill-blocked message (target was protected)\n`);
      console.log(`✓✓✓ SUCCESS: Guard protection WORKS!\n`);
      success = true;
    } else if (murderMsg.payload.killed === true) {
      console.log(`✗ FAIL: Murder kill succeeded (should have been blocked)\n`);
    } else {
      console.log(`? Unexpected murder message:`, murderMsg.payload, '\n');
    }
  } else {
    console.log(`✗ Murder did not receive kill result\n`);
  }

  [p1,p2,p3,p4,p5].forEach(p => p.ws.close());
  await wait(300);
  process.exit(success ? 0 : 1);
}

run();
