// A scripted "good-faith opponent" used as a fallback when no human is available
// in a queue. It is intentionally simple: it models a calm person on the opposite
// side who argues in good faith and asks questions. This keeps the full experience
// demoable and testable solo — it is NOT meant to be a convincing human.

import { getTopic, stanceLabel } from './topics.js';

const BOT_NICKNAMES = ['River', 'Sage', 'Quinn', 'Avery', 'Jordan'];

export function pickBotNickname() {
  return BOT_NICKNAMES[Math.floor(Math.random() * BOT_NICKNAMES.length)];
}

// Build a bot participant whose stance opposes the given human stance.
export function makeBotParticipant(humanStance, topicId) {
  const stance = Number(humanStance) > 0 ? -2 : 2;
  const topic = getTopic(topicId);
  return {
    sessionId: `bot:${topicId}`,
    nickname: pickBotNickname(),
    stance,
    reasoning: botReasoning(topic, stance),
    isBot: true,
  };
}

function botReasoning(topic, stance) {
  const side = stance > 0 ? 'agree' : 'disagree';
  return (
    `I ${side} mostly because of how this plays out for ordinary people I know. ` +
    `I've changed my mind before when I heard a story that didn't fit my assumptions.`
  );
}

const OPENERS = [
  'Thanks for doing this. Can I ask what first made you land on your view?',
  'I appreciate you being here. What would have to be true for you to reconsider?',
  'Before we dig in — what part of my side do you find most frustrating?',
];

const PROBES = [
  'That makes sense. How do you weigh that against the people it affects differently?',
  'I hadn\'t framed it that way. What evidence convinced you most?',
  'Fair point. Where do you think my side gets it right, even a little?',
  'I think we actually agree on the goal and differ on the method — does that sound right?',
];

const ACKS = [
  'Okay, I genuinely hadn\'t considered that angle.',
  'That\'s a more reasonable version than I usually hear. Thank you.',
  'I still disagree, but I understand the why now.',
];

// Generate the bot's next line given how many times it has spoken.
export function botReply(turnIndex) {
  if (turnIndex === 0) return OPENERS[Math.floor(Math.random() * OPENERS.length)];
  if (turnIndex % 3 === 0) return ACKS[Math.floor(Math.random() * ACKS.length)];
  return PROBES[Math.floor(Math.random() * PROBES.length)];
}

export { stanceLabel };
