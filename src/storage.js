const STORAGE_KEY = 'ruleta_del_destino_v2';

export const DEFAULT_OPTIONS = [
  'Opción 1',
  'Opción 2',
  'Opción 3',
  'Opción 4',
];

const DEFAULT_STATE = {
  options: [...DEFAULT_OPTIONS],
  history: [],
  eliminationMode: false,
  muted: false,
};

export function loadState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        ...DEFAULT_STATE,
        options: [...DEFAULT_OPTIONS],
        history: [],
      };
    }

    const parsed = JSON.parse(raw);
    const options = Array.isArray(parsed.options)
      ? parsed.options
          .filter((item) => typeof item === 'string')
          .map((item) => item.trim())
          .filter(Boolean)
      : [...DEFAULT_OPTIONS];

    const history = Array.isArray(parsed.history)
      ? parsed.history
          .filter(
            (entry) =>
              entry &&
              typeof entry.label === 'string' &&
              typeof entry.color === 'string'
          )
          .slice(0, 5)
      : [];

    return {
      options,
      history,
      eliminationMode: Boolean(parsed.eliminationMode),
      muted: Boolean(parsed.muted),
    };
  } catch {
    return {
      ...DEFAULT_STATE,
      options: [...DEFAULT_OPTIONS],
      history: [],
    };
  }
}

export function saveState(state) {
  try {
    const payload = {
      options: state.options,
      history: state.history.slice(0, 5),
      eliminationMode: Boolean(state.eliminationMode),
      muted: Boolean(state.muted),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage errors inside restricted iframe contexts
  }
}
