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

function resetFeedbackForm() {
  document.querySelectorAll('.choice').forEach((b) => b.classList.remove('selected'));
  document.getElementById('q-changed').classList.add('hidden');
  document.getElementById('feedback-form').classList.remove('hidden');
  document.getElementById('feedback-thanks').classList.add('hidden');
}

export function showFeedback(reason) {
  hideToast(); // don't let a stale "Matched with…" toast linger into this view
  const text = endedReason || REASONS[reason] || REASONS['left-remote'] || '';
  document.getElementById('feedback-reason').textContent = text;
  resetFeedbackForm();
  showView('view-feedback');
}

async function submitFeedback(understoodBetter, changedMind) {
  await api('/api/feedback', {
    token: store.token,
    topic: store.room?.topic?.id,
    understoodBetter,
    changedMind,
    // Exclude bot-practice from the impact stats.
    withBot: !!store.room?.participants?.some((p) => p.isBot),
  }).catch(() => {});
  document.getElementById('feedback-form').classList.add('hidden');
  document.getElementById('feedback-thanks').classList.remove('hidden');
}

export function wireFeedback(onAgain) {
  // Q1: understood the other side better?
  document.querySelectorAll('#q-understood .choice').forEach((btn) => {
    btn.addEventListener('click', () => {
      const understood = btn.dataset.val === 'true';
      btn.parentElement.querySelectorAll('.choice').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      if (understood) {
        // Only then is "did it shift your thinking?" worth asking.
        document.getElementById('q-changed').classList.remove('hidden');
      } else {
        // No need to ask — if they didn't understand better, it didn't shift.
        submitFeedback(false, false);
      }
    });
  });

  // Q2: did it shift your thinking? (only shown after a "Yes" above)
  document.querySelectorAll('#q-changed .choice').forEach((btn) => {
    btn.addEventListener('click', () => {
      btn.parentElement.querySelectorAll('.choice').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      submitFeedback(true, btn.dataset.val === 'true');
    });
  });

  document.getElementById('again-btn').addEventListener('click', onAgain);
}
