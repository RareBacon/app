import { store, api, toast, escapeHtml, stanceLabel } from './api.js';
import { loadNews } from './newsfeed.js';

let searchingTopic = null;
let selectedTopic = null;

export function renderQueue() {
  // Always enter the queue on a clean topic list — never a stale searching panel
  // left over from a previous conversation.
  resetQueueView();

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
    btn.addEventListener('click', () => selectTopic(btn.dataset.queue));
  });

  document.getElementById('cancel-search').onclick = cancelSearch;
  document.getElementById('why-back').onclick = backToTopics;
  document.getElementById('why-go').onclick = () => {
    const reasoning = document.getElementById('why-input').value.trim();
    joinTopic(selectedTopic, reasoning);
  };
}

// Step 1: pick a topic -> ask the (optional) one-line "why" just in time.
function selectTopic(topicId) {
  const topic = store.topics.find((t) => t.id === topicId);
  selectedTopic = topicId;
  document.getElementById('why-statement').textContent = topic ? topic.statement : topicId;
  document.getElementById('why-stance').textContent = stanceLabel(store.stances[topicId] ?? 0);
  document.getElementById('why-input').value = '';
  document.getElementById('queue-intro').classList.add('hidden');
  document.getElementById('queue-list').classList.add('hidden');
  document.getElementById('topic-why').classList.remove('hidden');
  document.getElementById('why-input').focus();
}

function backToTopics() {
  document.getElementById('topic-why').classList.add('hidden');
  document.getElementById('queue-intro').classList.remove('hidden');
  document.getElementById('queue-list').classList.remove('hidden');
}

// Step 2: enter the queue and wait for a match (the 'matched' SSE event drives
// the transition to chat).
async function joinTopic(topicId, reasoning) {
  const topic = store.topics.find((t) => t.id === topicId);
  searchingTopic = topicId;
  document.getElementById('topic-why').classList.add('hidden');
  document.getElementById('queue-intro').classList.add('hidden');
  document.getElementById('queue-list').classList.add('hidden');
  document.getElementById('searching').classList.remove('hidden');
  document.getElementById('searching-topic').textContent = topic ? topic.title : topicId;
  loadNews(topicId, document.getElementById('news-list'), {
    head: 'While you wait — recent coverage',
  });
  try {
    await api('/api/queue', { token: store.token, topic: topicId, reasoning });
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
  searchingTopic = null;
  selectedTopic = null;
  document.getElementById('searching').classList.add('hidden');
  document.getElementById('topic-why').classList.add('hidden');
  document.getElementById('news-list').innerHTML = '';
  document.getElementById('queue-intro').classList.remove('hidden');
  document.getElementById('queue-list').classList.remove('hidden');
}

export function leaveQueueView() {
  resetQueueView();
}
