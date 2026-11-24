import { initDiscordEnvironment } from './discord.js';
import { RoomSyncClient } from './sync.js';
import { SoundEngine } from './audio.js';
import { ConfettiCannon } from './confetti.js';
import { RouletteWheel, getSlicePalette } from './wheel.js';
import { DEFAULT_OPTIONS, loadState, saveState } from './storage.js';

const state = loadState();
let activeTab = 'list';
let lastWinner = null;
let activeSpinStartedAt = null;
let finishedSpinStartedAt = null;

// DOM Elements
const roomStatusEl = document.getElementById('room-status');
const roomStatusTextEl = document.getElementById('room-status-text');
const discordStatusEl = document.getElementById('discord-status');
const discordStatusTextEl = document.getElementById('discord-status-text');
const muteBtn = document.getElementById('mute-btn');
const iconSoundOn = document.getElementById('icon-sound-on');
const iconSoundOff = document.getElementById('icon-sound-off');

const wheelStageBox = document.getElementById('wheel-stage-box');
const wheelCanvas = document.getElementById('wheel-canvas');
const spinBtn = document.getElementById('spin-btn');
const spinBtnLabel = document.getElementById('spin-btn-label');
const wheelHint = document.getElementById('wheel-hint');
const pipWinnerBox = document.getElementById('pip-last-winner');
const pipWinnerDot = document.getElementById('pip-winner-dot');
const pipWinnerText = document.getElementById('pip-winner-text');

const tabListBtn = document.getElementById('tab-list');
const tabBulkBtn = document.getElementById('tab-bulk');
const listView = document.getElementById('list-view');
const bulkView = document.getElementById('bulk-view');
const optionsCountBadge = document.getElementById('options-count');

const addOptionForm = document.getElementById('add-option-form');
const optionInput = document.getElementById('option-input');
const addOptionBtn = document.getElementById('add-option-btn');
const shuffleBtn = document.getElementById('shuffle-btn');
const clearBtn = document.getElementById('clear-btn');
const optionsListEl = document.getElementById('options-list');
const emptyOptionsEl = document.getElementById('empty-options');
const restoreDefaultsBtn = document.getElementById('restore-defaults-btn');

const bulkTextarea = document.getElementById('bulk-textarea');
const bulkLineCount = document.getElementById('bulk-line-count');
const bulkDoneBtn = document.getElementById('bulk-done-btn');

const eliminationToggle = document.getElementById('elimination-toggle');
const historyListEl = document.getElementById('history-list');
const clearHistoryBtn = document.getElementById('clear-history-btn');

const confettiCanvas = document.getElementById('confetti-canvas');
const winnerModal = document.getElementById('winner-modal');
const winnerAccentBar = document.getElementById('winner-accent-bar');
const winnerNameEl = document.getElementById('winner-name');
const winnerSubnoteEl = document.getElementById('winner-subnote');
const spinAgainBtn = document.getElementById('spin-again-btn');
const removeWinnerBtn = document.getElementById('remove-winner-btn');
const closeModalBtn = document.getElementById('close-modal-btn');
const closeModalX = document.getElementById('close-modal-x');

// Engines
const sound = new SoundEngine(state.muted);
const confetti = new ConfettiCannon(confettiCanvas);
const wheel = new RouletteWheel(wheelCanvas, {
  onTick: (speedRatio) => sound.playTick(speedRatio),
  onComplete: handleSpinComplete,
  onCenterClick: startSpin,
});

const syncClient = new RoomSyncClient({
  onState: applyServerState,
  onSpinStart: applyServerSpinStart,
  onParticipants: (participants) => {
    updateRoomStatus({
      status: syncClient.status,
      participants,
      roomId: syncClient.roomId,
    });
  },
  onConnectionChange: updateRoomStatus,
});

function formatTimeNow() {
  try {
    return new Date().toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function syncSoundUI() {
  const muted = sound.isMuted();
  muteBtn.classList.toggle('is-muted', muted);
  muteBtn.setAttribute('aria-pressed', String(muted));
  muteBtn.setAttribute(
    'aria-label',
    muted ? 'Activar audio' : 'Silenciar audio'
  );
  muteBtn.title = muted
    ? 'Activar efectos de sonido'
    : 'Silenciar efectos de sonido';
  iconSoundOn.classList.toggle('hidden', muted);
  iconSoundOff.classList.toggle('hidden', !muted);
}

function updateDiscordStatus({ mode, label, detail }) {
  discordStatusEl.className = `status-pill status-${mode}`;
  discordStatusTextEl.textContent = label;
  discordStatusEl.title = detail || label;
}

function updateRoomStatus({ status, participants, roomId }) {
  if (status === 'connected') {
    const count = Math.max(1, Number(participants) || 1);
    roomStatusEl.className = 'status-pill status-live';
    roomStatusTextEl.textContent = `En vivo · ${count} en sala`;
    roomStatusEl.title = `Sincronizado en sala "${roomId}" (${count} conectados)`;
  } else if (status === 'connecting') {
    roomStatusEl.className = 'status-pill status-connecting';
    roomStatusTextEl.textContent = 'Conectando...';
    roomStatusEl.title = `Conectando a sala "${roomId}"`;
  } else {
    roomStatusEl.className = 'status-pill status-disconnected';
    roomStatusTextEl.textContent = 'Sin conexión';
    roomStatusEl.title = 'Sin servidor en tiempo real (reintentando cada 2s)';
  }
}

function applyServerState(serverState, elapsedMs = 0) {
  if (!serverState) return;

  state.options = Array.isArray(serverState.options)
    ? [...serverState.options]
    : [...DEFAULT_OPTIONS];
  state.history = Array.isArray(serverState.history)
    ? serverState.history.slice(0, 5)
    : [];
  state.eliminationMode = Boolean(serverState.removeWinner);
  eliminationToggle.checked = state.eliminationMode;

  if (typeof serverState.participants === 'number') {
    updateRoomStatus({
      status: syncClient.status,
      participants: serverState.participants,
      roomId: syncClient.roomId,
    });
  }

  wheel.setOptions(state.options);

  if (serverState.spin) {
    const spin = serverState.spin;
    if (
      activeSpinStartedAt !== spin.startedAt &&
      finishedSpinStartedAt !== spin.startedAt
    ) {
      activeSpinStartedAt = spin.startedAt;
      closeWinnerModal();
      wheel.startSyncedSpin({
        startRotation: spin.startRotation,
        targetRotation: spin.targetRotation,
        duration: spin.duration,
        elapsedMs,
        winner: spin.winner,
      });
    }
  } else {
    activeSpinStartedAt = null;
    if (!wheel.isSpinning && typeof serverState.rotation === 'number') {
      wheel.setAngle(serverState.rotation);
    }
    if (lastWinner && !winnerModal.classList.contains('hidden')) {
      const stillExists = state.options.includes(lastWinner.label);
      if (!stillExists && !lastWinner.removed) {
        lastWinner.removed = true;
        openWinnerModal(lastWinner);
      } else {
        spinAgainBtn.disabled = state.options.length < 2;
      }
    }
  }

  const shouldSyncBulk =
    activeTab !== 'bulk' || document.activeElement !== bulkTextarea;
  updateApp({ syncBulkText: shouldSyncBulk });
}

function applyServerSpinStart(serverState, elapsedMs = 0) {
  if (!serverState || !serverState.spin) return;

  state.options = Array.isArray(serverState.options)
    ? [...serverState.options]
    : state.options;
  state.eliminationMode = Boolean(serverState.removeWinner);
  eliminationToggle.checked = state.eliminationMode;
  wheel.setOptions(state.options);

  const spin = serverState.spin;
  if (activeSpinStartedAt !== spin.startedAt) {
    activeSpinStartedAt = spin.startedAt;
    finishedSpinStartedAt = null;
    closeWinnerModal();
    sound.unlock();
    wheel.startSyncedSpin({
      startRotation: spin.startRotation,
      targetRotation: spin.targetRotation,
      duration: spin.duration,
      elapsedMs,
      winner: spin.winner,
    });
  }

  updateApp({ syncBulkText: activeTab !== 'bulk' });
}

function renderOptionsList() {
  const total = state.options.length;
  optionsCountBadge.textContent = String(total);

  optionsListEl.innerHTML = '';

  if (total === 0) {
    emptyOptionsEl.classList.remove('hidden');
    optionsListEl.classList.add('hidden');
  } else {
    emptyOptionsEl.classList.add('hidden');
    optionsListEl.classList.remove('hidden');

    const fragment = document.createDocumentFragment();
    state.options.forEach((label, index) => {
      const palette = getSlicePalette(index, total);

      const li = document.createElement('li');
      li.className = 'option-item';

      const swatch = document.createElement('span');
      swatch.className = 'option-swatch';
      swatch.style.backgroundColor = palette.bg;
      swatch.setAttribute('aria-hidden', 'true');

      const textSpan = document.createElement('span');
      textSpan.className = 'option-label';
      textSpan.textContent = label;
      textSpan.title = label;

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'option-delete-btn';
      delBtn.dataset.index = String(index);
      delBtn.disabled = wheel.isSpinning;
      delBtn.setAttribute('aria-label', `Eliminar ${label}`);
      delBtn.title = 'Eliminar opción';
      delBtn.innerHTML =
        '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

      li.append(swatch, textSpan, delBtn);
      fragment.appendChild(li);
    });

    optionsListEl.appendChild(fragment);
  }

  bulkLineCount.textContent =
    total === 1 ? '1 opción detectada' : `${total} opciones detectadas`;
}

function renderHistory() {
  historyListEl.innerHTML = '';

  if (state.history.length === 0) {
    clearHistoryBtn.classList.add('hidden');
    const emptyLi = document.createElement('li');
    emptyLi.className = 'history-empty';
    emptyLi.textContent = 'Aún no hay resultados registrados.';
    historyListEl.appendChild(emptyLi);
    pipWinnerBox.classList.add('hidden');
    return;
  }

  clearHistoryBtn.classList.remove('hidden');

  const latest = state.history[0];
  pipWinnerDot.style.backgroundColor = latest.color;
  pipWinnerText.textContent = latest.label;
  pipWinnerBox.classList.remove('hidden');

  const fragment = document.createDocumentFragment();
  state.history.slice(0, 5).forEach((item) => {
    const li = document.createElement('li');
    li.className = 'history-item';

    const dot = document.createElement('span');
    dot.className = 'history-dot';
    dot.style.backgroundColor = item.color;
    dot.setAttribute('aria-hidden', 'true');

    const labelSpan = document.createElement('span');
    labelSpan.className = 'history-label';
    labelSpan.textContent = item.label;
    labelSpan.title = item.label;

    const timeSpan = document.createElement('span');
    timeSpan.className = 'history-time';
    timeSpan.textContent = item.time || '';

    li.append(dot, labelSpan, timeSpan);
    fragment.appendChild(li);
  });

  historyListEl.appendChild(fragment);
}

function syncControlsState() {
  const spinning = wheel.isSpinning;
  const count = state.options.length;
  const canSpin = !spinning && count >= 2;

  spinBtn.disabled = !canSpin;
  spinBtnLabel.textContent = spinning ? 'Girando...' : 'Girar Ruleta';
  wheelHint.classList.toggle('hidden', count >= 2 || spinning);

  optionInput.disabled = spinning;
  addOptionBtn.disabled = spinning;
  shuffleBtn.disabled = spinning || count < 2;
  clearBtn.disabled = spinning || count === 0;
  bulkTextarea.disabled = spinning;
  eliminationToggle.disabled = spinning;

  const deleteButtons = optionsListEl.querySelectorAll('.option-delete-btn');
  deleteButtons.forEach((btn) => {
    btn.disabled = spinning;
  });
}

function updateApp({ syncBulkText = false } = {}) {
  wheel.setOptions(state.options);
  renderOptionsList();
  renderHistory();
  syncControlsState();

  if (syncBulkText || activeTab !== 'bulk') {
    bulkTextarea.value = state.options.join('\n');
  }

  saveState(state);
}

function switchTab(tab) {
  activeTab = tab;
  const isList = tab === 'list';

  tabListBtn.classList.toggle('active', isList);
  tabBulkBtn.classList.toggle('active', !isList);
  tabListBtn.setAttribute('aria-selected', String(isList));
  tabBulkBtn.setAttribute('aria-selected', String(!isList));

  listView.classList.toggle('hidden', !isList);
  bulkView.classList.toggle('hidden', isList);

  if (!isList) {
    bulkTextarea.value = state.options.join('\n');
    bulkTextarea.focus();
  }
}

function startSpin() {
  if (wheel.isSpinning || state.options.length < 2) return;
  closeWinnerModal();
  sound.unlock();

  if (syncClient.isConnected()) {
    syncClient.send({ type: 'SPIN' });
    return;
  }

  const started = wheel.spin();
  if (started) {
    syncControlsState();
  }
}

function handleSpinComplete(winner) {
  if (!winner || winner.index < 0) {
    syncControlsState();
    return;
  }

  if (activeSpinStartedAt !== null) {
    finishedSpinStartedAt = activeSpinStartedAt;
    activeSpinStartedAt = null;
  }

  sound.playVictory();
  confetti.burst();

  const isSynced = syncClient.isConnected();

  if (!isSynced) {
    state.history.unshift({
      label: winner.label,
      color: winner.color,
      time: formatTimeNow(),
    });
    state.history = state.history.slice(0, 5);

    let removed = false;
    if (state.eliminationMode && winner.index < state.options.length) {
      state.options.splice(winner.index, 1);
      removed = true;
    }

    lastWinner = { ...winner, removed };
    updateApp({ syncBulkText: true });
    openWinnerModal(lastWinner);
    return;
  }

  // In synced mode, server finishSpin() will broadcast updated history & options
  lastWinner = {
    ...winner,
    removed: state.eliminationMode,
  };
  syncControlsState();
  openWinnerModal(lastWinner);
}

function openWinnerModal(winner) {
  winnerAccentBar.style.backgroundColor = winner.color;
  winnerNameEl.textContent = winner.label;

  if (winner.removed) {
    winnerSubnoteEl.textContent = 'Eliminado automáticamente de la ruleta';
    winnerSubnoteEl.classList.remove('hidden');
    removeWinnerBtn.classList.add('hidden');
  } else {
    winnerSubnoteEl.classList.add('hidden');
    removeWinnerBtn.classList.remove('hidden');
  }

  spinAgainBtn.disabled = state.options.length < 2;
  spinAgainBtn.title =
    state.options.length < 2
      ? 'Necesitas al menos 2 opciones para girar de nuevo'
      : 'Girar la ruleta otra vez';

  winnerModal.classList.remove('hidden');
  if (!spinAgainBtn.disabled) {
    spinAgainBtn.focus();
  } else {
    closeModalBtn.focus();
  }
}

function closeWinnerModal() {
  winnerModal.classList.add('hidden');
}

function updateWheelSize() {
  const rect = wheelStageBox.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  const maxCap = window.innerHeight <= 430 ? 340 : 540;
  const size = Math.max(124, Math.min(rect.width, rect.height, maxCap));
  wheel.resize(size);
}

// Event Listeners
addOptionForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (wheel.isSpinning) return;

  const value = optionInput.value.trim();
  if (!value) return;

  optionInput.value = '';
  optionInput.focus();

  if (syncClient.send({ type: 'ADD_OPTION', option: value })) {
    return;
  }

  state.options.push(value);
  updateApp({ syncBulkText: true });
});

optionsListEl.addEventListener('click', (e) => {
  if (wheel.isSpinning) return;
  const btn = e.target.closest('.option-delete-btn');
  if (!btn) return;

  const idx = Number(btn.dataset.index);
  if (!Number.isInteger(idx) || idx < 0 || idx >= state.options.length) return;

  if (syncClient.send({ type: 'REMOVE_OPTION', index: idx })) {
    return;
  }

  state.options.splice(idx, 1);
  updateApp({ syncBulkText: true });
});

shuffleBtn.addEventListener('click', () => {
  if (wheel.isSpinning || state.options.length < 2) return;

  const shuffled = [...state.options];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  if (syncClient.send({ type: 'SET_OPTIONS', options: shuffled })) {
    return;
  }

  state.options = shuffled;
  updateApp({ syncBulkText: true });
});

clearBtn.addEventListener('click', () => {
  if (wheel.isSpinning || state.options.length === 0) return;

  if (syncClient.send({ type: 'SET_OPTIONS', options: [] })) {
    return;
  }

  state.options = [];
  updateApp({ syncBulkText: true });
});

restoreDefaultsBtn.addEventListener('click', () => {
  if (wheel.isSpinning) return;

  if (syncClient.send({ type: 'SET_OPTIONS', options: [...DEFAULT_OPTIONS] })) {
    return;
  }

  state.options = [...DEFAULT_OPTIONS];
  updateApp({ syncBulkText: true });
});

tabListBtn.addEventListener('click', () => switchTab('list'));
tabBulkBtn.addEventListener('click', () => switchTab('bulk'));
bulkDoneBtn.addEventListener('click', () => switchTab('list'));

bulkTextarea.addEventListener('input', () => {
  if (wheel.isSpinning) return;
  const parsed = bulkTextarea.value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (syncClient.send({ type: 'SET_OPTIONS', options: parsed })) {
    return;
  }

  state.options = parsed;
  updateApp({ syncBulkText: false });
});

eliminationToggle.checked = state.eliminationMode;
eliminationToggle.addEventListener('change', () => {
  const nextVal = eliminationToggle.checked;
  if (syncClient.send({ type: 'TOGGLE_REMOVE_WINNER', value: nextVal })) {
    return;
  }
  state.eliminationMode = nextVal;
  saveState(state);
});

muteBtn.addEventListener('click', () => {
  state.muted = !state.muted;
  sound.setMuted(state.muted);
  if (!state.muted) sound.unlock();
  syncSoundUI();
  saveState(state);
});

clearHistoryBtn.addEventListener('click', () => {
  if (syncClient.send({ type: 'CLEAR_HISTORY' })) {
    return;
  }
  state.history = [];
  renderHistory();
  saveState(state);
});

spinBtn.addEventListener('click', startSpin);

spinAgainBtn.addEventListener('click', () => {
  startSpin();
});

removeWinnerBtn.addEventListener('click', () => {
  if (lastWinner && !lastWinner.removed) {
    if (
      syncClient.send({
        type: 'REMOVE_WINNER_NOW',
        index: lastWinner.index,
        label: lastWinner.label,
      })
    ) {
      lastWinner.removed = true;
      closeWinnerModal();
      return;
    }

    if (lastWinner.index >= 0 && lastWinner.index < state.options.length) {
      state.options.splice(lastWinner.index, 1);
      lastWinner.removed = true;
      updateApp({ syncBulkText: true });
    }
  }
  closeWinnerModal();
});

closeModalBtn.addEventListener('click', closeWinnerModal);
closeModalX.addEventListener('click', closeWinnerModal);
winnerModal.addEventListener('click', (e) => {
  if (e.target === winnerModal) {
    closeWinnerModal();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !winnerModal.classList.contains('hidden')) {
    closeWinnerModal();
  }
});

// Responsive HiDPI resizing
if (typeof ResizeObserver !== 'undefined') {
  const observer = new ResizeObserver(() => updateWheelSize());
  observer.observe(wheelStageBox);
}
window.addEventListener('resize', updateWheelSize);

// Boot
syncSoundUI();
updateApp({ syncBulkText: true });
updateWheelSize();

initDiscordEnvironment(updateDiscordStatus).then(({ isDiscord, roomId }) => {
  syncClient.connect({ isDiscord, roomId });
});
