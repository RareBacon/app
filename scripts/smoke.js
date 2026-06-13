// End-to-end smoke test with zero dependencies.
// Boots the server on a test port, drives two opposing sessions through
// matchmaking + chat, and checks the key behaviours. Exits non-zero on failure.

import http from 'node:http';

const PORT = 4123;
process.env.PORT = String(PORT);
process.env.BRIDGE_BOT_TIMEOUT_MS = '800'; // fast bot fallback for the solo test
process.env.BRIDGE_BOT_REPLY_MS = '100';
process.env.BRIDGE_IDLE_MS = '999999'; // don't fire idle prompts mid-test

const base = `http://localhost:${PORT}`;
let failures = 0;

function check(name, cond) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    console.error(`  ✗ ${name}`);
    failures += 1;
  }
}

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body || {});
    const req = http.request(
      base + path,
      { method: 'POST', headers: { 'content-type': 'application/json' } },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => resolve({ status: res.statusCode, json: safeJson(buf) }));
      },
    );
    req.on('error', reject);
    req.end(data);
  });
}

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

// Minimal SSE client: collects events into an array and lets us await one.
function openStream(token) {
  const events = [];
  const waiters = [];
  const req = http.get(`${base}/api/events?token=${token}`, (res) => {
    let buf = '';
    res.on('data', (chunk) => {
      buf += chunk;
      let idx;
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const raw = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const ev = parseEvent(raw);
        if (ev) {
          events.push(ev);
          const w = waiters.shift();
          if (w) w(ev);
        }
      }
    });
  });
  function parseEvent(raw) {
    let type = 'message';
    let data = '';
    for (const line of raw.split('\n')) {
      if (line.startsWith('event:')) type = line.slice(6).trim();
      else if (line.startsWith('data:')) data += line.slice(5).trim();
    }
    if (!data && type === 'message') return null;
    return { type, data: safeJson(data) };
  }
  return {
    events,
    waitFor(type, timeout = 3000) {
      const existing = events.find((e) => e.type === type);
      if (existing) return Promise.resolve(existing);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`timeout waiting for ${type}`)), timeout);
        const check = (ev) => {
          if (ev.type === type) {
            clearTimeout(timer);
            resolve(ev);
          } else {
            waiters.push(check);
          }
        };
        waiters.push(check);
      });
    },
    close: () => req.destroy(),
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await import('../server.js');
  await sleep(300);

  console.log('1) Two opposing humans get matched and can talk');
  const a = (await post('/api/session', {
    nickname: 'Alpha',
    stances: { 'gun-control': 3 },
    reasonings: { 'gun-control': 'Fewer guns, fewer accidents.' },
  })).json;
  const b = (await post('/api/session', {
    nickname: 'Beta',
    stances: { 'gun-control': -3 },
    reasonings: { 'gun-control': 'Self-defense is a right.' },
  })).json;
  check('session A created', !!a.token);
  check('session B created', !!b.token);

  const sa = openStream(a.token);
  const sb = openStream(b.token);
  await Promise.all([sa.waitFor('ready'), sb.waitFor('ready')]);

  await post('/api/queue', { token: a.token, topic: 'gun-control' });
  await post('/api/queue', { token: b.token, topic: 'gun-control' });

  const matchA = await sa.waitFor('matched');
  const matchB = await sb.waitFor('matched');
  check('A matched', !!matchA.data.roomId);
  check('B matched into same room', matchA.data.roomId === matchB.data.roomId);

  // Opening mediator messages should arrive (rules + seeded stances).
  await sleep(700);
  const mediatorMsgs = sa.events.filter((e) => e.type === 'message' && e.data.from === 'mediator');
  check('mediator posted opening messages', mediatorMsgs.length >= 3);
  const seeded = mediatorMsgs.some((m) => m.data.text.includes('Self-defense is a right'));
  check('opponent reasoning was seeded into chat', seeded);

  await post('/api/message', { token: a.token, text: 'What changed your mind before?' });
  const gotOnB = await sb.waitFor('message');
  check('A\'s message reached B in real time', !!gotOnB);

  console.log('2) Hostility triggers a de-escalation nudge');
  const before = sa.events.length;
  await post('/api/message', { token: a.token, text: 'you are an idiot' });
  await sleep(300);
  const nudge = sa.events
    .slice(before)
    .find((e) => e.type === 'message' && e.data.kind === 'nudge');
  check('mediator posted a de-escalation nudge', !!nudge);

  sa.close();
  sb.close();

  console.log('3) Solo user falls back to a bot opponent');
  const c = (await post('/api/session', {
    nickname: 'Solo',
    stances: { immigration: 2 },
    reasonings: { immigration: 'Immigrants strengthen the economy.' },
  })).json;
  const sc = openStream(c.token);
  await sc.waitFor('ready');
  await post('/api/queue', { token: c.token, topic: 'immigration' });
  const matchC = await sc.waitFor('matched', 4000);
  const botPresent = matchC.data.participants.some((p) => p.isBot);
  check('solo user matched with a bot after timeout', botPresent);

  console.log('4) Report and feedback endpoints respond');
  const rep = await post('/api/report', { token: c.token, reason: 'test' });
  check('report ok', rep.status === 200 && rep.json.ok);
  const fb = await post('/api/feedback', {
    token: c.token,
    topic: 'immigration',
    understoodBetter: true,
  });
  check('feedback ok', fb.status === 200 && fb.json.ok);
  sc.close();

  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('smoke test crashed:', e);
  process.exit(1);
});
