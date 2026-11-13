import type { Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { db, nowIso } from './db.js';
import { verifyAccessToken, type AuthUser } from './middleware/auth.js';

type Client = { channel: 'public' | 'ops'; user?: AuthUser };
const clients = new Map<WebSocket, Client>();
let counter = 0;
const publicEvents = new Set(['BATCH_VERIFIED','CUSTOMS_CLEARED']);
export function publishEvent(type: string, payload: Record<string, unknown>): void {
  const frame = JSON.stringify({ type, payload, at: nowIso(), simulated: true });
  for (const [socket, client] of clients) {
    if (socket.readyState !== WebSocket.OPEN) continue;
    if (client.channel === 'ops' || publicEvents.has(type)) socket.send(frame);
  }
}
function telemetrySnapshot(): Record<string, unknown> {
  const hubs = db.prepare('SELECT id,name,latency_ms AS latencyMs,status,queue_depth AS queueDepth,x,y FROM hubs').all();
  const orderCount = Number((db.prepare('SELECT COUNT(*) AS count FROM orders WHERE created_at >= ?').get(new Date(Date.now()-30*60000).toISOString()) as {count:number}).count);
  return { hubs, orderRate: orderCount, connectedOperators: [...clients.values()].filter(c=>c.channel==='ops').length };
}
export function attachTelemetry(server: Server): void {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });
  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (url.pathname !== '/ws/telemetry') { socket.destroy(); return; }
    const isPublic = url.searchParams.get('public') === '1';
    const token = url.searchParams.get('token') ?? '';
    const user = token ? verifyAccessToken(token) : null;
    if (!isPublic && (!user || !['operator','admin'].includes(user.role))) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return; }
    if (user && [...clients.values()].filter(c=>c.user?.id===user.id).length >= 5) { socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n'); socket.destroy(); return; }
    wss.handleUpgrade(request, socket, head, ws => {
      clients.set(ws, { channel: isPublic ? 'public' : 'ops', ...(user ? {user} : {}) });
      ws.send(JSON.stringify({ type:'CONNECTED', payload:{channel:isPublic?'public':'ops'}, at:nowIso(), simulated:true }));
      ws.on('close',()=>clients.delete(ws));
      ws.on('error',()=>clients.delete(ws));
    });
  });
  const timer = setInterval(() => {
    counter += 1;
    const rows = db.prepare('SELECT id,latency_ms FROM hubs').all() as Array<{id:string;latency_ms:number}>;
    const update = db.prepare('UPDATE hubs SET latency_ms=?,queue_depth=? WHERE id=?');
    for (const hub of rows) update.run(Math.max(18, Math.min(260, hub.latency_ms + Math.floor(Math.random()*17)-8)), Math.max(1, Math.floor(Math.random()*36)), hub.id);
    publishEvent('TELEMETRY_TICK', telemetrySnapshot());
    if (counter % 3 === 0) publishEvent('BATCH_VERIFIED',{ sku:`AUD-${String((counter%6)+1).padStart(3,'0')}`, hubId:'HUB-ZRH' });
    if (counter % 5 === 0) publishEvent('CUSTOMS_CLEARED',{ hubId:'HUB-DXB', lane:'priority' });
  }, 2000);
  timer.unref();
  server.on('close',()=>{clearInterval(timer);wss.close();});
}
