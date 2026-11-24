import type * as Party from 'partykit/server';

const POINTER_ANGLE = -Math.PI / 2;

const DEFAULT_OPTIONS = ['Opción 1', 'Opción 2', 'Opción 3', 'Opción 4'];

const SLICE_COLORS = [
  '#8e2426', // Royal Crimson
  '#1f4e79', // Knight Sapphire
  '#d4a238', // Burnished Gold
  '#275d38', // Sherwood Emerald
  '#5d346b', // Imperial Plum
  '#b55422', // Copper Amber
  '#d9c398', // Aged Parchment
  '#1f6363', // Verdigris Teal
  '#6b3b24', // Chestnut Oak
  '#9e7b22', // Antique Brass
];

function normalizeAngle(rad: number): number {
  const twoPi = Math.PI * 2;
  return ((rad % twoPi) + twoPi) % twoPi;
}

function getSliceColor(index: number, total: number): string {
  const len = SLICE_COLORS.length;
  if (total > 2 && index === total - 1 && index % len === 0) {
    return SLICE_COLORS[4];
  }
  return SLICE_COLORS[index % len];
}

function getWinnerIndex(angle: number, count: number): number {
  if (!count || count <= 0) return -1;
  const sliceArc = (Math.PI * 2) / count;
  const relative = normalizeAngle(POINTER_ANGLE - angle);
  return Math.floor(relative / sliceArc) % count;
}

function secureRandomUnit(): number {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return arr[0] / 4294967296;
  }
  return Math.random();
}

function formatTimeNow(): string {
  try {
    return new Date().toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export interface HistoryEntry {
  label: string;
  color: string;
  time: string;
}

export interface SpinState {
  startRotation: number;
  targetRotation: number;
  duration: number;
  startedAt: number;
  winner: {
    index: number;
    label: string;
    color: string;
  };
}

export interface RoomState {
  options: string[];
  removeWinner: boolean;
  history: HistoryEntry[];
  rotation: number;
  participants: number;
  spin: SpinState | null;
}

type ClientMessage =
  | { type: 'ADD_OPTION'; option: string }
  | { type: 'REMOVE_OPTION'; index: number }
  | { type: 'SET_OPTIONS'; options: string[] }
  | { type: 'TOGGLE_REMOVE_WINNER'; value?: boolean }
  | { type: 'REMOVE_WINNER_NOW'; index?: number; label?: string }
  | { type: 'CLEAR_HISTORY' }
  | { type: 'SPIN' };

export default class RouletteServer implements Party.Server {
  state: RoomState;
  private spinTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(readonly room: Party.Room) {
    this.state = {
      options: [...DEFAULT_OPTIONS],
      removeWinner: false,
      history: [],
      rotation: 0,
      participants: 0,
      spin: null,
    };
  }

  private countParticipants(): number {
    let count = 0;
    for (const _ of this.room.getConnections()) {
      count++;
    }
    return count;
  }

  private getElapsedMs(): number {
    if (!this.state.spin) return 0;
    return Math.max(0, Date.now() - this.state.spin.startedAt);
  }

  private broadcastState(without?: string[]) {
    const elapsedMs = this.getElapsedMs();
    this.room.broadcast(
      JSON.stringify({
        type: 'STATE',
        elapsedMs,
        state: this.state,
      }),
      without
    );
  }

  private broadcastParticipants(without?: string[]) {
    this.room.broadcast(
      JSON.stringify({
        type: 'PARTICIPANTS',
        participants: this.state.participants,
      }),
      without
    );
  }

  onConnect(connection: Party.Connection) {
    this.state.participants = this.countParticipants();
    const elapsedMs = this.getElapsedMs();

    connection.send(
      JSON.stringify({
        type: 'STATE',
        elapsedMs,
        state: this.state,
      })
    );

    this.broadcastParticipants([connection.id]);
  }

  onClose() {
    this.state.participants = this.countParticipants();
    this.broadcastParticipants();
  }

  onMessage(message: string | ArrayBuffer | ArrayBufferView) {
    if (typeof message !== 'string') return;

    let payload: ClientMessage;
    try {
      payload = JSON.parse(message) as ClientMessage;
    } catch {
      return;
    }

    if (!payload || typeof payload.type !== 'string') return;

    switch (payload.type) {
      case 'ADD_OPTION': {
        if (this.state.spin) return;
        const clean = typeof payload.option === 'string' ? payload.option.trim().slice(0, 80) : '';
        if (!clean) return;
        this.state.options.push(clean);
        this.broadcastState();
        break;
      }

      case 'REMOVE_OPTION': {
        if (this.state.spin) return;
        const idx = Number(payload.index);
        if (!Number.isInteger(idx) || idx < 0 || idx >= this.state.options.length) return;
        this.state.options.splice(idx, 1);
        this.broadcastState();
        break;
      }

      case 'SET_OPTIONS': {
        if (this.state.spin) return;
        if (!Array.isArray(payload.options)) return;
        const sanitized = payload.options
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim().slice(0, 80))
          .filter(Boolean);
        this.state.options = sanitized;
        this.broadcastState();
        break;
      }

      case 'TOGGLE_REMOVE_WINNER': {
        if (this.state.spin) return;
        this.state.removeWinner =
          typeof payload.value === 'boolean' ? payload.value : !this.state.removeWinner;
        this.broadcastState();
        break;
      }

      case 'REMOVE_WINNER_NOW': {
        if (this.state.spin) return;
        const idx = Number(payload.index);
        if (
          Number.isInteger(idx) &&
          idx >= 0 &&
          idx < this.state.options.length &&
          (!payload.label || this.state.options[idx] === payload.label)
        ) {
          this.state.options.splice(idx, 1);
          this.broadcastState();
        } else if (typeof payload.label === 'string') {
          const fallbackIdx = this.state.options.indexOf(payload.label);
          if (fallbackIdx !== -1) {
            this.state.options.splice(fallbackIdx, 1);
            this.broadcastState();
          }
        }
        break;
      }

      case 'CLEAR_HISTORY': {
        this.state.history = [];
        this.broadcastState();
        break;
      }

      case 'SPIN': {
        this.handleSpin();
        break;
      }
    }
  }

  private handleSpin() {
    if (this.state.spin !== null) return;
    const count = this.state.options.length;
    if (count < 2) return;

    const sliceArc = (Math.PI * 2) / count;
    const chosenIndex = Math.floor(secureRandomUnit() * count);
    const intraFraction = 0.1 + secureRandomUnit() * 0.8;

    const desiredMod = normalizeAngle(
      POINTER_ANGLE - (chosenIndex + intraFraction) * sliceArc
    );
    const currentMod = normalizeAngle(this.state.rotation);
    const forwardDiff = normalizeAngle(desiredMod - currentMod);
    const extraTurns = 6 + Math.floor(secureRandomUnit() * 4);

    const startRotation = this.state.rotation;
    const targetRotation = startRotation + extraTurns * Math.PI * 2 + forwardDiff;
    const duration = 4800 + Math.floor(secureRandomUnit() * 900);

    const winnerIndex = getWinnerIndex(targetRotation, count);
    const winnerLabel = this.state.options[winnerIndex];
    const winnerColor = getSliceColor(winnerIndex, count);

    this.state.spin = {
      startRotation,
      targetRotation,
      duration,
      startedAt: Date.now(),
      winner: {
        index: winnerIndex,
        label: winnerLabel,
        color: winnerColor,
      },
    };

    this.room.broadcast(
      JSON.stringify({
        type: 'SPIN_START',
        elapsedMs: 0,
        state: this.state,
      })
    );

    if (this.spinTimer) {
      clearTimeout(this.spinTimer);
    }

    this.spinTimer = setTimeout(() => {
      this.finishSpin();
    }, duration);
  }

  private finishSpin() {
    this.spinTimer = null;
    const activeSpin = this.state.spin;
    if (!activeSpin) return;

    this.state.rotation = activeSpin.targetRotation;
    this.state.history.unshift({
      label: activeSpin.winner.label,
      color: activeSpin.winner.color,
      time: formatTimeNow(),
    });
    this.state.history = this.state.history.slice(0, 5);

    if (
      this.state.removeWinner &&
      activeSpin.winner.index >= 0 &&
      activeSpin.winner.index < this.state.options.length &&
      this.state.options[activeSpin.winner.index] === activeSpin.winner.label
    ) {
      this.state.options.splice(activeSpin.winner.index, 1);
    }

    this.state.spin = null;
    this.broadcastState();
  }
}
