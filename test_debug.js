const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:3001');

ws.on('open', () => {
  console.log('Connected! Sending join message...');
  ws.send(JSON.stringify({ type: 'join', name: 'TestPlayer' }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data);
  console.log('Received:', msg.type);
  console.log('Full message:', JSON.stringify(msg, null, 2));
});

ws.on('error', (err) => {
  console.error('WebSocket error:', err);
});

ws.on('close', () => {
  console.log('Disconnected');
  process.exit(0);
});

// Close after 3 seconds
setTimeout(() => {
  ws.close();
}, 3000);
