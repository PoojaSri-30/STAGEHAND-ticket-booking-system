const WebSocket = require('ws');

let wss = null;

function initRealtime(server) {
  wss = new WebSocket.Server({ server, path: '/ws' });
  wss.on('connection', (ws) => {
    ws.on('message', (msg) => {
      // Clients can subscribe to a specific event's seat map: {"subscribe": "evt_123"}
      try {
        const data = JSON.parse(msg);
        if (data.subscribe) ws.eventId = data.subscribe;
      } catch (e) {
        /* ignore malformed messages */
      }
    });
  });
  return wss;
}

/** Broadcasts a seat-map-changed signal to clients subscribed to this event. */
function broadcastSeatUpdate(eventId) {
  if (!wss) return;
  const payload = JSON.stringify({ type: 'seat_update', eventId });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN && (!client.eventId || client.eventId === eventId)) {
      client.send(payload);
    }
  });
}

/** Generic broadcast used by the scheduler when it can't target one event id. */
function broadcastAll() {
  if (!wss) return;
  const payload = JSON.stringify({ type: 'seat_update', eventId: null });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  });
}

module.exports = { initRealtime, broadcastSeatUpdate, broadcastAll };
