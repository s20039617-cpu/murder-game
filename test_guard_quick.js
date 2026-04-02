const WebSocket = require('ws');

function createClient(name) {
  const ws = new WebSocket('ws://localhost:3000');
  const state = { name, ws, id: null, role: null, phase: 'waiting', messages: [] };

  ws.on('message', (m) => {
    try {
      const data = JSON.parse(m.toString());
      if (data.type === 'joined') state.id = data.payload.id;
      else if (data.type === 'role') state.role = data.payload;
      else if (data.type === 'phase') state.phase = data.payload.phase;
      else if (data.type === 'guardProtection' || data.type === 'murderKill') state.messages.push(data);
    } catch (e) {}
  });

  ws.on('open', () => ws.send(JSON.stringify({ type: 'join', payload: { name } })));
  ws.on('close', () => {});
  return state;
}

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  const p1 = createClient('P1');
  const p2 = createClient('P2');
  const p3 = createClient('P3');
  const p4 = createClient('P4');
  const p5 = createClient('P5');

  // Wait for joins
  for (let i = 0; i < 20; i++) {
    if (p1.id && p2.id && p3.id && p4.id && p5.id) break;
    await wait(250);
  }

  // Configure and start
  p1.ws.send(JSON.stringify({ type: 'setRoles', payload: { roles: ['guard', 'murder', 'seer', 'poisoner', 'villager'] } }));
  await wait(300);
  p1.ws.send(JSON.stringify({ type: 'start' }));
  await wait(2000);

  const guard = [p1, p2, p3, p4, p5].find(p => p.role === 'guard');
  const murder = [p1, p2, p3, p4, p5].find(p => p.role === 'murder');
  const victim = [p1, p2, p3, p4, p5].find(p => p.role === 'villager');

  if (!guard || !murder || !victim) {
    console.log('ERROR: Roles not assigned');
    process.exit(1);
  }

  // Wait for night
  for (let i = 0; i < 150; i++) {
    if (guard.phase === 'night') {
      guard.ws.send(JSON.stringify({ type: 'nightAction', payload: { target: victim.id } }));
      murder.ws.send(JSON.stringify({ type: 'nightAction', payload: { target: victim.id } }));
      break;
    }
    await wait(500);
  }

  await wait(2000);

  const guardMsg = guard.messages.find(m => m.type === 'guardProtection');
  const murderMsg = murder.messages.find(m => m.type === 'murderKill');

  if (guardMsg && murderMsg && murderMsg.payload.killed === false && murderMsg.payload.reason === 'protected') {
    console.log('✓ Guard role works: Murder kill was blocked by protection');
    process.exit(0);
  } else {
    console.log('✗ Guard role failed');
    console.log('  Guard msg:', guardMsg ? 'yes' : 'no');
    console.log('  Murder msg:', murderMsg ? JSON.stringify(murderMsg.payload) : 'no');
    process.exit(1);
  }
}

run();
