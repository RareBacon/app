import { store, api, getJson, showView, toast, escapeHtml, stanceLabel, connectStream } from './api.js';

export async function renderOnboarding() {
  const { topics } = await getJson('/api/topics');
  store.topics = topics;
  const list = document.getElementById('topics-list');
  list.innerHTML = topics
    .map(
      (t) => `
      <div class="topic-card" data-topic="${t.id}">
        <div class="heat heat-${t.volatility}">${t.volatility} heat</div>
        <div class="statement">${escapeHtml(t.statement)}</div>
        <div class="slider-row">
          <input type="range" min="-3" max="3" step="1" value="0"
                 aria-label="Your stance on: ${escapeHtml(t.statement)}"
                 data-stance="${t.id}" />
          <span class="stance-label" data-label="${t.id}">Neutral</span>
        </div>
      </div>`,
    )
    .join('');

  list.querySelectorAll('input[type="range"]').forEach((input) => {
    const id = input.dataset.stance;
    const label = list.querySelector(`[data-label="${id}"]`);
    const update = () => {
      label.textContent = stanceLabel(input.value);
    };
    input.addEventListener('input', update);
    update();
  });
}

export function wireOnboarding(onDone) {
  document.getElementById('onboarding-continue').addEventListener('click', async () => {
    const nickname = document.getElementById('nickname').value.trim() || 'Anonymous';
    const stances = {};
    document.querySelectorAll('[data-stance]').forEach((el) => {
      stances[el.dataset.stance] = Number(el.value);
    });

    const hasOpinion = Object.values(stances).some((v) => v !== 0);
    if (!hasOpinion) {
      toast('Set a stance (not 0) on at least one topic to get matched.');
      return;
    }

    try {
      const { token, nickname: nick } = await api('/api/session', {
        nickname,
        stances,
      });
      store.token = token;
      store.nickname = nick;
      store.stances = stances;
      store.reasonings = {};
      connectStream();
      onDone();
    } catch (e) {
      toast(e.message);
    }
  });
}
