const WebSocket = require('ws');

function createClient(name) {
  const ws = new WebSocket('ws://localhost:3000');
  const state = { name, ws, id: null };

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
      } else if (data.type === 'chat') {
        console.log(`${name}: chat ->`, data.payload);
      } else if (data.type === 'players') {
        // ignore
      } else {
        console.log(`${name}: msg`, data);
      }
    } catch (e) { console.log(`${name}: raw`, m.toString()); }
  });

  ws.on('close', () => console.log(`${name}: closed`));
  return state;
}

async function wait(ms){ return new Promise(r=>setTimeout(r, ms)); }

async function run() {
  const a = createClient('ClientA');
  const b = createClient('ClientB');

  // wait for both to get ids
  for (let i=0;i<20;i++){
    if (a.id && b.id) break;
    await wait(250);
  }

  if (!a.id || !b.id) {
    console.error('Failed to get both ids in time');
    process.exit(1);
  }

  console.log('Both clients joined:', a.id, b.id);

  // ClientA sends public message
  a.ws.send(JSON.stringify({ type: 'chat', payload: { text: 'Hello everyone from A' } }));
  await wait(500);

  // ClientB sends private message to A
  b.ws.send(JSON.stringify({ type: 'chat', payload: { text: 'Private hello to A', to: a.id } }));
  await wait(1000);

  a.ws.close(); b.ws.close();
  await wait(500);
  process.exit(0);
}

run();
