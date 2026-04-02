const WebSocket = require('ws');

function createClient(name) {
  const ws = new WebSocket('ws://localhost:3000');
  const state = { name, ws, id: null, role: null, checks: [], phase: 'waiting', rolesConfigured: false };

  ws.on('open', () => {
    console.log(`${name}: connected`);
    ws.send(JSON.stringify({ type: 'join', payload: { name } }));
  });

  ws.on('message', (m) => {
    try {
      const data = JSON.parse(m.toString());
      if (data.type === 'joined') {
        state.id = data.payload.id;
        console.log(`${name}: got id ${state.id}`);
      } else if (data.type === 'role') {
        state.role = data.payload;
        console.log(`${name}: assigned role ${data.payload}`);
      } else if (data.type === 'rolesSet') {
        state.rolesConfigured = true;
        console.log(`${name}: roles configured`);
      } else if (data.type === 'phase') {
        state.phase = data.payload.phase;
        console.log(`${name}: phase=${data.payload.phase}`);
      } else if (data.type === 'seerCheck') {
        state.checks.push(data.payload);
        const result = data.payload;
        console.log(`${name}: seer check - target ${result.target} is ${result.role}`);
      }
    } catch (e) {}
  });

  ws.on('close', () => console.log(`${name}: closed`));
  return state;
}

async function wait(ms){ return new Promise(r=>setTimeout(r, ms)); }

async function run() {
  console.log('=== Seer Ability Test ===\n');
  const p1 = createClient('Player1');
  const p2 = createClient('Player2');
  const p3 = createClient('Player3');
  const p4 = createClient('Player4');

  // wait for all to join
  for (let i=0;i<30;i++){
    if (p1.id && p2.id && p3.id && p4.id) break;
    await wait(250);
  }

  console.log('All players joined\n');

  // configure roles: seer, murder, poisoner, villager
  p1.ws.send(JSON.stringify({ type: 'setRoles', payload: { roles: ['seer', 'murder', 'poisoner', 'villager'] } }));
  
  // wait for roles to be configured
  for (let i=0;i<20;i++){
    if (p1.rolesConfigured) break;
    await wait(100);
  }

  console.log('Starting game...\n');
  // start game
  p1.ws.send(JSON.stringify({ type: 'start' }));
  await wait(2000); // wait longer for roles to be assigned and sent

  console.log(`Roles assigned:`);
  console.log(`  P1: ${p1.role}`);
  console.log(`  P2: ${p2.role}`);
  console.log(`  P3: ${p3.role}`);
  console.log(`  P4: ${p4.role}\n`);

  // wait for night phase (day is 45 seconds, but we'll wait max 60 seconds with checks)
  console.log('Waiting for night phase...\n');
  let nightPhaseReached = false;
  for (let i=0;i<120;i++){
    if (p1.phase === 'night' || p2.phase === 'night' || p3.phase === 'night' || p4.phase === 'night') {
      nightPhaseReached = true;
      break;
    }
    await wait(500);
  }

  if (!nightPhaseReached) {
    console.log('ERROR: Night phase was not reached in time)\n');
    p1.ws.close(); p2.ws.close(); p3.ws.close(); p4.ws.close();
    process.exit(1);
  }

  console.log('Night phase reached!\n');

  // check if we're in night phase and have a seer
  const seers = [p1, p2, p3, p4].filter(p => p.role === 'seer');
  const targets = [p1, p2, p3, p4].filter(p => p.id !== seers[0]?.id);

  if (seers.length > 0 && targets.length > 0) {
    const seer = seers[0];
    const target = targets[0];
    console.log(`Seer (${seer.name}) checking ${target.name} (expected: ${target.role})...\n`);
    
    // send night action
    seer.ws.send(JSON.stringify({ type: 'nightAction', payload: { target: target.id } }));
    
    // wait for result
    for (let i=0;i<30;i++){
      if (seer.checks.length > 0) break;
      await wait(100);
    }

    if (seer.checks.length > 0) {
      const check = seer.checks[0];
      console.log(`Result: Target ${target.name} appears as: ${check.role}`);
      console.log(`Actual role: ${target.role}`);
      console.log(`✓ Seer check completed successfully!\n`);
    } else {
      console.log('✗ ERROR: No seer check result received\n');
    }
  } else {
    console.log('✗ ERROR: Could not find seer or targets\n');
  }

  p1.ws.close(); p2.ws.close(); p3.ws.close(); p4.ws.close();
  await wait(500);
  process.exit(0);
}

run();
