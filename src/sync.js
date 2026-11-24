/**
 * Native browser WebSocket client for PartyKit room synchronization.
 * Avoids external WebSocket libraries so Discord Activity CSP/proxy works reliably.
 */
export class RoomSyncClient {
  constructor({ onState, onSpinStart, onParticipants, onConnectionChange }) {
    this.onState = onState || (() => {});
    this.onSpinStart = onSpinStart || (() => {});
    this.onParticipants = onParticipants || (() => {});
    this.onConnectionChange = onConnectionChange || (() => {});

    this.ws = null;
    this.url = null;
    this.roomId = 'local-test';
    this.isDiscord = false;
    this.status = 'disconnected';
    this.participants = 1;
    this.reconnectTimer = null;
    this.destroyed = false;
  }

  buildUrl(isDiscord, roomId) {
    const safeRoom = encodeURIComponent(roomId);
    if (isDiscord) {
      return `wss://${window.location.host}/.proxy/ws/parties/main/${safeRoom}`;
    }
    return `ws://localhost:1999/parties/main/${safeRoom}`;
  }

  connect({ isDiscord, roomId }) {
    this.isDiscord = Boolean(isDiscord);
    this.roomId = roomId || 'local-test';
    this.url = this.buildUrl(this.isDiscord, this.roomId);
    this.destroyed = false;
    this.openSocket();
  }

  openSocket() {
    if (this.destroyed || !this.url) return;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.close();
      } catch {
        // Ignore cleanup errors
      }
      this.ws = null;
    }

    this.setStatus('connecting');

    let socket;
    try {
      socket = new WebSocket(this.url);
    } catch {
      this.setStatus('disconnected');
      this.scheduleReconnect();
      return;
    }

    this.ws = socket;

    socket.addEventListener('open', () => {
      if (this.ws !== socket || this.destroyed) return;
      this.setStatus('connected');
    });

    socket.addEventListener('message', (event) => {
      if (this.ws !== socket || this.destroyed) return;
      if (typeof event.data !== 'string') return;

      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      if (!msg || typeof msg.type !== 'string') return;

      if (msg.type === 'STATE' && msg.state) {
        if (typeof msg.state.participants === 'number') {
          this.participants = msg.state.participants;
        }
        this.onState(msg.state, typeof msg.elapsedMs === 'number' ? msg.elapsedMs : 0);
      } else if (msg.type === 'SPIN_START' && msg.state) {
        if (typeof msg.state.participants === 'number') {
          this.participants = msg.state.participants;
        }
        this.onSpinStart(msg.state, typeof msg.elapsedMs === 'number' ? msg.elapsedMs : 0);
      } else if (msg.type === 'PARTICIPANTS' && typeof msg.participants === 'number') {
        this.participants = msg.participants;
        this.onParticipants(msg.participants);
      }
    });

    socket.addEventListener('close', () => {
      if (this.ws !== socket || this.destroyed) return;
      this.ws = null;
      this.setStatus('disconnected');
      this.scheduleReconnect();
    });

    socket.addEventListener('error', () => {
      // `close` will fire right after error and trigger reconnect
    });
  }

  scheduleReconnect() {
    if (this.destroyed || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
    }, 2000);
  }

  setStatus(status) {
    this.status = status;
    this.onConnectionChange({
      status,
      participants: this.participants,
      roomId: this.roomId,
    });
  }

  isConnected() {
    return Boolean(this.ws && this.ws.readyState === WebSocket.OPEN);
  }

  send(payload) {
    if (!this.isConnected()) return false;
    try {
      this.ws.send(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  destroy() {
    this.destroyed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Ignore
      }
      this.ws = null;
    }
  }
}
