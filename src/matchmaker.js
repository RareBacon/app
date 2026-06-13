// Matchmaking: pair a queued user with a waiting user who holds the OPPOSITE view
// on the same topic. If no opposite human arrives before a timeout, fall back to a
// scripted good-faith bot opponent so the experience still works (and is testable).

import {
  sessions,
  queues,
  enqueue,
  removeFromQueue,
  createRoom,
  sendEvent,
} from './state.js';
import { areOpposite, getTopic, stanceLabel } from './topics.js';
import { makeBotParticipant } from './bot.js';

export const BOT_FALLBACK_MS = Number(process.env.BRIDGE_BOT_TIMEOUT_MS || 12000);

// Pending bot-fallback timers keyed by sessionId.
const botTimers = new Map();

// Attempt to join `topicId`. Either matches immediately with an opposite waiting
// human, or queues and arms a bot fallback. Returns { matched: boolean, room? }.
export function joinQueue(session, topicId, onMatched) {
  const myStance = Number(session.stances[topicId] ?? 0);
  if (myStance === 0) {
    return { error: 'You need a non-neutral stance on this topic to be matched.' };
  }

  const waiting = queues.get(topicId) || [];
  // Find the waiting human with the largest opposing gap.
  let bestId = null;
  let bestGap = -1;
  for (const otherId of waiting) {
    const other = sessions.get(otherId);
    if (!other || other.id === session.id || other.roomId) continue;
    if (session.avoid.has(other.id) || other.avoid.has(session.id)) continue;
    const otherStance = Number(other.stances[topicId] ?? 0);
    if (areOpposite(myStance, otherStance)) {
      const gap = Math.abs(myStance - otherStance);
      if (gap > bestGap) {
        bestGap = gap;
        bestId = otherId;
      }
    }
  }

  if (bestId) {
    const other = sessions.get(bestId);
    removeFromQueue(topicId, bestId);
    other.queuedTopic = null;
    cancelBotFallback(other.id);
    const room = openRoom(topicId, [
      participantFromSession(session, topicId),
      participantFromSession(other, topicId),
    ]);
    session.roomId = room.id;
    other.roomId = room.id;
    onMatched(room);
    return { matched: true, room };
  }

  // No opposite human yet — wait in the queue, arm bot fallback.
  enqueue(topicId, session.id);
  session.queuedTopic = topicId;
  const timer = setTimeout(() => {
    botTimers.delete(session.id);
    const s = sessions.get(session.id);
    if (!s || s.roomId || s.queuedTopic !== topicId) return;
    removeFromQueue(topicId, session.id);
    s.queuedTopic = null;
    const bot = makeBotParticipant(myStance, topicId);
    const room = openRoom(topicId, [participantFromSession(s, topicId), bot]);
    s.roomId = room.id;
    onMatched(room);
  }, BOT_FALLBACK_MS);
  botTimers.set(session.id, timer);
  return { matched: false, waiting: true };
}

export function cancelBotFallback(sessionId) {
  const t = botTimers.get(sessionId);
  if (t) {
    clearTimeout(t);
    botTimers.delete(sessionId);
  }
}

export function leaveQueue(session) {
  if (session.queuedTopic) {
    removeFromQueue(session.queuedTopic, session.id);
    session.queuedTopic = null;
  }
  cancelBotFallback(session.id);
}

function participantFromSession(session, topicId) {
  return {
    sessionId: session.id,
    nickname: session.nickname,
    stance: Number(session.stances[topicId] ?? 0),
    reasoning: session.reasonings[topicId] || '',
    isBot: false,
  };
}

function openRoom(topicId, participants) {
  return createRoom({ topicId, participants });
}

// Re-export helpers some callers want alongside matchmaking.
export { getTopic, stanceLabel, sendEvent };
