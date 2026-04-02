const WebSocket = require('ws');

function createClient(name) {
  const ws = new WebSocket('ws://localhost:3000');
  const state = { name, ws, id: null, role: null, messages: [], phase: 'waiting' };

  ws.on('open', () => {
    console.log(`${name}: connected`);
    ws.send(JSON.stringify({ type: 'join', payload: { name } }));
  });

  ws.on('message', (m) => {
    try {
      const data = JSON.parse(m.toString());
      if (data.type === 'joined') {
        state.id = data.payload.id;
        console.log(`${name}: id=${state.id}`);
      } else if (data.type === 'role') {
        state.role = data.payload;
        console.log(`${name}: role=${data.payload}`);
      } else if (data.type === 'rolesSet') {
        console.log(`${name}: roles configured`);
      } else if (data.type === 'phase') {
        state.phase = data.payload.phase;
        console.log(`${name}: phase=${data.payload.phase}`);
      } else if (data.type === 'guardProtection' || data.type === 'murderKill') {
        state.messages.push(data);
      }
    } catch (e) {}
  });

  ws.on('close', () => console.log(`${name}: closed`));
  return state;
}

async function wait(ms){ return new Promise(r=>setTimeout(r, ms)); }

async function run() {
  console.log('=== Guard Protection Test ===\n');
  const p1 = createClient('Player1');
  const p2 = createClient('Player2');
  const p3 = createClient('Player3');
  const p4 = createClient('Player4');
  const p5 = createClient('Player5');

  // wait for all to join
  for (let i=0;i<30;i++){
    if (p1.id && p2.id && p3.id && p4.id && p5.id) break;
    await wait(250);
  }

  console.log('All players joined\n');

  // configure roles: seer, guard, murder, poisoner, villager
  p1.ws.send(JSON.stringify({ type: 'setRoles', payload: { roles: ['seer', 'guard', 'murder', 'poisoner', 'villager'] } }));
  await wait(500);

  console.log('Starting game...\n');
  p1.ws.send(JSON.stringify({ type: 'start' }));
  await wait(2000);

  console.log(`Roles assigned:`);
  console.log(`  P1: ${p1.role}`);
  console.log(`  P2: ${p2.role}`);
  console.log(`  P3: ${p3.role}`);
  console.log(`  P4: ${p4.role}`);
  console.log(`  P5: ${p5.role}\n`);

  // Find players
  const guard = [p1, p2, p3, p4, p5].find(p => p.role === 'guard');
  const murder = [p1, p2, p3, p4, p5].find(p => p.role === 'murder');
  const victim = [p1, p2, p3, p4, p5].find(p => p.id !== guard?.id && p.id !== murder?.id && p.role !== 'poisoner');

  if (!guard || !murder || !victim) {
    console.log('ERROR: Could not find guard, murder, or victim\n');
    process.exit(1);
  }

  console.log('Scenario: Guard protects victim, Murder tries to kill victim\n');
  console.log(`Guard: ${guard.name} will protect ${victim.name}`);
  console.log(`Murder: ${murder.name} will try to kill ${victim.name}\n`);

  console.log('Waiting for night phase...\n');
  let nightReached = false;
  for (let i=0;i<120;i++){
    if (guard.phase === 'night') {
      nightReached = true;
      break;
    }
    await wait(500);
  }

  if (!nightReached) {
    console.log('ERROR: Night phase not reached\n');
    process.exit(1);
  }

  console.log('Night phase reached. Sending night actions...\n');
  
  // Guard protects victim
  guard.ws.send(JSON.stringify({ type: 'nightAction', payload: { target: victim.id } }));
  console.log(`Guard (${guard.name}) protecting ${victim.name}`);

  // Murder tries to kill victim
  murder.ws.send(JSON.stringify({ type: 'nightAction', payload: { target: victim.id } }));
  console.log(`Murder (${murder.name}) attempting to kill ${victim.name}\n`);

  await wait(3000);

  // Check results
  console.log('=== Results ===\n');
  
  const guardMessages = guard.messages.filter(m => m.type === 'guardProtection');
  if (guardMessages.length > 0) {
    console.log(`✓ Guard received protection confirmation`);
  } else {
    console.log(`✗ Guard did NOT receive protection confirmation`);
  }

  const murderMessages = murder.messages.filter(m => m.type === 'murderKill');
  if (murderMessages.length > 0) {
    const killMsg = murderMessages[0];
    if (killMsg.payload.killed === false && killMsg.payload.reason === 'protected') {
      console.log(`✓ Murder received kill failure (protected)`);
      console.log(`✓ Guard protection WORKED - kill was blocked!\n`);
    } else {
      console.log(`✗ Kill was not blocked:\n`, killMsg);
    }
  } else {
    console.log(`✗ Murder did NOT receive kill result\n`);
  }

  // Verify victim is still alive
  console.log(`Victim (${victim.name}) alive status: ${victim.messages.length === 0 ? 'ALIVE ✓' : 'may have messages'}\n`);

  p1.ws.close(); p2.ws.close(); p3.ws.close(); p4.ws.close(); p5.ws.close();
  await wait(500);
  process.exit(0);
}

run();
