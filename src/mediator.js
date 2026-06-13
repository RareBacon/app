// The mediator bot. By default it is fully rule-based and works offline.
// If the operator sets ANTHROPIC_API_KEY, it can optionally generate
// context-aware nudges via the Anthropic API (see maybeLlmNudge).

import { getTopic, stanceLabel } from './topics.js';

const MEDIATOR_NAME = 'Mediator';

function msg(text, kind = 'mediator') {
  return { from: 'mediator', name: MEDIATOR_NAME, text, kind, ts: Date.now() };
}

// Ground rules + seeded stances/reasonings, posted when a room opens.
export function openingMessages(room) {
  const topic = getTopic(room.topicId);
  const out = [];
  out.push(
    msg(
      `Welcome. You two disagree about: "${topic?.statement ?? room.topicId}". ` +
        `The goal here isn't to win — it's to understand why a reasonable person ` +
        `could see this differently than you. Ground rules: assume good faith, ` +
        `attack ideas not people, and ask at least one genuine question.`,
      'rules',
    ),
  );
  for (const p of room.participants) {
    const label = stanceLabel(p.stance);
    const reason = (p.reasoning || '').trim();
    const reasonText = reason ? ` Their reasoning: "${reason}"` : '';
    out.push(msg(`${p.nickname} — ${label}.${reasonText}`, 'seed'));
  }
  out.push(
    msg(
      `To start: try restating the other person's view in your own words before ` +
        `responding. ${room.participants[0]?.nickname}, want to go first?`,
      'prompt',
    ),
  );
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

// React to a human message. Returns an array of mediator messages to post (often empty).
export function reactToMessage(room, assessment) {
  const out = [];

  if (assessment.hostile) {
    const reason = assessment.reasons[0];
    out.push(msg(DEESCALATION[reason] || DEESCALATION['personal-attack'], 'nudge'));
  }

  // After a healthy amount of back-and-forth, prompt a reflective close (once).
  if (!room.closingPrompted && room.humanMessageCount >= 8) {
    room.closingPrompted = true;
    out.push(
      msg(
        `You've covered a lot. Before you wrap up: name one thing you now ` +
          `understand about the other person's view that you didn't before. ` +
          `You don't have to agree — just show you heard them.`,
        'closing',
      ),
    );
  }

  return out;
}

// Posted when a conversation has been idle for a while.
export function idlePrompt() {
  return msg(
    `It's gone quiet. A good unsticking question: "What experience shaped how you ` +
      `see this?"`,
    'prompt',
  );
}

// Optional LLM nudge. Returns a mediator message or null. Only used if an API key
// is configured; otherwise the rule-based paths above carry the conversation.
export async function maybeLlmNudge(room) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const topic = getTopic(room.topicId);
    const transcript = room.messages
      .filter((m) => m.kind !== 'system')
      .slice(-12)
      .map((m) => `${m.name}: ${m.text}`)
      .join('\n');
    const body = {
      model: process.env.BRIDGE_MEDIATOR_MODEL || 'claude-sonnet-4-6',
      max_tokens: 150,
      system:
        'You are a calm, neutral mediator helping two strangers with opposing ' +
        'political views understand each other. Never take a side. Offer ONE short ' +
        'nudge (max 2 sentences) that promotes curiosity, steel-manning, or ' +
        'de-escalation. Do not summarize; just nudge.',
      messages: [
        {
          role: 'user',
          content: `Topic: ${topic?.statement}\n\nRecent transcript:\n${transcript}\n\nGive one short mediator nudge.`,
        },
      ],
    };
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.content?.[0]?.text?.trim();
    return text ? msg(text, 'nudge') : null;
  } catch {
    return null;
  }
}
