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
        console.log(`${name}: id=${state.id}`);
      } else if (data.type === 'role') {
        state.role = data.payload;
        console.log(`${name}: role=${data.payload}`);
      } else if (data.type === 'phase') {
        console.log(`${name}: phase=${data.payload.phase}`);
      }
    } catch (e) {}
  });

  ws.on('close', () => console.log(`${name}: closed`));
  return state;
}

async function wait(ms){ return new Promise(r=>setTimeout(r, ms)); }

async function run() {
  const p1 = createClient('P1');
  await wait(500);
  p1.ws.send(JSON.stringify({ type: 'start' }));
  await wait(2000);
  p1.ws.close();
  process.exit(0);
}

run();
