import { getJson, escapeHtml } from './api.js';

// Shared news renderer: fetch recent headlines for a topic and render clickable,
// source-attributed links into `el`. Best-effort — if the feed is blocked or
// empty, the container is simply left empty. `token` guards against a stale
// response landing after the user moved on (pass the topic you're still showing).
export async function loadNews(topicId, el, { head = 'Recent coverage' } = {}) {
  if (!el) return;
  el.innerHTML = '';
  el.dataset.topic = topicId; // a newer call for another topic invalidates this one
  let items;
  try {
    ({ items } = await getJson(`/api/news?topic=${encodeURIComponent(topicId)}`));
  } catch {
    return; // offline or blocked — leave it clean
  }
  if (el.dataset.topic !== topicId || !items || !items.length) return;
  el.innerHTML =
    `<p class="news-head">${escapeHtml(head)}</p>` +
    items.map(renderItem).join('');
}

function renderItem(a) {
  const lean = a.lean ? `<span class="news-lean lean-${a.lean}">${escapeHtml(a.lean)}</span>` : '';
  const src = a.source ? `<span class="news-src">${escapeHtml(a.source)}${lean}</span>` : '';
  return `<a class="news-item" href="${escapeHtml(a.url)}" target="_blank" rel="noopener noreferrer">
            <span class="news-title">${escapeHtml(a.title)}</span>
            ${src}
          </a>`;
}
