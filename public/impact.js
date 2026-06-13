import { getJson } from './api.js';

// Render the anonymized aggregate impact stats. Shows an honest empty state until
// there is real (non-bot) feedback.
export async function renderImpact() {
  const el = document.getElementById('impact-stats');
  el.innerHTML = '<p class="muted">Loading…</p>';
  let d;
  try {
    d = await getJson('/api/metrics');
  } catch {
    el.innerHTML = '<p class="muted">Couldn\'t load the numbers right now.</p>';
    return;
  }

  if (!d.feedbackCount) {
    el.innerHTML =
      '<p class="muted">No conversations have been rated yet — have one and be the first to weigh in.</p>';
    return;
  }

  const stat = (num, label) =>
    `<div class="stat"><div class="stat-num">${num}</div><div class="stat-label">${label}</div></div>`;

  el.innerHTML =
    stat(d.conversations, 'conversations had') +
    stat(d.understoodPct + '%', 'understood the other side better') +
    stat(d.changedPct + '%', 'said it shifted their thinking') +
    stat(d.feedbackCount, 'people shared feedback');
}
