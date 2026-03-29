const DRAG_DEBUG_STORAGE_KEY = 'hadith-graph-debug-drag';

type DebugWindow = Window & {
  __HADITH_GRAPH_DEBUG_DRAG__?: boolean;
};

function normalizeDebugFlag(value: string | null): boolean {
  if (!value) {
    return false;
  }

  return ['1', 'true', 'yes', 'on', 'debug'].includes(value.toLowerCase());
}

export function isDragDebugEnabled(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  if ((window as DebugWindow).__HADITH_GRAPH_DEBUG_DRAG__) {
    return true;
  }

  try {
    return normalizeDebugFlag(window.localStorage.getItem(DRAG_DEBUG_STORAGE_KEY));
  } catch {
    return false;
  }
}

export function logDragDebug(label: string, payload?: Record<string, unknown>): void {
  if (!isDragDebugEnabled()) {
    return;
  }

  if (payload) {
    console.log(`[drag-debug] ${label}`, payload);
    return;
  }

  console.log(`[drag-debug] ${label}`);
}

export { DRAG_DEBUG_STORAGE_KEY };
