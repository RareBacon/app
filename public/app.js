import { on, showView } from './api.js';
import { renderOnboarding, wireOnboarding } from './onboarding.js';
import { renderQueue, leaveQueueView } from './queue.js';
import {
  enterChat,
  appendMessage,
  wireChat,
  showFeedback,
  wireFeedback,
} from './chat.js';

// Landing -> onboarding.
document.getElementById('start-btn').addEventListener('click', async () => {
  await renderOnboarding();
  showView('view-onboarding');
});

// Onboarding -> queue.
wireOnboarding(() => {
  renderQueue();
  showView('view-queue');
});

// Chat interactions.
wireChat((reason) => {
  showFeedback(reason);
});

// Feedback -> back to queue for another conversation.
wireFeedback(() => {
  renderQueue();
  leaveQueueView();
  showView('view-queue');
});

// ---- Server-sent events ----
on('matched', (data) => {
  enterChat(data);
});

on('message', (m) => {
  appendMessage(m);
});

on('ended', (data) => {
  // If we didn't trigger it ourselves, the feedback view shows the right reason.
  const reason = data.reason === 'left' ? 'left-remote' : data.reason;
  showFeedback(reason);
});

// Start on the landing view.
showView('view-landing');
