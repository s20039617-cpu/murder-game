const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:3000');

ws.on('open', () => {
  console.log('CLIENT: open');
  ws.send(JSON.stringify({ type: 'join', payload: { name: 'Tester' } }));
});

ws.on('message', (m) => {
  console.log('CLIENT: msg', m.toString());
});

ws.on('close', () => console.log('CLIENT: closed'));

setTimeout(() => ws.close(), 5000);
