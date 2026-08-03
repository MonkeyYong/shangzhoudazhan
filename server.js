/**
 * 商周大战 - 局域网联机服务器
 * 功能：房间管理 + 消息中转
 */

const WebSocket = require('ws');
const os = require('os');

// 获取本机 IP 地址
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const PORT = 8080;
const wss = new WebSocket.Server({ port: PORT });

// 房间管理
const rooms = new Map(); // roomId → { players, state, gameState, playerSlots, disconnectTimer }
const REJOIN_TIMEOUT = 60000; // 断线重连等待时间 60 秒

// 生成 6 位房间码
function generateRoomId() {
  let id;
  do {
    id = Math.floor(100000 + Math.random() * 900000).toString();
  } while (rooms.has(id));
  return id;
}

// 广播消息给房间内其他玩家
function broadcast(roomId, sender, message) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.players.forEach(player => {
    if (player !== sender && player.readyState === WebSocket.OPEN) {
      player.send(JSON.stringify(message));
    }
  });
}

// 发送消息给指定客户端
function send(ws, message) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

wss.on('connection', (ws) => {
  console.log('新客户端连接');

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);
      handleMessage(ws, data);
    } catch (e) {
      console.error('消息解析错误:', e);
    }
  });

  ws.on('close', () => {
    handleDisconnect(ws);
  });
});

function handleMessage(ws, data) {
  switch (data.type) {
    case 'create-room':
      handleCreateRoom(ws, data.preset);
      break;
    case 'join-room':
      handleJoinRoom(ws, data.roomId);
      break;
    case 'rejoin-room':
      handleRejoinRoom(ws, data.roomId, data.side);
      break;
    case 'cache-game-state':
      handleCacheGameState(ws, data);
      break;
    case 'move':
      handleMove(ws, data);
      break;
    case 'undo-request':
      handleUndoRequest(ws, data);
      break;
    case 'undo-approve':
      handleUndoApprove(ws, data);
      break;
    case 'undo-reject':
      handleUndoReject(ws, data);
      break;
    case 'sync':
      handleSync(ws, data);
      break;
    case 'chat':
      handleChat(ws, data);
      break;
    case 'leave-room':
      handleLeaveRoom(ws);
      break;
    default:
      console.log('未知消息类型:', data.type);
  }
}

function handleCreateRoom(ws, preset) {
  const roomId = generateRoomId();
  rooms.set(roomId, {
    players: [ws],
    state: { created: Date.now() },
    gameState: null,
    playerSlots: { white: ws, black: null },
    disconnectTimer: null,
    preset: preset || 'battle' // 房主选择的布局
  });
  ws.roomId = roomId;
  ws.side = 'white'; // 房主执白
  send(ws, { type: 'room-created', roomId });
  console.log(`房间 ${roomId} 已创建，布局=${preset}`);
}

function handleJoinRoom(ws, roomId) {
  const room = rooms.get(roomId);
  if (!room) {
    send(ws, { type: 'error', message: '房间不存在' });
    return;
  }
  if (room.players.length >= 2) {
    send(ws, { type: 'error', message: '房间已满' });
    return;
  }
  room.players.push(ws);
  room.playerSlots.black = ws;
  ws.roomId = roomId;
  ws.side = 'black'; // 加入者执黑

  // 通知双方游戏开始（携带布局信息）
  send(ws, { type: 'game-start', side: 'black', preset: room.preset });
  send(room.players[0], { type: 'game-start', side: 'white', preset: room.preset });
  console.log(`玩家加入房间 ${roomId}，游戏开始，布局=${room.preset}`);
}

function handleMove(ws, data) {
  const { roomId } = ws;
  if (!roomId) return;
  broadcast(roomId, ws, { type: 'move', data: data.data });
  console.log(`房间 ${roomId} 收到落子:`, data.data);
}

function handleUndoRequest(ws, data) {
  const { roomId, side } = ws;
  if (!roomId) return;
  const room = rooms.get(roomId);
  if (!room) return;
  // 只发给对手，不广播给所有人
  const opponent = room.playerSlots[side === 'white' ? 'black' : 'white'];
  if (opponent) {
    console.log(`[悔棋] ${side} 请求悔棋 → 转发给对手`);
    send(opponent, { type: 'undo-request' });
  }
}

function handleUndoApprove(ws, data) {
  const { roomId, side } = ws;
  if (!roomId) return;
  const room = rooms.get(roomId);
  if (!room) return;
  const opponent = room.playerSlots[side === 'white' ? 'black' : 'white'];
  if (opponent) {
    console.log(`[悔棋] ${side} 同意悔棋 → 通知对手`);
    send(opponent, { type: 'undo-approve' });
  }
  // 双方都执行悔棋（退两步：对手的+自己的）
  room.players.forEach(player => {
    send(player, { type: 'do-undo', count: 2 });
  });
  console.log(`[悔棋] 双方执行悔棋（两步）`);
}

function handleUndoReject(ws, data) {
  const { roomId, side } = ws;
  if (!roomId) return;
  const room = rooms.get(roomId);
  if (!room) return;
  const opponent = room.playerSlots[side === 'white' ? 'black' : 'white'];
  if (opponent) {
    console.log(`[悔棋] ${side} 拒绝悔棋 → 通知对手`);
    send(opponent, { type: 'undo-reject' });
  }
}

function handleSync(ws, data) {
  const { roomId } = ws;
  if (!roomId) return;
  broadcast(roomId, ws, { type: 'sync', data: data.data });
}

function handleChat(ws, data) {
  const { roomId } = ws;
  if (!roomId) return;
  broadcast(roomId, ws, { type: 'chat', message: data.message });
}

function handleCacheGameState(ws, data) {
  const { roomId } = ws;
  if (!roomId) return;
  const room = rooms.get(roomId);
  if (!room) return;
  room.gameState = data.data;
}

function handleRejoinRoom(ws, roomId, side) {
  console.log(`[重连] 收到 rejoin-room 请求: roomId=${roomId}, side=${side}`);
  const room = rooms.get(roomId);
  if (!room) {
    console.log(`[重连] 失败: 房间 ${roomId} 不存在`);
    send(ws, { type: 'error', message: '房间不存在或已过期' });
    return;
  }
  // 检查该颜色槽位是否为空（原玩家已断线）
  if (room.playerSlots[side] !== null) {
    console.log(`[重连] 失败: 房间 ${roomId} 的 ${side} 槽位已被占用`);
    send(ws, { type: 'error', message: '该位置已有玩家' });
    return;
  }
  // 替换槽位
  room.playerSlots[side] = ws;
  room.players.push(ws);
  ws.roomId = roomId;
  ws.side = side;

  // 取消销毁定时器
  if (room.disconnectTimer) {
    clearTimeout(room.disconnectTimer);
    room.disconnectTimer = null;
  }

  // 发送缓存的棋局给重连方
  if (room.gameState) {
    console.log(`[重连] 成功: 发送缓存棋局给 ${side}，棋子数=${room.gameState.pieces ? room.gameState.pieces.length : 0}`);
    send(ws, { type: 'game-state', data: room.gameState });
  } else {
    // 没有缓存棋局（还没走过子），让对手发一份过来
    console.log(`[重连] 成功: 无缓存棋局，请求对手同步`);
    broadcast(roomId, ws, { type: 'request-sync' });
  }

  // 通知对手已重连
  broadcast(roomId, ws, { type: 'opponent-rejoined' });
  console.log(`[重连] 玩家 ${side} 重连房间 ${roomId}，当前房间人数=${room.players.length}`);
}

function handleLeaveRoom(ws) {
  const { roomId, side } = ws;
  if (!roomId) return;
  const room = rooms.get(roomId);
  if (!room) return;

  console.log(`玩家 ${side} 主动离开房间 ${roomId}`);

  // 通知对手
  broadcast(roomId, ws, { type: 'opponent-left' });

  // 清空槽位
  if (side && room.playerSlots[side] === ws) {
    room.playerSlots[side] = null;
  }
  room.players = room.players.filter(p => p !== ws);
  ws.roomId = null;
  ws.side = null;

  // 房间空了直接销毁
  if (room.players.length === 0) {
    if (room.disconnectTimer) clearTimeout(room.disconnectTimer);
    rooms.delete(roomId);
    console.log(`房间 ${roomId} 已销毁（无人在线）`);
  }
}

function handleDisconnect(ws) {
  const { roomId, side } = ws;
  if (!roomId) {
    console.log('客户端断开（未加入房间）');
    return;
  }
  const room = rooms.get(roomId);
  if (!room) return;

  // 清空该玩家的槽位
  if (side && room.playerSlots[side] === ws) {
    room.playerSlots[side] = null;
  }

  // 从 players 数组移除
  room.players = room.players.filter(p => p !== ws);

  // 通知对手断线（不是离开）
  broadcast(roomId, ws, { type: 'opponent-disconnected', timeout: 60 });

  // 如果房间空了，直接销毁
  if (room.players.length === 0) {
    if (room.disconnectTimer) clearTimeout(room.disconnectTimer);
    rooms.delete(roomId);
    console.log(`房间 ${roomId} 已销毁（无人在线）`);
  } else {
    // 启动延迟销毁定时器
    room.disconnectTimer = setTimeout(() => {
      const r = rooms.get(roomId);
      if (r && r.players.length === 0) {
        rooms.delete(roomId);
        console.log(`房间 ${roomId} 已销毁（超时）`);
      }
    }, REJOIN_TIMEOUT);
    console.log(`玩家 ${side} 断线房间 ${roomId}，等待重连...`);
  }
}

// 启动服务器
const localIP = getLocalIP();
console.log('===========================================');
console.log('  商周大战 - 局域网联机服务器');
console.log('===========================================');
console.log(`  本机 IP: ${localIP}`);
console.log(`  端口: ${PORT}`);
console.log('-------------------------------------------');
console.log('  请将以下地址告诉对手:');
console.log(`  ${localIP}:${PORT}`);
console.log('===========================================');
console.log('');
console.log('等待玩家连接...');
