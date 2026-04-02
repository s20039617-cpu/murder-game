const WebSocket = require('ws');

function createClient(name) {
  const ws = new WebSocket('ws://localhost:3000');
  const state = { name, ws, id: null, role: null };

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
        console.log(`${name}: roles configured ${JSON.stringify(data.payload.roles)}`);
      } else if (data.type === 'phase') {
        console.log(`${name}: phase changed to ${data.payload.phase}`);
      } else if (data.type === 'players') {
        // log player list with roles (if visible)
        console.log(`${name}: player list:`, data.payload.map(p => `${p.id}:${p.name}(${p.alive?'alive':'dead'})`).join(', '));
      }
    } catch (e) { console.log(`${name}: raw`, m.toString()); }
  });

  ws.on('close', () => console.log(`${name}: closed`));
  return state;
}

async function wait(ms){ return new Promise(r=>setTimeout(r, ms)); }

async function run() {
  console.log('Test 1: Default role assignment (3 players)');
  const a = createClient('ClientA');
  const b = createClient('ClientB');
  const c = createClient('ClientC');

  // wait for all to join
  for (let i=0;i<30;i++){
    if (a.id && b.id && c.id) break;
    await wait(250);
  }

  if (!a.id || !b.id || !c.id) {
    console.error('Failed to get all ids in time');
    process.exit(1);
  }

  console.log('All clients joined:', a.id, b.id, c.id);

  // start game (should assign default roles: murder, poisoner, seer)
  a.ws.send(JSON.stringify({ type: 'start' }));
  await wait(1000);

  console.log('Assigned roles:', `A=${a.role}`, `B=${b.role}`, `C=${c.role}`);

  a.ws.close(); b.ws.close(); c.ws.close();
  await wait(500);

  console.log('\nTest 2: Custom role configuration (4 players)');
  const p1 = createClient('Player1');
  const p2 = createClient('Player2');
  const p3 = createClient('Player3');
  const p4 = createClient('Player4');

  // wait for all to join
  for (let i=0;i<30;i++){
    if (p1.id && p2.id && p3.id && p4.id) break;
    await wait(250);
  }

  console.log('All players joined');

  // configure roles: seer, guard, poisoner, villager
  p1.ws.send(JSON.stringify({ type: 'setRoles', payload: { roles: ['seer', 'guard', 'poisoner', 'villager'] } }));
  await wait(500);

  // start game
  p1.ws.send(JSON.stringify({ type: 'start' }));
  await wait(1000);

  console.log('Assigned roles:', `P1=${p1.role}`, `P2=${p2.role}`, `P3=${p3.role}`, `P4=${p4.role}`);
  
  p1.ws.close(); p2.ws.close(); p3.ws.close(); p4.ws.close();
  await wait(500);
  process.exit(0);
}

run();
