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
const rooms = new Map(); // roomId → { players: [ws1, ws2], state: {...} }

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
      handleCreateRoom(ws);
      break;
    case 'join-room':
      handleJoinRoom(ws, data.roomId);
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
    default:
      console.log('未知消息类型:', data.type);
  }
}

function handleCreateRoom(ws) {
  const roomId = generateRoomId();
  rooms.set(roomId, {
    players: [ws],
    state: { created: Date.now() }
  });
  ws.roomId = roomId;
  ws.side = 'white'; // 房主执白
  send(ws, { type: 'room-created', roomId });
  console.log(`房间 ${roomId} 已创建`);
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
  ws.roomId = roomId;
  ws.side = 'black'; // 加入者执黑

  // 通知双方游戏开始
  send(ws, { type: 'game-start', side: 'black' });
  send(room.players[0], { type: 'game-start', side: 'white' });
  console.log(`玩家加入房间 ${roomId}，游戏开始`);
}

function handleMove(ws, data) {
  const { roomId } = ws;
  if (!roomId) return;
  broadcast(roomId, ws, { type: 'move', data: data.data });
  console.log(`房间 ${roomId} 收到落子:`, data.data);
}

function handleUndoRequest(ws, data) {
  const { roomId } = ws;
  if (!roomId) return;
  broadcast(roomId, ws, { type: 'undo-request' });
}

function handleUndoApprove(ws, data) {
  const { roomId } = ws;
  if (!roomId) return;
  broadcast(roomId, ws, { type: 'undo-approve' });
  // 双方都执行悔棋
  const room = rooms.get(roomId);
  if (room) {
    room.players.forEach(player => {
      send(player, { type: 'do-undo' });
    });
  }
}

function handleUndoReject(ws, data) {
  const { roomId } = ws;
  if (!roomId) return;
  broadcast(roomId, ws, { type: 'undo-reject' });
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

function handleDisconnect(ws) {
  const { roomId } = ws;
  if (!roomId) {
    console.log('客户端断开（未加入房间）');
    return;
  }
  const room = rooms.get(roomId);
  if (!room) return;

  // 通知对手
  broadcast(roomId, ws, { type: 'opponent-left' });

  // 移除玩家
  room.players = room.players.filter(p => p !== ws);
  if (room.players.length === 0) {
    rooms.delete(roomId);
    console.log(`房间 ${roomId} 已销毁`);
  }
  console.log(`玩家断开房间 ${roomId}`);
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
