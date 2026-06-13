// In-memory, ephemeral application state.
// Nothing here is persisted: when the process restarts, everything is gone.
// This is intentional for an anonymous, privacy-first MVP.

import { randomUUID } from 'node:crypto';

/** @typedef {{ id:string, nickname:string, stances:Record<string,number>,
 *   reasonings:Record<string,string>, createdAt:number,
 *   sse:import('node:http').ServerResponse|null, roomId:string|null,
 *   queuedTopic:string|null }} Session */

/** sessionId -> Session */
export const sessions = new Map();

/** topicId -> array of sessionIds waiting (FIFO) */
export const queues = new Map();

/** roomId -> Room */
export const rooms = new Map();

export function createSession({ nickname, stances, reasonings }) {
  const id = randomUUID();
  const session = {
    id,
    nickname: String(nickname || 'Anonymous').slice(0, 32) || 'Anonymous',
    stances: stances || {},
    reasonings: reasonings || {},
    createdAt: Date.now(),
    sse: null,
    roomId: null,
    queuedTopic: null,
    // Session ids this user should not be re-matched with (e.g. after a report).
    // In-memory only; never persisted and gone on restart.
    avoid: new Set(),
  };
  sessions.set(id, session);
  return session;
}

export function getSession(id) {
  return sessions.get(id);
}

export function dropSession(id) {
  const s = sessions.get(id);
  if (!s) return;
  if (s.queuedTopic) removeFromQueue(s.queuedTopic, id);
  sessions.delete(id);
}

export function enqueue(topicId, sessionId) {
  if (!queues.has(topicId)) queues.set(topicId, []);
  const q = queues.get(topicId);
  if (!q.includes(sessionId)) q.push(sessionId);
}

export function removeFromQueue(topicId, sessionId) {
  const q = queues.get(topicId);
  if (!q) return;
  const i = q.indexOf(sessionId);
  if (i !== -1) q.splice(i, 1);
}

export function createRoom({ topicId, participants }) {
  const id = randomUUID();
  const room = {
    id,
    topicId,
    participants, // array of { sessionId, nickname, stance, reasoning, isBot }
    messages: [], // { id, from, name, text, kind, ts }
    createdAt: Date.now(),
    humanMessageCount: 0,
    closingPrompted: false,
    lastActivity: Date.now(),
    idleTimer: null,
    closed: false,
  };
  rooms.set(id, room);
  return room;
}

export function getRoom(id) {
  return rooms.get(id);
}

// Send a single SSE event to one session if it has an open stream.
export function sendEvent(sessionId, type, data) {
  const s = sessions.get(sessionId);
  if (!s || !s.sse) return false;
  try {
    s.sse.write(`event: ${type}\n`);
    s.sse.write(`data: ${JSON.stringify(data)}\n\n`);
    return true;
  } catch {
    return false;
  }
}

// Broadcast to every human participant of a room.
export function broadcastRoom(room, type, data) {
  for (const p of room.participants) {
    if (!p.isBot) sendEvent(p.sessionId, type, data);
  }
}
