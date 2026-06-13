import { store, api, showView, toast, escapeHtml, stanceLabel } from './api.js';

let searchingTopic = null;

export function renderQueue() {
  const list = document.getElementById('queue-list');
  list.innerHTML = store.topics
    .map((t) => {
      const stance = Number(store.stances[t.id] ?? 0);
      const canQueue = stance !== 0;
      return `
        <button class="btn queue-card ${canQueue ? '' : 'disabled'}"
                data-queue="${t.id}" ${canQueue ? '' : 'disabled'}>
          <span class="qt">${escapeHtml(t.title)}</span>
          <span class="qs">${escapeHtml(t.statement)}</span>
          <span class="mystance">${
            canQueue
              ? 'You: ' + stanceLabel(stance)
              : 'Set a stance to discuss this'
          }</span>
        </button>`;
    })
    .join('');

  list.querySelectorAll('[data-queue]').forEach((btn) => {
    btn.addEventListener('click', () => joinTopic(btn.dataset.queue));
  });

  document.getElementById('cancel-search').onclick = cancelSearch;
}

async function joinTopic(topicId) {
  const topic = store.topics.find((t) => t.id === topicId);
  searchingTopic = topicId;
  document.getElementById('queue-intro').classList.add('hidden');
  document.getElementById('queue-list').classList.add('hidden');
  document.getElementById('searching').classList.remove('hidden');
  document.getElementById('searching-topic').textContent = topic ? topic.title : topicId;
  try {
    await api('/api/queue', { token: store.token, topic: topicId });
    // Whether matched immediately or waiting, the 'matched' SSE event drives the
    // transition to chat. If only waiting, we keep showing the spinner.
  } catch (e) {
    toast(e.message);
    resetQueueView();
  }
}

async function cancelSearch() {
  try {
    await api('/api/cancel-queue', { token: store.token });
  } catch {}
  searchingTopic = null;
  resetQueueView();
}

function resetQueueView() {
  document.getElementById('searching').classList.add('hidden');
  document.getElementById('queue-intro').classList.remove('hidden');
  document.getElementById('queue-list').classList.remove('hidden');
}

export function leaveQueueView() {
  resetQueueView();
}
