// BRIDGE — zero-dependency Node server.
// Real-time via SSE (server -> client) + fetch POST (client -> server).
//
// Privacy note: we do NOT collect or log client IP addresses. Session state is
// in-memory and ephemeral. The only thing written to disk is an anonymized
// aggregate metrics file: { type, topic?, reason?, understoodBetter?, ts } — no
// identity, no message content.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { appendFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createSession,
  getSession,
  dropSession,
  getRoom,
  rooms,
  broadcastRoom,
  sendEvent,
} from './src/state.js';
import { joinQueue, leaveQueue, cancelBotFallback } from './src/matchmaker.js';
import { TOPICS, getTopic } from './src/topics.js';
import { assessMessage } from './src/moderation.js';
import {
  openingMessages,
  reactToMessage,
  idlePrompt,
  maybeLlmNudge,
} from './src/mediator.js';
import { botReply } from './src/bot.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC_DIR = join(__dirname, 'public');
const DATA_DIR = join(__dirname, 'data');
const PORT = Number(process.env.PORT || 3000);
const IDLE_PROMPT_MS = Number(process.env.BRIDGE_IDLE_MS || 45000);
const BOT_REPLY_DELAY_MS = Number(process.env.BRIDGE_BOT_REPLY_MS || 2500);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// ---------------------------------------------------------------------------
// Anonymized metrics (no PII).
// ---------------------------------------------------------------------------
async function recordMetric(entry) {
  try {
    await mkdir(DATA_DIR, { recursive: true });
    await appendFile(
      join(DATA_DIR, 'metrics.jsonl'),
      JSON.stringify({ ...entry, ts: Date.now() }) + '\n',
    );
  } catch {
    // Metrics are best-effort; never block the request on them.
  }
}

// ---------------------------------------------------------------------------
// Conversation orchestration.
// ---------------------------------------------------------------------------
function postRoomMessage(room, message) {
  const full = { id: cryptoId(), ...message };
  room.messages.push(full);
  room.lastActivity = Date.now();
  broadcastRoom(room, 'message', full);
  armIdleTimer(room);
  return full;
}

function cryptoId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function armIdleTimer(room) {
  if (room.idleTimer) clearTimeout(room.idleTimer);
  if (room.closed) return;
  room.idleTimer = setTimeout(() => {
    if (room.closed) return;
    postRoomMessage(room, idlePrompt());
  }, IDLE_PROMPT_MS);
}

function startRoom(room) {
  for (const m of openingMessages(room)) postRoomMessage(room, m);
  // If the opponent is a bot, the human is invited to go first, so we wait.
}

function botParticipant(room) {
  return room.participants.find((p) => p.isBot);
}

function maybeBotReply(room) {
  const bot = botParticipant(room);
  if (!bot || room.closed) return;
  bot._turn = bot._turn || 0;
  const text = botReply(bot._turn);
  bot._turn += 1;
  setTimeout(() => {
    if (room.closed) return;
    postRoomMessage(room, {
      from: bot.sessionId,
      name: bot.nickname,
      text,
      kind: 'user',
      ts: Date.now(),
    });
  }, BOT_REPLY_DELAY_MS);
}

function endRoom(room, reason) {
  if (room.closed) return;
  room.closed = true;
  if (room.idleTimer) clearTimeout(room.idleTimer);
  broadcastRoom(room, 'ended', { reason });
  for (const p of room.participants) {
    if (p.isBot) continue;
    const s = getSession(p.sessionId);
    if (s) s.roomId = null;
  }
  rooms.delete(room.id);
}

// ---------------------------------------------------------------------------
// HTTP plumbing.
// ---------------------------------------------------------------------------
function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 64 * 1024) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      data += chunk;
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error('invalid json'));
      }
    });
    req.on('error', reject);
  });
}

async function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  // Prevent path traversal.
  const safe = normalize(rel).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(PUBLIC_DIR, safe);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { 'content-type': MIME[extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
  }
}

// ---------------------------------------------------------------------------
// API handlers.
// ---------------------------------------------------------------------------
async function handleApi(req, res, url) {
  const { pathname } = url;

  if (req.method === 'GET' && pathname === '/api/topics') {
    return sendJson(res, 200, { topics: TOPICS });
  }

  if (req.method === 'POST' && pathname === '/api/session') {
    const body = await readBody(req);
    const session = createSession({
      nickname: body.nickname,
      stances: sanitizeStances(body.stances),
      reasonings: sanitizeReasonings(body.reasonings),
    });
    return sendJson(res, 200, { token: session.id, nickname: session.nickname });
  }

  if (req.method === 'GET' && pathname === '/api/events') {
    return handleSse(req, res, url);
  }

  if (req.method === 'POST' && pathname === '/api/queue') {
    const body = await readBody(req);
    const session = getSession(body.token);
    if (!session) return sendJson(res, 401, { error: 'unknown session' });
    if (session.roomId) return sendJson(res, 409, { error: 'already in a conversation' });
    const topic = getTopic(body.topic);
    if (!topic) return sendJson(res, 400, { error: 'unknown topic' });
    const result = joinQueue(session, body.topic, (room) => {
      onRoomMatched(room);
    });
    if (result.error) return sendJson(res, 400, { error: result.error });
    return sendJson(res, 200, result.matched ? { matched: true } : { waiting: true });
  }

  if (req.method === 'POST' && pathname === '/api/cancel-queue') {
    const body = await readBody(req);
    const session = getSession(body.token);
    if (session) leaveQueue(session);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'POST' && pathname === '/api/message') {
    const body = await readBody(req);
    const session = getSession(body.token);
    if (!session || !session.roomId) return sendJson(res, 401, { error: 'not in a room' });
    const room = getRoom(session.roomId);
    if (!room || room.closed) return sendJson(res, 410, { error: 'room closed' });
    const text = String(body.text || '').slice(0, 2000).trim();
    if (!text) return sendJson(res, 400, { error: 'empty message' });

    const me = room.participants.find((p) => p.sessionId === session.id);
    const assessment = assessMessage(text);
    room.humanMessageCount += 1;
    postRoomMessage(room, {
      from: session.id,
      name: me?.nickname || session.nickname,
      text,
      kind: 'user',
      ts: Date.now(),
    });

    for (const m of reactToMessage(room, assessment)) postRoomMessage(room, m);

    // Optional LLM nudge (only if configured and nothing more pressing fired).
    if (!assessment.hostile && process.env.ANTHROPIC_API_KEY) {
      maybeLlmNudge(room).then((m) => {
        if (m && !room.closed) postRoomMessage(room, m);
      });
    }

    maybeBotReply(room);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'POST' && pathname === '/api/leave') {
    const body = await readBody(req);
    const session = getSession(body.token);
    if (session && session.roomId) {
      const room = getRoom(session.roomId);
      if (room) endRoom(room, 'left');
    }
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'POST' && pathname === '/api/report') {
    const body = await readBody(req);
    const session = getSession(body.token);
    const reason = String(body.reason || 'unspecified').slice(0, 100);
    if (session && session.roomId) {
      const room = getRoom(session.roomId);
      if (room) {
        // Privacy-preserving: avoid re-matching these two for the rest of the
        // session lifetime, but store NO identity — only an anonymized counter.
        for (const a of room.participants) {
          for (const b of room.participants) {
            if (a.sessionId !== b.sessionId) {
              const sa = getSession(a.sessionId);
              if (sa) sa.avoid.add(b.sessionId);
            }
          }
        }
        await recordMetric({ type: 'report', topic: room.topicId, reason });
        endRoom(room, 'reported');
      }
    }
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'POST' && pathname === '/api/feedback') {
    const body = await readBody(req);
    await recordMetric({
      type: 'feedback',
      topic: String(body.topic || '').slice(0, 64),
      understoodBetter: body.understoodBetter === true,
      changedMind: body.changedMind === true,
    });
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 404, { error: 'not found' });
}

function handleSse(req, res, url) {
  const token = url.searchParams.get('token');
  const session = getSession(token);
  if (!session) {
    res.writeHead(401, { 'content-type': 'text/plain' });
    return res.end('unknown session');
  }
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });
  res.write('retry: 3000\n\n');
  session.sse = res;
  sendEvent(session.id, 'ready', { nickname: session.nickname });

  const keepAlive = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      clearInterval(keepAlive);
    }
  }, 20000);

  req.on('close', () => {
    clearInterval(keepAlive);
    if (session.sse === res) session.sse = null;
    // If they were waiting in a queue, pull them out.
    leaveQueueOnDisconnect(session);
  });
}

function leaveQueueOnDisconnect(session) {
  if (session.queuedTopic) {
    leaveQueue(session);
  }
}

function onRoomMatched(room) {
  const topic = getTopic(room.topicId);
  for (const p of room.participants) {
    if (p.isBot) continue;
    sendEvent(p.sessionId, 'matched', {
      roomId: room.id,
      topic: { id: topic.id, title: topic.title, statement: topic.statement },
      you: { nickname: p.nickname, stance: p.stance },
      participants: room.participants.map((x) => ({
        nickname: x.nickname,
        stance: x.stance,
        isBot: x.isBot,
      })),
    });
  }
  // Slight delay so clients can switch to the chat view before opening lines land.
  setTimeout(() => startRoom(room), 400);
}

// ---------------------------------------------------------------------------
// Input sanitation.
// ---------------------------------------------------------------------------
function sanitizeStances(stances) {
  const out = {};
  if (stances && typeof stances === 'object') {
    for (const t of TOPICS) {
      const v = Number(stances[t.id]);
      if (Number.isFinite(v)) out[t.id] = Math.max(-3, Math.min(3, Math.round(v)));
    }
  }
  return out;
}

function sanitizeReasonings(reasonings) {
  const out = {};
  if (reasonings && typeof reasonings === 'object') {
    for (const t of TOPICS) {
      if (typeof reasonings[t.id] === 'string') {
        out[t.id] = reasonings[t.id].slice(0, 600);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Server.
// ---------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
    } else {
      await serveStatic(req, res, url.pathname);
    }
  } catch (err) {
    if (!res.headersSent) sendJson(res, 400, { error: String(err.message || err) });
    else res.end();
  }
});

server.listen(PORT, () => {
  console.log(`BRIDGE listening on http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('Mediator: rule-based (set ANTHROPIC_API_KEY to enable LLM nudges).');
  } else {
    console.log('Mediator: LLM-assisted (ANTHROPIC_API_KEY detected).');
  }
});

export { server };
