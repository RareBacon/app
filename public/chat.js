import { store, api, showView, toast, hideToast, escapeHtml, stanceLabel } from './api.js';

let endedReason = null;

export function enterChat(matched) {
  store.room = matched;
  endedReason = null;
  const topic = matched.topic;
  document.getElementById('chat-topic').textContent = topic.title;
  document.getElementById('chat-sub').textContent = topic.statement;

  const other = matched.participants.find((p) => p.nickname !== matched.you.nickname);
  document.getElementById('messages').innerHTML = '';
  showView('view-chat');
  toast(
    other
      ? `Matched with ${other.nickname} — they ${stanceLabel(other.stance).toLowerCase()}.`
      : 'Matched.',
  );
  document.getElementById('composer-input').focus();
}

export function appendMessage(m) {
  const wrap = document.getElementById('messages');
  const isMediator = m.from === 'mediator';
  const isMe = store.room && m.from === store.token;
  const cls = isMediator ? 'mediator' : isMe ? 'me' : 'them';
  const div = document.createElement('div');
  div.className = `msg ${cls} kind-${m.kind || 'user'}`;
  div.innerHTML = `<div class="who">${escapeHtml(m.name)}</div><div class="body">${escapeHtml(
    m.text,
  )}</div>`;
  wrap.appendChild(div);
  wrap.scrollTop = wrap.scrollHeight;
}

export function wireChat(onEnded) {
  document.getElementById('composer').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('composer-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    try {
      await api('/api/message', { token: store.token, text });
    } catch (err) {
      toast(err.message);
    }
  });

  document.getElementById('leave-btn').addEventListener('click', async () => {
    await api('/api/leave', { token: store.token }).catch(() => {});
    endedReason = 'You left the conversation.';
    onEnded('left');
  });

  document.getElementById('report-btn').addEventListener('click', async () => {
    if (!confirm('Report this conversation and end it? No personal data is collected.')) return;
    await api('/api/report', { token: store.token, reason: 'user-report' }).catch(() => {});
    endedReason = 'Thanks — the conversation was ended and an anonymous report was filed.';
    onEnded('reported');
  });
}

const REASONS = {
  left: 'You left the conversation.',
  // Shown to the OTHER party when someone reports — neutral, doesn't imply they
  // filed it (and doesn't reveal who did).
  reported: 'This conversation was ended.',
  // The other side ended it.
  'left-remote': 'The other person left.',
};

// A short post-conversation questionnaire — one quick tap each. Questions can be
// conditional via `when` (e.g. don't ask if their thinking shifted when they
// didn't even understand the other side better).
const QUESTIONS = [
  {
    id: 'understood',
    label: 'Do you understand the other side better than before?',
    options: [
      { l: 'Yes', v: 'yes' },
      { l: 'Not really', v: 'no' },
    ],
  },
  {
    id: 'changed',
    label: 'Did it shift your thinking at all?',
    when: (a) => a.understood === 'yes',
    options: [
      { l: 'Yes, a bit', v: 'yes' },
      { l: 'No', v: 'no' },
    ],
  },
  {
    id: 'commonGround',
    label: 'Did you find any common ground?',
    options: [
      { l: 'Yes', v: 'yes' },
      { l: 'A little', v: 'some' },
      { l: 'No', v: 'no' },
    ],
  },
  {
    id: 'respectful',
    label: 'Was the conversation respectful and in good faith?',
    options: [
      { l: 'Yes', v: 'yes' },
      { l: 'Mostly', v: 'mostly' },
      { l: 'Not really', v: 'no' },
    ],
  },
  {
    id: 'again',
    label: 'Would you do this again?',
    options: [
      { l: 'Definitely', v: 'yes' },
      { l: 'Maybe', v: 'maybe' },
      { l: 'No', v: 'no' },
    ],
  },
];

let answers = {};

function applicableQuestions() {
  return QUESTIONS.filter((q) => !q.when || q.when(answers));
}

function renderQuestion() {
  const list = applicableQuestions();
  const next = list.find((q) => !(q.id in answers));
  const answered = list.filter((q) => q.id in answers).length;
  const fill = document.getElementById('q-progress-fill');

  if (!next) {
    fill.style.width = '100%';
    finishFeedback();
    return;
  }
  fill.style.width = Math.round((answered / list.length) * 100) + '%';

  const opts = next.options
    .map(
      (o) =>
        `<button class="btn ghost choice" type="button" data-val="${o.v}">${escapeHtml(o.l)}</button>`,
    )
    .join('');
  const el = document.getElementById('q-current');
  el.innerHTML = `<p class="qlabel">${escapeHtml(next.label)}</p><div class="choice-group">${opts}</div>`;
  el.querySelectorAll('.choice').forEach((btn) => {
    btn.addEventListener('click', () => {
      el.querySelectorAll('.choice').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      answers[next.id] = btn.dataset.val;
      setTimeout(renderQuestion, 220); // brief confirm, then advance
    });
  });
}

async function finishFeedback() {
  await api('/api/feedback', {
    token: store.token,
    topic: store.room?.topic?.id,
    // Exclude bot-practice from the impact stats.
    withBot: !!store.room?.participants?.some((p) => p.isBot),
    understoodBetter: answers.understood === 'yes',
    changedMind: answers.changed === 'yes',
    commonGround: answers.commonGround,
    respectful: answers.respectful,
    again: answers.again,
  }).catch(() => {});
  document.getElementById('feedback-form').classList.add('hidden');
  document.getElementById('feedback-thanks').classList.remove('hidden');
}

export function showFeedback(reason) {
  hideToast(); // don't let a stale "Matched with…" toast linger into this view
  const text = endedReason || REASONS[reason] || REASONS['left-remote'] || '';
  document.getElementById('feedback-reason').textContent = text;
  // Reset and start the questionnaire fresh.
  answers = {};
  document.getElementById('feedback-form').classList.remove('hidden');
  document.getElementById('feedback-thanks').classList.add('hidden');
  renderQuestion();
  showView('view-feedback');
}

export function wireFeedback(onAgain) {
  document.getElementById('again-btn').addEventListener('click', onAgain);
}
