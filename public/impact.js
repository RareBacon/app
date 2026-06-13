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

  const plural = (n, one, many) => (n === 1 ? one : many);

  el.innerHTML =
    stat(d.conversations, plural(d.conversations, 'conversation had', 'conversations had')) +
    stat(d.understoodPct + '%', 'understood the other side better') +
    stat(d.changedPct + '%', 'said it shifted their thinking') +
    stat(d.commonGroundPct + '%', 'found common ground') +
    stat(d.respectfulPct + '%', 'found it respectful & good-faith') +
    stat(d.againPct + '%', 'would do it again') +
    stat(d.feedbackCount, plural(d.feedbackCount, 'person shared feedback', 'people shared feedback'));
}
