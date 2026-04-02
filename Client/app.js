// Game state
let myId = null;
let hostId = null;
let isHost = false;
let selectedRoles = [];
let players = [];
let myRole = null;
let currentPhase = 'waiting';
let day1Pairs = []; // Track pairs for day1 private chat [[p1, p2], [p3, p4], ...]
let sleepingPlayer = null; // Player who is sleeping if odd number of players
let sleepingMessage = null; // Random funny message for sleeping player
let currentLobbyCode = null; // Current lobby code the player is in

const DEBUG = false;
if (!DEBUG) {
  console.log = () => {};
}

const availableRoles = ['seer', 'guard', 'doctor', 'medic', 'poisoner', 'murder', 'undertaker', 'villager'];

// DOM Elements - Initial screens
const lobbySelection = document.getElementById('lobbySelection');
const joinGameBtn = document.getElementById('joinGameBtn');
const hostGameBtn = document.getElementById('hostGameBtn');
const hostCodeInputLobby = document.getElementById('hostCodeInputLobby');
const hostNameInputLobby = document.getElementById('hostNameInputLobby');
const joinCodeInputLobby = document.getElementById('joinCodeInputLobby');
const nameInput = document.getElementById('nameInput');
const hostBtn = document.getElementById('hostBtn');
const joinBtn = document.getElementById('joinBtn');
const chatControls = document.getElementById('chatControls');

// Additional DOM elements for lobby management
const lobby = document.getElementById('lobby');
const joinSection = document.getElementById('joinSection');
const hostSection = document.getElementById('hostSection');
const lobbyStatus = document.getElementById('lobbyStatus');

// Game UI elements
const game = document.getElementById('game');
const messagesDiv = document.getElementById('messages'); // messages container
const msgInput = document.getElementById('msgInput');
const sendMsgBtn = document.getElementById('sendMsg');
const pmTarget = document.getElementById('pmTarget');
const restartBtn = document.getElementById('restartBtn');

// Lobby elements
const playerListLobby = document.getElementById('playerListLobby');
const playerCount = document.getElementById('playerCount');
const hostStatus = document.getElementById('hostStatus');
const hostControls = document.getElementById('hostControls');
const waitingMessage = document.getElementById('waitingMessage');
const startBtn = document.getElementById('startBtn');
const roleButtons = document.getElementById('roleButtons');

// WebSocket connection
const ws = new WebSocket('ws://localhost:3001');

// WebSocket event handlers
ws.addEventListener('open', () => {
  console.log('[WS] Connected to server');
});

ws.addEventListener('error', (error) => {
  console.error('[WS] WebSocket error:', error);
});

ws.addEventListener('close', () => {
  console.log('[WS] Disconnected from server');
  alert('Disconnected from server');
});

ws.addEventListener('message', (event) => {
  try {
    const data = JSON.parse(event.data);
    console.log('[Handler] Received message type:', data.type, data);
    
    handleMessage(data);
  } catch (error) {
    console.error('[WS] Error parsing message:', error);
  }
});

function handleMessage(data) {
  switch (data.type) {
    case 'lobbyJoined':
      handleLobbyJoined(data);
      break;
    case 'lobbyHosted':
      handleLobbyHosted(data);
      break;
    case 'lobbyError':
      handleLobbyError(data);
      break;
    case 'joined':
      handleJoined(data);
      break;
    case 'players':
      handlePlayers(data);
      break;
    case 'phase':
      handlePhase(data);
      break;
    case 'role':
      handleRole(data);
      break;
    case 'reset':
      handleReset(data);
      break;
    case 'chat':
      handleChat(data);
      break;
    case 'undertakerInfo':
      handleUndertakerInfo(data);
      break;
    case 'error':
      handleError(data);
      break;
    default:
      console.log('[Handler] Unknown message type:', data.type);
  }
}

function handleLobbyJoined(data) {
  console.log('[Handler:lobbyJoined] Successfully joined lobby:', data.code);
  currentLobbyCode = data.lobbyCode || data.code;
  myId = data.playerId;

  lobbySelection.hidden = true;
  lobby.hidden = false;
  joinSection.hidden = true;
  hostSection.hidden = true;
  lobbyStatus.hidden = false;
  game.hidden = true;

  console.log('[UI] Transitioning to lobby status after join');
}

function handleLobbyHosted(data) {
  console.log('[Handler:lobbyHosted] Successfully hosted lobby:', data.code);
  currentLobbyCode = data.lobbyCode || data.code;
  myId = data.playerId;
  isHost = true;

  lobbySelection.hidden = true;
  lobby.hidden = false;
  joinSection.hidden = true;
  hostSection.hidden = true;
  lobbyStatus.hidden = false;
  game.hidden = true;

  console.log('[UI] Transitioning to lobby status after host');
}

function handleLobbyError(data) {
  console.log('[Handler:lobbyError] Lobby error:', data.message);
  alert('Lobby Error: ' + data.message);
  showLobbySelection();
}

function showLobbyJoinScreen() {
  console.log('[UI] Showing lobby join screen');
  lobbySelection.hidden = true;
  joinGameScreen.hidden = true;
  hostGameScreen.hidden = true;
  lobby.hidden = false;
  joinSection.hidden = false;
  lobbyStatus.hidden = true;
  game.hidden = true;
}

function handleJoined(data) {
  console.log('[Handler:joined] Setting myId:', data.playerId);
  myId = data.playerId;
  joinSection.style.display = 'none';
  lobbyStatus.hidden = false;
  console.log('[UI] Showing lobby status');
}

function handlePlayers(data) {
  players = data.players || [];
  hostId = data.hostId || null;
  selectedRoles = data.roleConfig || [];
  
  isHost = (myId === hostId);
  
  updateLobbyStatus();
  
  // If game is in progress, update the player circle
  if (currentPhase && currentPhase !== 'waiting') {
    renderPlayerCircle();
  }
}

function handlePhase(data) {
  console.log('[Handler:phase] Phase changed to:', data.phase);
  currentPhase = data.phase;
  
  // Track the day1 pairs for private chat
  if (data.day1Pairs) {
    day1Pairs = data.day1Pairs || [];
    sleepingPlayer = data.sleepingPlayer || null;
    sleepingMessage = data.sleepingMessage || null;
    console.log('[Handler:phase] Day1 pairs:', day1Pairs);
    if (sleepingPlayer) {
      console.log('[Handler:phase] Sleeping player:', sleepingPlayer, '- Message:', sleepingMessage);
    }
  } else {
    day1Pairs = [];
    sleepingPlayer = null;
    sleepingMessage = null;
  }
  
  const gameDiv = document.getElementById('game');
  const lobby = document.getElementById('lobby');
  const phaseDisplay = document.getElementById('phase');
  
  if (data.phase !== 'waiting') {
    console.log('[UI] Showing game view - game started');
    // Hide any lobby forms/selection for all players when the game begins
    lobbySelection.hidden = true;
    lobby.hidden = true;
    joinSection.hidden = true;
    hostSection.hidden = true;
    lobbyStatus.hidden = true;

    gameDiv.hidden = false;
    // Show restart button only for host
    restartBtn.hidden = !isHost;
    
    // Render player circle
    renderPlayerCircle();
    
    // Display phase name with formatting
    let displayPhase = data.phase;
    if (data.phase === 'day1') {
      displayPhase = 'Day Phase 1 (Private Chat)';
      if (data.day1Players && data.day1Players.includes(myId)) {
        console.log('[UI] You are selected for Day1 private chat!');
      }
    } else if (data.phase === 'day2') {
      displayPhase = 'Day Phase 2 (Discussion)';
    } else if (data.phase === 'voting') {
      displayPhase = 'Voting Phase';
    } else if (data.phase === 'night') {
      displayPhase = 'Night Phase';
    }
    if (phaseDisplay) phaseDisplay.textContent = displayPhase;
    
    // Update chat UI based on phase
    renderChatUI();
  } else {
    console.log('[UI] Showing lobby - game reset');
    gameDiv.hidden = true;
    lobby.hidden = false;
    day1Players = [];
    renderChatUI();
  }
  if (phaseDisplay) phaseDisplay.textContent = displayPhase || 'waiting';
}

function handleRole(data) {
  console.log('[Handler:role] Assigned role:', data.role);
  myRole = data.role;
  // Update the UI to display the role
  const myRoleElement = document.getElementById('myRole');
  if (myRoleElement) {
    myRoleElement.textContent = data.role;
  }
}

function handleError(data) {
  console.error('[Handler:error]', data.message);
  alert('Error: ' + data.message);
}

function handleChat(data) {
  console.log('[Handler:chat] Received message from', data.from, ':', data.text);
  
  if (!messagesDiv) return;
  
  const messageEl = document.createElement('div');
  messageEl.style.padding = '8px';
  messageEl.style.margin = '5px 0';
  messageEl.style.borderRadius = '4px';
  
  if (data.private) {
    messageEl.style.background = '#c8e6c9';
    messageEl.innerHTML = `<strong>🔒 ${data.from}</strong>: ${data.text}`;
  } else {
    messageEl.style.background = '#e1f5fe';
    messageEl.innerHTML = `<strong>${data.from}</strong>: ${data.text}`;
  }
  
  messagesDiv.appendChild(messageEl);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function getDay1Partner(playerId) {
  const myIdStr = String(playerId);
  for (const pair of day1Pairs) {
    const [a, b] = pair;
    if (String(a) === myIdStr) return String(b);
    if (String(b) === myIdStr) return String(a);
  }
  return null;
}

function handleUndertakerInfo(data) {
  console.log('[Handler:undertakerInfo] Dead players revealed:', data.deadPlayers);
  
  // Display dead players' roles in the chat
  if (!messagesDiv) return;
  
  data.deadPlayers.forEach(deadPlayer => {
    const messageEl = document.createElement('div');
    messageEl.style.padding = '8px';
    messageEl.style.margin = '5px 0';
    messageEl.style.borderRadius = '4px';
    messageEl.style.background = '#ffcccc';
    messageEl.style.fontWeight = 'bold';
    messageEl.innerHTML = `<strong>💀 ${deadPlayer.name}</strong> was a <strong>${deadPlayer.role}</strong>`;
    messagesDiv.appendChild(messageEl);
  });
  
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function renderChatUI() {
  // Update chat UI based on current phase
  if (!chatControls || !messagesDiv) return;
  
  console.log('[UI:renderChatUI] Current phase:', currentPhase, 'day1Pairs:', day1Pairs, 'myId:', myId);
  
  if (currentPhase === 'voting' || currentPhase === 'night') {
    // No chat during voting or night
    chatControls.disabled = true;
    chatControls.style.opacity = '0.5';
    msgInput.disabled = true;
    sendMsgBtn.disabled = true;
    msgInput.placeholder = 'No chatting during this phase';
    messagesDiv.innerHTML = `<div style="text-align: center; color: #999; padding: 20px;">No chatting during ${currentPhase} phase</div>`;
    if (pmTarget) pmTarget.textContent = 'None';
  } else if (currentPhase === 'day1') {
    // Day1: paired players can chat privately with their partner
    console.log('[UI:renderChatUI:day1] Rendering day1 UI, sleepingPlayer:', sleepingPlayer, 'myId:', myId);
    chatControls.disabled = false;
    chatControls.style.opacity = '1';
    
    if (sleepingPlayer && String(myId) === String(sleepingPlayer)) {
      // This player is sleeping - show random funny message
      console.log('[UI:renderChatUI:day1] Player is sleeping');
      msgInput.disabled = true;
      sendMsgBtn.disabled = true;
      msgInput.placeholder = 'You are still asleep...';
      const funnyMsg = sleepingMessage || '😴 You are still asleep!';
      messagesDiv.innerHTML = `<div style="text-align: center; color: #ff9800; padding: 20px; font-style: italic; font-size: 16px;"><strong>${funnyMsg}</strong></div>`;
      if (pmTarget) pmTarget.textContent = 'Sleeping 😴';
    } else {
      const partner = getDay1Partner(myId);
      if (partner) {
        // Player has a partner
        console.log('[UI:renderChatUI:day1] Player has partner:', partner);
        msgInput.disabled = false;
        sendMsgBtn.disabled = false;
        msgInput.placeholder = 'Chat with your partner...';
        if (pmTarget) pmTarget.textContent = 'Your Partner (Private)';
      } else {
        // Player is not in any pair
        console.log('[UI:renderChatUI:day1] Player has NO partner');
        msgInput.disabled = true;
        sendMsgBtn.disabled = true;
        msgInput.placeholder = 'Waiting for Day Phase 2...';
        messagesDiv.innerHTML = '<div style="text-align: center; color: #999; padding: 20px;">Players are having private chats. Your turn in Day Phase 2!</div>';
        if (pmTarget) pmTarget.textContent = 'None (waiting)';
      }
    }
  } else if (currentPhase === 'day2') {
    // Day2: everyone can chat
    console.log('[UI:renderChatUI:day2] Rendering day2 UI');
    chatControls.disabled = false;
    chatControls.style.opacity = '1';
    msgInput.disabled = false;
    sendMsgBtn.disabled = false;
    msgInput.placeholder = 'Chat with everyone...';
    if (pmTarget) pmTarget.textContent = 'All';
  } else {
    // waiting/other phases
    chatControls.disabled = true;
    msgInput.disabled = true;
    sendMsgBtn.disabled = true;
    if (pmTarget) pmTarget.textContent = 'None';
  }
}

function sendChat() {
  const message = msgInput.value.trim();
  if (!message) return;
  
  console.log('[Action:chat] Sending message:', message, 'Phase:', currentPhase, 'myId:', myId);
  console.log('[Action:chat] day1Pairs:', JSON.stringify(day1Pairs));
  
  // During day1, message is private (between paired players)
  if (currentPhase === 'day1') {
    const partner = getDay1Partner(myId);
    if (partner) {
      console.log(`[Action:chat] Sending day1 private message to partner ${partner}`);
      ws.send(JSON.stringify({ type: 'chat', text: message, to: partner }));
    } else {
      console.log(`[Action:chat] ❌ No partner found! myId=${myId}, myIdStr=${myIdStr}, pairs=${JSON.stringify(day1Pairs)}`);
      alert('Error: Partner not found. Are you in a pair?');
    }
  } else if (currentPhase === 'day2') {
    // Day2: public chat
    console.log('[Action:chat] Sending day2 public message to all');
    ws.send(JSON.stringify({
      type: 'chat',
      text: message
    }));
  } else {
    console.log('[Action:chat] Cannot chat during', currentPhase, 'phase');
    alert(`Cannot chat during ${currentPhase} phase`);
  }
  
  msgInput.value = '';
}

function handleReset(data) {
  console.log('[Handler:reset] Game has been reset by host');
  
  // Reset client state
  currentPhase = 'waiting';
  myRole = null;
  selectedRoles = [];
  day1Pairs = [];
  sleepingPlayer = null;
  sleepingMessage = null;
  
  // Hide game view, show lobby
  const gameDiv = document.getElementById('game');
  const lobby = document.getElementById('lobby');
  gameDiv.hidden = true;
  lobby.hidden = false;
  lobbyStatus.hidden = false;
  restartBtn.hidden = true;
  
  // Clear chat messages and reset chat UI
  if (messagesDiv) {
    messagesDiv.innerHTML = '';
  }
  if (msgInput) {
    msgInput.value = '';
  }
  
  // Clear player circle
  const circleContainer = document.getElementById('circleContainer');
  if (circleContainer) {
    circleContainer.innerHTML = '';
  }
  
  // Clear role display
  document.getElementById('myRole').textContent = '—';
  document.getElementById('phase').textContent = 'waiting';
  
  console.log('[UI] Game reset - returned to lobby');
}

function updateLobbyStatus() {
  console.log('[UI:updateLobbyStatus] isHost:', isHost);
  
  // Update lobby title and code display
  const lobbyTitle = document.getElementById('lobbyTitle');
  const lobbyCodeDisplay = document.getElementById('lobbyCodeDisplay');
  
  if (lobbyTitle && currentLobbyCode) {
    lobbyTitle.textContent = `Mafia Game Lobby - ${currentLobbyCode.toUpperCase()}`;
  }
  
  if (lobbyCodeDisplay && currentLobbyCode) {
    lobbyCodeDisplay.textContent = currentLobbyCode.toUpperCase();
  }
  
  renderLobbyPlayers();
  
  if (isHost) {
    console.log('[UI] Showing host controls');
    hostStatus.textContent = '🌟 YOU ARE THE HOST';
    hostStatus.style.color = '#ff6b00';
    hostStatus.style.fontWeight = 'bold';
    hostControls.hidden = false;
    waitingMessage.hidden = true;
    renderRoleButtons();
  } else {
    console.log('[UI] Showing waiting message');
    const hostName = players.find(p => p.id === hostId)?.name || 'Unknown';
    hostStatus.textContent = `✓ Host: ${hostName}`;
    hostStatus.style.color = '#2196F3';
    hostControls.hidden = true;
    waitingMessage.hidden = false;
  }
  
  playerCount.textContent = `${players.length}`;
}

function renderLobbyPlayers() {
  console.log('[UI:renderLobbyPlayers] Rendering', players.length, 'players');
  
  if (players.length === 0) {
    playerListLobby.innerHTML = '<div style="color: #999; padding: 20px; text-align: center; font-style: italic;">Waiting for players to join...</div>';
    return;
  }
  
  let html = '';
  players.forEach(player => {
    const isCurrentHost = player.id === hostId;
    const isCurrentPlayer = player.id === myId;
    
    if (isCurrentHost) {
      html += `<div style="padding: 12px 16px; background: linear-gradient(135deg, #fff3e0 0%, #ffcc02 100%); color: #e65100; font-weight: bold; border-radius: 8px; margin: 6px 0; border: 2px solid #ff9800; display: flex; align-items: center; gap: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        👑 <span>${player.name}</span> <span style="background: #ff9800; color: white; padding: 2px 8px; border-radius: 10px; font-size: 0.8em;">HOST</span>
        ${isCurrentPlayer ? '<span style="margin-left: auto; color: #4caf50;">(You)</span>' : ''}
      </div>`;
    } else {
      html += `<div style="padding: 12px 16px; background: white; color: #333; border-radius: 8px; margin: 6px 0; border: 1px solid #e0e0e0; display: flex; align-items: center; gap: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        👤 <span>${player.name}</span>
        ${isCurrentPlayer ? '<span style="margin-left: auto; color: #2196f3; font-weight: bold;">(You)</span>' : ''}
      </div>`;
    }
  });
  playerListLobby.innerHTML = html;
}

function renderRoleButtons() {
  roleButtons.innerHTML = '';
  
  availableRoles.forEach(role => {
    const isSelected = selectedRoles.includes(role);
    
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = role.charAt(0).toUpperCase() + role.slice(1);
    button.dataset.role = role;
    
    // Styling
    button.style.padding = '12px 16px';
    button.style.margin = '5px';
    button.style.border = '2px solid #ccc';
    button.style.borderRadius = '6px';
    button.style.cursor = 'pointer';
    button.style.fontWeight = 'bold';
    button.style.fontSize = '0.95em';
    button.style.transition = 'all 0.2s ease';
    button.style.minWidth = '100px';
    
    if (isSelected) {
      button.style.background = '#4caf50';
      button.style.color = 'white';
      button.style.borderColor = '#2e7d32';
      button.style.boxShadow = '0 2px 8px rgba(76, 175, 80, 0.3)';
    } else {
      button.style.background = 'white';
      button.style.color = '#333';
      button.style.borderColor = '#ccc';
    }
    
    button.addEventListener('click', (e) => {
      e.preventDefault();
      toggleRole(role);
    });
    
    button.addEventListener('mouseover', () => {
      if (!isSelected) {
        button.style.borderColor = '#999';
        button.style.background = '#f9f9f9';
      }
    });
    
    button.addEventListener('mouseout', () => {
      if (!isSelected) {
        button.style.borderColor = '#ccc';
        button.style.background = 'white';
      }
    });
    
    roleButtons.appendChild(button);
  });
}

function toggleRole(role) {
  console.log('[Action:toggleRole] Toggling role:', role);
  
  if (selectedRoles.includes(role)) {
    selectedRoles = selectedRoles.filter(r => r !== role);
    console.log('[Action:toggleRole] Removed', role, '-> now:', selectedRoles);
  } else {
    selectedRoles.push(role);
    console.log('[Action:toggleRole] Added', role, '-> now:', selectedRoles);
  }
  
  // Re-render buttons to update visual state
  renderRoleButtons();
}

// Event listeners
joinBtn.addEventListener('click', () => {
  const code = joinCodeInputLobby.value.trim().toUpperCase();
  const name = nameInput.value.trim();
  
  if (!code) {
    alert('Please enter a lobby code');
    joinCodeInputLobby.focus();
    return;
  }
  
  if (!name) {
    alert('Please enter your name');
    nameInput.focus();
    return;
  }
  
  console.log('[Action:join] Joining lobby', code, 'with name:', name);
  currentLobbyCode = code;
  ws.send(JSON.stringify({ type: 'joinLobby', code: code, name: name }));
});

nameInput.addEventListener('keypress', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    joinBtn.click();
  }
});

hostBtn.addEventListener('click', () => {
  const code = hostCodeInputLobby.value.trim().toUpperCase();
  const name = hostNameInputLobby.value.trim();
  
  if (!code) {
    alert('Please enter a lobby code');
    hostCodeInputLobby.focus();
    return;
  }
  
  if (code.length < 4) {
    alert('Lobby code must be at least 4 characters');
    hostCodeInputLobby.focus();
    return;
  }
  
  if (!name) {
    alert('Please enter your name');
    hostNameInputLobby.focus();
    return;
  }
  
  console.log(`[Action:host] Hosting lobby ${code} with name:`, name);
  currentLobbyCode = code;
  ws.send(JSON.stringify({ type: 'hostLobby', code: code, name: name }));
});

startBtn.addEventListener('click', () => {
  if (!isHost) {
    alert('Only the host can start the game!');
    return;
  }
  
  console.log('[Action:startGame] Host starting with roles:', selectedRoles);
  
  if (selectedRoles.length === 0) {
    alert('Please select at least one role');
    return;
  }
  
  // First, send role configuration
  console.log('[Action:startGame] Sending setRoles message');
  ws.send(JSON.stringify({
    type: 'setRoles',
    roles: selectedRoles
  }));
  
  // Then, send start message
  console.log('[Action:startGame] Sending start message');
  ws.send(JSON.stringify({
    type: 'start'
  }));
});

restartBtn.addEventListener('click', () => {
  if (!isHost) {
    alert('Only the host can restart the game!');
    return;
  }
  
  console.log('[Action:restart] Host restarting the game');
  ws.send(JSON.stringify({
    type: 'restart'
  }));
});

// Chat event listeners
if (sendMsgBtn) {
  sendMsgBtn.addEventListener('click', () => {
    sendChat();
  });
}

if (msgInput) {
  msgInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      sendChat();
    }
  });
}

// Initialize the app
function init() {
  console.log('[Init] Starting Mafia game client');
  
  // Show initial lobby selection screen
  showLobbySelection();
  
  // Set up event listeners for lobby selection
  setupLobbySelectionListeners();
  
  // Set up WebSocket connection
  connectWebSocket();
}

function renderPlayerCircle() {
  const container = document.getElementById('circleContainer');
  if (!container) return;
  
  container.innerHTML = '';
  
  if (players.length === 0) return;
  
  const centerX = 250;
  const centerY = 250;
  const radius = 150;
  const angleSlice = (2 * Math.PI) / players.length;
  
  players.forEach((player, index) => {
    const angle = index * angleSlice - Math.PI / 2;
    const x = centerX + radius * Math.cos(angle);
    const y = centerY + radius * Math.sin(angle);
    
    const playerDiv = document.createElement('div');
    playerDiv.style.position = 'absolute';
    playerDiv.style.left = (x - 30) + 'px';
    playerDiv.style.top = (y - 30) + 'px';
    playerDiv.style.width = '60px';
    playerDiv.style.textAlign = 'center';
    
    const houseEmoji = player.alive ? '🏠' : '❌';
    const houseColor = player.alive ? '#000' : '#ff0000';
    const playerName = player.alive ? player.name : 'Redacted';
    const nameOpacity = player.alive ? '1' : '0.5';
    
    playerDiv.innerHTML = `
      <div style="font-size: 40px; color: ${houseColor}; text-decoration: ${!player.alive ? 'line-through' : 'none'}; margin-bottom: 5px;">
        ${houseEmoji}
      </div>
      <div style="font-size: 12px; font-weight: bold; color: #333; word-wrap: break-word; opacity: ${nameOpacity};">
        ${playerName}
      </div>
    `;
    
    container.appendChild(playerDiv);
  });
}

function showLobbySelection() {
  console.log('[UI] Showing lobby selection screen');
  lobbySelection.hidden = false;
  joinGameScreen.hidden = true;
  hostGameScreen.hidden = true;
  joinSection.hidden = true;
  hostSection.hidden = true;
  lobbyStatus.hidden = true;
  game.hidden = true;
}

function setupLobbySelectionListeners() {
  // Join Game button - show join form
  joinGameBtn.addEventListener('click', () => {
    console.log('[UI] Showing join lobby form');
    lobbySelection.hidden = true;
    lobby.hidden = false;
    joinSection.hidden = false;
    hostSection.hidden = true;
    lobbyStatus.hidden = true;
    game.hidden = true;
  });
  
  // Host Game button - show host form
  hostGameBtn.addEventListener('click', () => {
    console.log('[UI] Showing host lobby form');
    lobbySelection.hidden = true;
    lobby.hidden = false;
    joinSection.hidden = true;
    hostSection.hidden = false;
    lobbyStatus.hidden = true;
    game.hidden = true;
  });

  // Join Lobby button - from join section
  joinBtn.addEventListener('click', () => {
    const code = joinCodeInputLobby.value.trim().toUpperCase();
    const name = nameInput.value.trim();
    
    if (!code || !name) {
      alert('Please enter both a lobby code and your name');
      return;
    }
    
    console.log(`[Action] Joining lobby ${code} as ${name}`);
    currentLobbyCode = code;
    ws.send(JSON.stringify({ type: 'joinLobby', code: code, name: name }));
  });

  nameInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      joinBtn.click();
    }
  });

  // Host Lobby button - from host section
  hostBtn.addEventListener('click', () => {
    const code = hostCodeInputLobby.value.trim().toUpperCase();
    const name = hostNameInputLobby.value.trim();
    
    if (!code || !name) {
      alert('Please enter both a lobby code and your name');
      return;
    }
    
    if (code.length < 4) {
      alert('Lobby code must be at least 4 characters');
      return;
    }
    
    console.log(`[Action] Hosting lobby ${code} as ${name}`);
    currentLobbyCode = code;
    ws.send(JSON.stringify({ type: 'hostLobby', code: code, name: name }));
  });

  hostNameInputLobby.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      hostBtn.click();
    }
  });
}

// Start the app when page loads
window.addEventListener('load', init);


