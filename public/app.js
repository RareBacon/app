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
import { renderImpact } from './impact.js';

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

// Impact dashboard — reachable from the landing and the post-chat thank-you.
async function openImpact() {
  await renderImpact();
  showView('view-impact');
}
document.getElementById('landing-impact').addEventListener('click', openImpact);
document.getElementById('impact-link').addEventListener('click', openImpact);
document.getElementById('impact-back').addEventListener('click', () => showView('view-landing'));

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
const SUN_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>';
const MOON_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>';
function effectiveTheme() {
  const forced = document.documentElement.dataset.theme;
  if (forced === 'dark' || forced === 'light') return forced;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function refreshThemeIcon() {
  const dark = effectiveTheme() === 'dark';
  // Show the icon for the theme you'd switch TO.
  themeToggle.innerHTML = dark ? SUN_ICON : MOON_ICON;
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
