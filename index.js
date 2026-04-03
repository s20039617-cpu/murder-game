const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
app.use(express.static(path.join(__dirname, 'Client')));

let nextId = 1;
let lobbies = new Map(); // code -> { hostId, players: Map, game: Game }
let shutdownTimer = null;
let isClosing = false;

function scheduleAutoShutdown() {
  if (isClosing) return;
  if (shutdownTimer) {
    clearTimeout(shutdownTimer);
  }
  shutdownTimer = setTimeout(() => {
    if (lobbies.size === 0 && !isClosing) {
      isClosing = true;
      console.log('[Server] ⚠️ Auto-shutdown: no active lobbies');
      server.close(() => {
        console.log('[Server] ✓ Server auto-shutdown complete');
        process.exit(0);
      });
      setTimeout(() => {
        console.log('[Server] ⚠️ Forcing exit - graceful close took too long');
        process.exit(0);
      }, 2000);
    }
  }, 500);
}

function cancelAutoShutdown() {
  if (shutdownTimer) {
    clearTimeout(shutdownTimer);
    shutdownTimer = null;
  }
}

class Game {
  constructor() {
    this.players = new Map(); // id -> {id,name,alive,role,vote}
    this.hostId = null; // first player to join is host
    this.phase = 'waiting';
    this.timer = null;
    this.day1Duration = 30; // seconds - multiple pairs private chat
    this.day2Duration = 30; // seconds - full group discussion
    this.votingDuration = 20; // seconds - player voting
    this.nightDuration = 20; // seconds
    this.nightActions = new Map(); // playerId -> { target, ... } for actions taken
    this.protectedPlayers = new Set(); // players protected by Guard this night
    this.roleConfig = []; // roles chosen by host
    this.day1Pairs = []; // array of [player1, player2] pairs for day1 private chat
    this.sleepingPlayer = null; // random player who's sleeping if odd number of players
  }

  normalizeId(id) {
    return String(id);
  }

  getPlayer(id) {
    return this.players.get(this.normalizeId(id));
  }

  getDay1Partner(playerId) {
    const pid = this.normalizeId(playerId);
    for (const pair of this.day1Pairs) {
      const [a, b] = pair;
      if (this.normalizeId(a) === pid) return this.normalizeId(b);
      if (this.normalizeId(b) === pid) return this.normalizeId(a);
    }
    return null;
  }

  isSleeping(playerId) {
    return this.sleepingPlayer && this.normalizeId(playerId) === this.normalizeId(this.sleepingPlayer);
  }

  getRandomSleepingMessage() {
    const messages = [
      "You hit snooze and forgot to wake up!",
      "A dragon ate a bird which made a hatchling cry and the tear fell on a frog which croaked loudly which caused a brick to fall out of an elephant's wings and landed on your head and thats why you were late to class",
      "u didnt feel like talking today..."
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  }

  addPlayer(ws, name) {
    const id = this.normalizeId(nextId++);
    const p = { id, name: name || `Player${id}`, alive: true, role: 'villager', vote: null, poisoned: false };
    this.players.set(id, { ws, info: p });
    if (!this.hostId) {
      this.hostId = id;
      console.log(`[Game] Player ${id} is now HOST`);
    }
    this.broadcastPlayers();
    return id;
  }

  getTeam(role) {
    // Good team: seer, guard, doctor, medic, villager, undertaker
    // Bad team: murder, poisoner
    const goodTeam = ['seer', 'guard', 'doctor', 'medic', 'villager', 'undertaker'];
    return goodTeam.includes(role) ? 'good' : 'bad';
  }

  handleSeerCheck(seerId, targetId) {
    console.log(`  [handleSeerCheck] seerId=${seerId}, targetId=${targetId}`);
    const seer = this.players.get(seerId);
    const target = this.players.get(targetId);
    if (!seer || !target || !seer.info.alive || !target.info.alive) {
      console.log(`    ⚠ Invalid seer or target`);
      return null;
    }
    if (seer.info.role !== 'seer') {
      console.log(`    ⚠ Player ${seerId} is not seer (role: ${seer.info.role})`);
      return null;
    }

    let result = target.info.role;
    
    // If seer is poisoned, lie based on team
    if (seer.info.poisoned) {
      const targetTeam = this.getTeam(target.info.role);
      result = targetTeam === 'good' ? 'murder' : 'villager';
      console.log(`    🔍 Seer poisoned, returning false info: ${result}`);
    } else {
      console.log(`    🔍 Seer sees: ${result}`);
    }

    return result;
  }

  recordNightAction(playerId, action) {
    this.nightActions.set(playerId, action);
  }

  removePlayer(id) {
    this.players.delete(id);
    this.broadcastPlayers();
  }

  broadcast(type, data) {
    console.log(`[broadcast] START - type=${type}, data:`, data);
    const msg = JSON.stringify({ type, ...data });
    let sentCount = 0;
    for (const { ws, info } of this.players.values()) {
      if (ws.readyState === WebSocket.OPEN) {
        console.log(`  [broadcast] Sending to player ${info.id} (${info.name})`);
        ws.send(msg);
        sentCount++;
      }
    }
    console.log(`[broadcast] END - sent to ${sentCount} clients`);
  }

  sendPrivate(fromId, toId, text) {
    const fromToken = this.normalizeId(fromId);
    const toToken = this.normalizeId(toId);
    const payload = { type: 'chat', from: fromToken, to: toToken, text, private: true };

    [fromToken, toToken].forEach((id) => {
      const player = this.getPlayer(id);
      if (player && player.ws.readyState === WebSocket.OPEN) {
        player.ws.send(JSON.stringify(payload));
      }
    });
  }

  broadcastPlayers() {
    console.log(`  [broadcastPlayers] START - ${this.players.size} players, host=${this.hostId}`);
    const list = Array.from(this.players.values()).map(({ info }) => ({ id: info.id, name: info.name, alive: info.alive }));
    const data = { players: list, hostId: this.hostId, roleConfig: this.roleConfig };
    this.broadcast('players', data);
    console.log(`  [broadcastPlayers] END`);
  }

  // roleConfig is an array of role names chosen by the host before start
  setRoleConfig(roles) {
    // allowed special roles (only one each allowed)
    const specials = ['seer','guard','doctor','medic','poisoner','murder','undertaker'];
    const seen = new Set();
    const final = [];
    for (const r of roles || []) {
      const role = String(r).toLowerCase();
      if (specials.includes(role)) {
        if (!seen.has(role)) { final.push(role); seen.add(role); }
      } else if (role === 'villager') {
        final.push('villager');
      }
    }
    // store the config; actual assignment will fill with villagers as needed
    this.roleConfig = final;
  }

  assignRoles() {
    const alivePlayers = Array.from(this.players.values()).filter(({ info }) => info.alive);
    const count = alivePlayers.length;
    if (count === 0) return;

    // Start from configured roles if any; otherwise default to one murder and rest villagers
    let rolesToAssign = Array.isArray(this.roleConfig) && this.roleConfig.length > 0 ? [...this.roleConfig] : [];
    if (rolesToAssign.length === 0) {
      // default: include one 'murder' and one 'poisoner' if players >=2, and one 'seer' if >=3
      if (count >= 1) rolesToAssign.push('murder');
      if (count >= 2) rolesToAssign.push('poisoner');
      if (count >= 3) rolesToAssign.push('seer');
    }

    // Trim or pad with villagers to match player count
    if (rolesToAssign.length > count) rolesToAssign = rolesToAssign.slice(0, count);
    while (rolesToAssign.length < count) rolesToAssign.push('villager');

    // shuffle roles
    for (let i = rolesToAssign.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rolesToAssign[i], rolesToAssign[j]] = [rolesToAssign[j], rolesToAssign[i]];
    }

    // assign to alive players
    alivePlayers.forEach(({ info, ws }, idx) => {
      info.role = rolesToAssign[idx];
      info.poisoned = false; // reset poisoned status at start
      // send private role info
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'role', role: info.role }));
      }
    });
  }

  selectDay1Players() {
    const alivePlayers = Array.from(this.players.values()).filter(({ info }) => info.alive).map(({ info }) => info);
    if (alivePlayers.length < 2) {
      this.day1Pairs = [];
      this.sleepingPlayer = null;
      return [];
    }
    
    // Shuffle alive players
    const shuffled = [...alivePlayers].sort(() => Math.random() - 0.5);
    
    // Create as many pairs as possible
    this.day1Pairs = [];
    let pairsCount = Math.floor(shuffled.length / 2);
    
    for (let i = 0; i < pairsCount; i++) {
      this.day1Pairs.push([shuffled[i * 2].id, shuffled[i * 2 + 1].id]);
    }
    
    // If odd number of players, the last one is sleeping
    if (shuffled.length % 2 === 1) {
      this.sleepingPlayer = shuffled[shuffled.length - 1].id;
      console.log(`[Day1] Sleeping player: ${this.sleepingPlayer} - "${this.getRandomSleepingMessage()}"`);
    } else {
      this.sleepingPlayer = null;
    }
    
    console.log(`[Day1] Created ${this.day1Pairs.length} pairs: ${this.day1Pairs.map(p => p.join('-')).join(', ')}`);
    
    // Return flat array of all day1 players (for chat)
    return this.day1Pairs.flat();
  }

  start() {
    if (this.phase !== 'waiting') return;
    this.assignRoles();
    this.selectDay1Players();
    this.phase = 'day1';
    const sleepingMessage = this.sleepingPlayer ? this.getRandomSleepingMessage() : null;
    this.broadcast('phase', { phase: this.phase, duration: this.day1Duration, day1Pairs: this.day1Pairs, sleepingPlayer: this.sleepingPlayer, sleepingMessage: sleepingMessage });
    this.scheduleNext(this.day1Duration);
  }

  reset() {
    console.log('[Game] Resetting game - clearing all state');
    
    // Clear timer
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    
    // Reset phase and config
    this.phase = 'waiting';
    this.roleConfig = [];
    
    // Reset all players
    for (const { info } of this.players.values()) {
      info.role = 'villager';
      info.alive = true;
      info.vote = null;
      info.poisoned = false;
    }
    
    // Clear temporary state
    this.nightActions.clear();
    this.protectedPlayers.clear();
    this.day1Pairs = [];
    this.sleepingPlayer = null;
    
    // Broadcast reset to all clients
    this.broadcast('reset', { phase: 'waiting' });
    
    // Send updated players list with waiting phase
    this.broadcastPlayers();
    
    console.log('[Game] Reset complete - waiting for host to start new game');
  }

  shutdown() {
    // This method is now unused - server auto-shuts down when all players disconnect
    console.log('[Game] Shutdown called (server now auto-shuts down when players disconnect)');
  }

  scheduleNext(seconds) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.advancePhase(), seconds * 1000);
  }

  advancePhase() {
    if (this.phase === 'day1') {
      // Day 1 ends, move to Day 2 (full group discussion)
      this.phase = 'day2';
      this.day1Players = []; // Clear private chat players
      this.broadcast('phase', { phase: this.phase, duration: this.day2Duration });
      this.scheduleNext(this.day2Duration);
    } else if (this.phase === 'day2') {
      // Day 2 ends, move to voting phase
      this.phase = 'voting';
      this.broadcast('phase', { phase: this.phase, duration: this.votingDuration });
      this.scheduleNext(this.votingDuration);
    } else if (this.phase === 'voting') {
      // Voting ends, resolve votes and move to night
      this.resolveVotes();
      this.phase = 'night';
      this.nightActions.clear();
      this.broadcast('phase', { phase: this.phase, duration: this.nightDuration });
      this.scheduleNext(this.nightDuration);
    } else if (this.phase === 'night') {
      // Night ends, resolve actions and back to day1
      this.resolveNight();
      this.selectDay1Players();
      this.phase = 'day1';
      const sleepingMessage = this.sleepingPlayer ? this.getRandomSleepingMessage() : null;
      this.broadcast('phase', { phase: this.phase, duration: this.day1Duration, day1Pairs: this.day1Pairs, sleepingPlayer: this.sleepingPlayer, sleepingMessage: sleepingMessage });
      // reset votes
      for (const { info } of this.players.values()) info.vote = null;
      this.scheduleNext(this.day1Duration);
    }
  }

  resolveGuardProtection(guardId, targetId) {
    console.log(`  [resolveGuardProtection] guardId=${guardId}, targetId=${targetId}`);
    const guard = this.players.get(guardId);
    const target = this.players.get(targetId);
    if (!guard || !target || !guard.info.alive || !target.info.alive) {
      console.log(`    ⚠ Invalid guard or target`);
      return false;
    }
    if (guard.info.role !== 'guard') {
      console.log(`    ⚠ Player ${guardId} is not guard (role: ${guard.info.role})`);
      return false;
    }
    if (guard.info.poisoned) {
      console.log(`    ⚠ Guard ${guardId} is poisoned - protection fails`);
      return false;
    }
    this.protectedPlayers.add(targetId);
    console.log(`    ✓ Target ${targetId} protected`);
    if (guard.ws.readyState === WebSocket.OPEN) {
      guard.ws.send(JSON.stringify({ type: 'guardProtection', target: targetId, protected: true }));
    }
    return true;
  }

  resolveMurderKill(murderId, targetId) {
    console.log(`  [resolveMurderKill] murderId=${murderId}, targetId=${targetId}`);
    const murder = this.players.get(murderId);
    const target = this.players.get(targetId);
    if (!murder || !target || !murder.info.alive || !target.info.alive) {
      console.log(`    ⚠ Invalid murder or target`);
      return false;
    }
    if (murder.info.role !== 'murder') {
      console.log(`    ⚠ Player ${murderId} is not murder (role: ${murder.info.role})`);
      return false;
    }
    if (this.protectedPlayers.has(targetId)) {
      console.log(`    ⚠ Target ${targetId} is PROTECTED - kill blocked`);
      if (murder.ws.readyState === WebSocket.OPEN) {
        murder.ws.send(JSON.stringify({ type: 'murderKill', target: targetId, killed: false, reason: 'protected' }));
      }
      return false;
    }
    if (murder.info.poisoned) {
      console.log(`    ⚠ Murder ${murderId} is poisoned - kill does nothing`);
      return false;
    }
    target.info.alive = false;
    console.log(`    💀 Target ${targetId} killed`);
    if (murder.ws.readyState === WebSocket.OPEN) {
      murder.ws.send(JSON.stringify({ type: 'murderKill', target: targetId, killed: true }));
    }
    return true;
  }

  resolveNight() {
    console.log('resolveNight START');
    
    // Clear protections at start of night resolution
    this.protectedPlayers.clear();
    
    // First pass: resolve Guard protections
    console.log('Guard phase');
    for (const [playerId, action] of this.nightActions.entries()) {
      const player = this.players.get(playerId);
      if (!player || !player.info.alive) continue;
      if (player.info.role === 'guard' && action.target) {
        this.resolveGuardProtection(playerId, action.target);
      }
    }
    
    // Second pass: resolve Murder kills (respects protection)
    console.log('Murder phase');
    for (const [playerId, action] of this.nightActions.entries()) {
      const player = this.players.get(playerId);
      if (!player || !player.info.alive) continue;
      if (player.info.role === 'murder' && action.target) {
        this.resolveMurderKill(playerId, action.target);
      }
    }
    
    // Third pass: resolve Seer checks
    console.log('Seer phase');
    for (const [playerId, action] of this.nightActions.entries()) {
      const player = this.players.get(playerId);
      if (!player || !player.info.alive) continue;
      if (player.info.role === 'seer' && action.target) {
        const result = this.handleSeerCheck(playerId, action.target);
        if (result && player.ws.readyState === WebSocket.OPEN) {
          player.ws.send(JSON.stringify({ type: 'seerCheck', target: action.target, role: result }));
        }
      }
    }
    
    // Fourth pass: reveal dead players to Undertaker
    console.log('Undertaker phase');
    const deadPlayers = Array.from(this.players.values()).filter(({ info }) => !info.alive);
    for (const { info, ws } of this.players.values()) {
      if (info.alive && info.role === 'undertaker' && deadPlayers.length > 0) {
        console.log(`  [Undertaker] Revealing ${deadPlayers.length} dead player(s) to ${info.name}`);
        
        // Map dead players with their roles (or false roles if undertaker is poisoned)
        const revealedDeadPlayers = deadPlayers.map(({ info: deadInfo }) => {
          let role = deadInfo.role;
          
          // If undertaker is poisoned, lie about the role based on team
          if (info.poisoned) {
            const deadTeam = this.getTeam(deadInfo.role);
            if (deadTeam === 'good') {
              role = 'murder'; // Lie: say they're from bad team
            } else {
              role = 'villager'; // Lie: say they're from good team
            }
            console.log(`    [Poisoned Undertaker] Lying about ${deadInfo.name}: actual=${deadInfo.role}, false=${role}`);
          }
          
          return { id: deadInfo.id, name: deadInfo.name, role: role };
        });
        
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'undertakerInfo', deadPlayers: revealedDeadPlayers }));
        }
      }
    }
    
    // Broadcast any deaths that occurred
    this.broadcastPlayers();
    
    this.nightActions.clear();
    this.protectedPlayers.clear();
    
    console.log('resolveNight END');
  }

  handleVote(voterId, targetId) {
    const voter = this.players.get(voterId);
    if (!voter || !voter.info.alive) return;
    if (this.phase !== 'voting') return;
    if (!this.players.has(targetId)) return;
    voter.info.vote = targetId;
    this.broadcast('voteUpdate', { voter: voterId, target: targetId });
  }

  resolveVotes() {
    const tally = {};
    for (const { info } of this.players.values()) {
      if (!info.alive || !info.vote) continue;
      tally[info.vote] = (tally[info.vote] || 0) + 1;
    }
    let max = 0, chosen = null;
    for (const [id, count] of Object.entries(tally)) {
      if (count > max) { max = count; chosen = id; }
    }
    if (chosen && this.players.has(chosen)) {
      this.players.get(chosen).info.alive = false;
      this.broadcast('eliminated', { id: chosen });
      this.broadcastPlayers();
    } else {
      this.broadcast('eliminated', { id: null });
    }
  }
}

wss.on('connection', (ws) => {
  cancelAutoShutdown();
  let playerId = null;
  let currentLobbyCode = null;

  ws.on('message', (msg) => {
    let data;
    try { data = JSON.parse(msg); } catch (e) { 
      console.error('[WS] Parse error:', e);
      return; 
    }
    
    const { type, payload } = data;
    console.log(`[Handler:${type}] Received message:`, data);
    
    // Handle lobby management messages first
    if (type === 'joinLobby') {
      const code = data.code || (payload && payload.code);
      const name = data.name || (payload && payload.name);
      
      if (!code || !name) {
        console.log(`[Handler:joinLobby] Missing code or name`);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'lobbyError', message: 'Code and name are required' }));
        }
        return;
      }
      
      if (!lobbies.has(code)) {
        console.log(`[Handler:joinLobby] Lobby ${code} does not exist`);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'lobbyError', message: 'Lobby not found' }));
        }
        return;
      }
      
      const lobby = lobbies.get(code);
      playerId = lobby.game.addPlayer(ws, name);
      currentLobbyCode = code;
      
      console.log(`[Handler:joinLobby] Player ${playerId} joined lobby ${code} with name: ${name}`);
      
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'lobbyJoined', lobbyCode: code, playerId: playerId }));
      }
    }
    else if (type === 'hostLobby') {
      const code = data.code || (payload && payload.code);
      const name = data.name || (payload && payload.name);
      
      if (!code || !name) {
        console.log(`[Handler:hostLobby] Missing code or name`);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'lobbyError', message: 'Code and name are required' }));
        }
        return;
      }
      
      if (lobbies.has(code)) {
        console.log(`[Handler:hostLobby] Lobby ${code} already exists`);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'lobbyError', message: 'Lobby code already taken' }));
        }
        return;
      }
      
      // Create new lobby
      const newGame = new Game();
      const lobby = {
        hostId: null, // Will be set when first player joins
        players: new Map(),
        game: newGame
      };
      
      lobbies.set(code, lobby);
      playerId = lobby.game.addPlayer(ws, name);
      lobby.hostId = playerId; // Host is the first player
      currentLobbyCode = code;
      
      console.log(`[Handler:hostLobby] Player ${playerId} hosted lobby ${code} with name: ${name}`);
      
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'lobbyHosted', lobbyCode: code, playerId: playerId }));
      }
    }
    else {
      // All other messages require being in a lobby
      if (!currentLobbyCode || !lobbies.has(currentLobbyCode)) {
        console.log(`[Handler:${type}] Player not in a valid lobby`);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'error', message: 'Not in a lobby' }));
        }
        return;
      }
      
      const lobby = lobbies.get(currentLobbyCode);
      const game = lobby.game;
      
      if (type === 'join') {
        // Handle both new format {name: '...'} and old format {payload: {name: '...'}}  
        const name = data.name || (payload && payload.name);
        playerId = game.addPlayer(ws, name);
        console.log(`[Handler:join] Player ${playerId} joined lobby ${currentLobbyCode} with name: ${name}`);
        
        // Send back assigned id in new format
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'joined', playerId: playerId }));
        }
      } 
      else if (type === 'setRoles') {
        // allow configuring the role list before game start
        if (game.phase !== 'waiting') {
          console.log(`[Handler:setRoles] Cannot set roles - game phase is ${game.phase}`);
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'error', message: 'Cannot set roles after game start' }));
          }
          return;
        }
        
        // Handle both new format {roles: [...]} and old format {payload: {roles: [...]}}
        const roles = data.roles || (payload && payload.roles);
        console.log(`[Handler:setRoles] Setting roles in lobby ${currentLobbyCode}:`, roles);
        game.setRoleConfig(roles);
        
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'rolesSet', roles: game.roleConfig }));
        }
      } 
      else if (type === 'start') {
        console.log(`[Handler:start] Player ${playerId} attempting to start in lobby ${currentLobbyCode} (host is ${lobby.hostId})`);
        if (playerId === lobby.hostId) {
          console.log(`[Handler:start] ✓ Host ${playerId} started the game in lobby ${currentLobbyCode}`);
          game.start();
        } else {
          console.log(`[Handler:start] ⚠ Non-host ${playerId} tried to start - rejected`);
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'error', message: 'Only the host can start the game' }));
          }
        }
      } 
      else if (type === 'restart') {
        console.log(`[Handler:restart] Player ${playerId} attempting to restart in lobby ${currentLobbyCode} (host is ${lobby.hostId})`);
        if (playerId === lobby.hostId) {
          console.log(`[Handler:restart] ✓ Host ${playerId} restarting the game in lobby ${currentLobbyCode}`);
          game.reset();
        } else {
          console.log(`[Handler:restart] ⚠ Non-host ${playerId} tried to restart - rejected`);
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'error', message: 'Only the host can restart the game' }));
          }
        }
      } 
      else if (type === 'vote') {
        const voterId = payload ? payload.voterId : data.voterId;
        const targetId = payload ? payload.targetId : data.targetId;
        game.handleVote(voterId, targetId);
      } 
      else if (type === 'nightAction') {
        // player submits a night action (seer check, guard protect, etc.)
        if (game.phase === 'night' && playerId && (payload || data.target)) {
          const target = payload ? payload.target : data.target;
          game.recordNightAction(playerId, { target });
        }
      } 
      else if (type === 'chat') {
        // Phase-aware messaging system
        const text = payload ? payload.text : data.text;
        const to = payload ? payload.to : data.to;
        const phase = game.phase;

        console.log(`[Chat] ${playerId}@${currentLobbyCode} phase=${phase} text="${text}" to=${to}`);

        if (['voting', 'night'].includes(phase)) {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'error', message: `No chatting during ${phase} phase` }));
          }
          return;
        }

        if (phase === 'day1') {
          if (game.isSleeping(playerId)) {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'error', message: 'You are still asleep! Wait for Day Phase 2' }));
            }
            return;
          }

          const partner = game.getDay1Partner(playerId);
          if (!partner) {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'error', message: 'You are not paired with anyone during Day Phase 1' }));
            }
            return;
          }

          const partnerId = game.normalizeId(partner);
          const requestedTo = to ? game.normalizeId(to) : partnerId;
          if (requestedTo !== partnerId) {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'error', message: 'During Day Phase 1, you can only talk to your chat partner' }));
            }
            return;
          }

          game.sendPrivate(playerId, partnerId, text);
          return;
        }

        if (phase === 'day2') {
          game.broadcast('chat', { from: game.normalizeId(playerId), text });
          return;
        }

        // No chat in other phases (e.g., waiting)
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'error', message: `Cannot chat during ${phase} phase` }));
        }
      }
    }
  });

  ws.on('close', () => {
    if (playerId && currentLobbyCode) {
      // Check if lobby still exists (it might have been deleted by another disconnect)
      if (lobbies.has(currentLobbyCode)) {
        const lobby = lobbies.get(currentLobbyCode);
        console.log(`[WS] Player ${playerId} disconnected from lobby ${currentLobbyCode}`);
        lobby.game.removePlayer(playerId);

        // If lobby is now empty, clean it up
        if (lobby.game.players.size === 0) {
          console.log(`[Server] ⚠️ Lobby ${currentLobbyCode} is now empty - cleaning up`);
          lobbies.delete(currentLobbyCode);

          // If no lobbies left, schedule auto-shutdown
          if (lobbies.size === 0) {
            console.log('[Server] ⚠️ No lobbies left - scheduling auto-shutdown');
            scheduleAutoShutdown();
          }
        }
      } else {
        console.log(`[WS] Player ${playerId} disconnected, but lobby ${currentLobbyCode} was already cleaned up`);
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
