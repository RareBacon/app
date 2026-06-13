// Shared client state, API helpers, view switching, and the SSE connection.

export const store = {
  token: null,
  nickname: null,
  topics: [],
  stances: {}, // topicId -> number
  reasonings: {}, // topicId -> string
  room: null, // { roomId, topic, you, participants }
};

const listeners = new Map(); // eventType -> Set<fn>

export function on(type, fn) {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type).add(fn);
}

function emit(type, data) {
  (listeners.get(type) || []).forEach((fn) => fn(data));
}

export async function api(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `request failed (${res.status})`);
  return data;
}

export async function getJson(path) {
  const res = await fetch(path);
  return res.json();
}

let es = null;
export function connectStream() {
  if (es) es.close();
  es = new EventSource(`/api/events?token=${encodeURIComponent(store.token)}`);
  ['ready', 'matched', 'message', 'ended'].forEach((type) => {
    es.addEventListener(type, (e) => {
      let data = {};
      try {
        data = JSON.parse(e.data);
      } catch {}
      emit(type, data);
    });
  });
  es.onerror = () => {
    // EventSource auto-reconnects; nothing to do.
  };
}

export function showView(id) {
  document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
  // The chat view widens the app to fit the side news panel.
  document.getElementById('app').classList.toggle('wide', id === 'view-chat');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

let toastTimer = null;
export function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3200);
}

export function hideToast() {
  clearTimeout(toastTimer);
  document.getElementById('toast').classList.add('hidden');
}

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function stanceLabel(stance) {
  const s = Number(stance);
  if (s <= -3) return 'Strongly disagree';
  if (s === -2) return 'Disagree';
  if (s === -1) return 'Somewhat disagree';
  if (s === 0) return 'Neutral';
  if (s === 1) return 'Somewhat agree';
  if (s === 2) return 'Agree';
  return 'Strongly agree';
}
