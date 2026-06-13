// The mediator bot. Intentionally minimal and fully rule-based: it speaks only
// to (1) set one ground rule and introduce each side's opinion when a room opens,
// and (2) de-escalate when the moderation layer flags a hostile message. It stays
// out of the way otherwise — no prompts, summaries, or idle nudges.

import { stanceLabel } from './topics.js';

const MEDIATOR_NAME = 'Mediator';

function msg(text, kind = 'mediator') {
  return { from: 'mediator', name: MEDIATOR_NAME, text, kind, ts: Date.now() };
}

// One ground rule + a one-line introduction of each side's stance/reasoning,
// posted when a room opens.
export function openingMessages(room) {
  const out = [];
  out.push(
    msg(
      `Ground rules: assume good faith, attack ideas not people — you're here to understand, not to win.`,
      'rules',
    ),
  );
  for (const p of room.participants) {
    const label = stanceLabel(p.stance);
    const reason = (p.reasoning || '').trim();
    const reasonText = reason ? ` Their reasoning: "${reason}"` : '';
    out.push(msg(`${p.nickname} — ${label}.${reasonText}`, 'seed'));
  }
  return out;
}

const DEESCALATION = {
  'name-calling':
    `Let's keep it about the argument, not the person. Try rephrasing that as a ` +
    `question about their reasoning.`,
  'personal-attack':
    `That read as a personal jab. Remember the goal is to understand — what ` +
    `specifically about their point do you disagree with?`,
  shouting:
    `Easy — no need to shout. What's the single strongest part of your point you ` +
    `want them to hear?`,
};

// React to a human message. Returns mediator messages to post — only fires to
// de-escalate when the moderation layer flags hostility, and is otherwise silent.
export function reactToMessage(assessment) {
  if (!assessment.hostile) return [];
  const reason = assessment.reasons[0];
  return [msg(DEESCALATION[reason] || DEESCALATION['personal-attack'], 'nudge')];
}
