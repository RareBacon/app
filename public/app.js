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

// ---- Theme toggle ----
// Default behavior follows the OS (no data-theme attribute). The toggle sets an
// explicit attribute that overrides the OS preference and is remembered.
const themeToggle = document.getElementById('theme-toggle');
function effectiveTheme() {
  const forced = document.documentElement.dataset.theme;
  if (forced === 'dark' || forced === 'light') return forced;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function refreshThemeIcon() {
  const dark = effectiveTheme() === 'dark';
  themeToggle.textContent = dark ? '☀️' : '🌙';
  themeToggle.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
}
themeToggle.addEventListener('click', () => {
  const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem('bridge-theme', next);
  } catch (e) {}
  refreshThemeIcon();
});
// Keep the icon correct if the OS theme changes while on "auto".
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', refreshThemeIcon);
refreshThemeIcon();

// Start on the landing view.
showView('view-landing');
