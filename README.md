# ⇌ BRIDGE — talk to someone who disagrees

An anonymous, mediated chat that pairs you with a stranger who holds the **opposite
view** on a charged topic. You both share your reasoning up front, a mediator keeps
things constructive, and the goal is never to *win* — it's to understand why a
reasonable person could see it differently.

Built to nudge against political polarization. Zero dependencies, runs locally with
just Node.

## Why this exists

Most online political talk happens in algorithmic echo chambers that reward dunking,
not understanding. BRIDGE flips the incentives: you're matched *because* you
disagree, your opponent's actual reasoning is the first thing you read, and a
mediator keeps reminding both of you to ask questions and steel-man rather than
attack.

## Run it

```bash
npm start            # → http://localhost:3000
```

Then open it in **two browser windows** (use one normal + one incognito). In each,
pick opposing stances on the same topic and queue — you'll be matched and can chat in
real time. Solo? Wait a few seconds in a queue and a good-faith **practice partner
(bot)** steps in so you can try the whole flow alone.

```bash
npm run smoke        # end-to-end test of matchmaking, chat, moderation, fallback
```

## How it works

- **No build step, no dependencies.** Pure Node built-ins.
- **Real-time** via Server-Sent Events (server → client) + `fetch` POST (client →
  server). Reliable and dependency-free.
- **Matchmaking** (`src/matchmaker.js`): per-topic queues; pairs you with the waiting
  person whose stance is furthest in the *opposite* direction. No opposite human in
  ~12s → scripted bot opponent.
- **Mediator** (`src/mediator.js`): posts ground rules, seeds both people's stated
  reasoning, fires de-escalation nudges when a message reads as hostile
  (`src/moderation.js`), prompts on long silences, and asks a reflective closing
  question after a healthy back-and-forth.

### Optional: LLM mediator

The mediator is rule-based by default. If you set an API key, it will *additionally*
generate context-aware nudges:

```bash
ANTHROPIC_API_KEY=sk-ant-... npm start
# optional: BRIDGE_MEDIATOR_MODEL=claude-sonnet-4-6
```

It never takes a side — the system prompt constrains it to short, neutral nudges
toward curiosity and de-escalation.

## Privacy & safety

This is a politics app, so privacy is a feature, not an afterthought.

- **Anonymous.** Nickname only. No accounts, no email, no login.
- **No IP collection or logging.** We deliberately don't store client IPs. For a
  high-volatility space, an IP log is a doxxing/subpoena liability, not a safety
  feature — so we don't keep one. (See *Abuse throttling* below for how rate-limiting
  could work *without* storing IPs, if ever needed.)
- **Ephemeral.** All session, queue, and room state lives in memory and is gone when
  the process restarts. Messages are never written to disk.
- **Reporting without accounts.** A report immediately **ends the conversation**,
  **prevents re-matching** those two sessions for the rest of their lifetime, and
  records only an **anonymized aggregate** — `{ type, topic, reason, ts }` in
  `data/metrics.jsonl`. No nickname, no identity, no message content.
- **Feedback** is likewise anonymized aggregate only (`understoodBetter`,
  `changedMind`, topic).
- **Light-touch moderation.** We flag hostility to *nudge*, not to censor — message
  text is never altered or deleted.

### Abuse throttling (design note, not yet implemented)

If repeat-offender rate-limiting is ever needed, the privacy-preserving pattern is:
compute `HMAC-SHA256(ip, secret)` where `secret` is generated fresh at process start
and **never persisted**, keep only that hash in memory with a short TTL, and never
log the raw IP. You can then throttle a misbehaving hash without being able to
reverse it to an IP — and after a restart even the hashes are meaningless. The OS
socket layer transiently sees the IP regardless, so the real protections are: don't
persist it, disable IP access logs, and (for a real deployment) run behind a proxy
that strips it.

## Project layout

```
server.js              HTTP server, SSE, routing, conversation orchestration
src/topics.js          Curated debate topics + stance helpers
src/state.js           In-memory sessions / queues / rooms
src/matchmaker.js      Opposite-stance pairing + bot fallback
src/mediator.js        Rule-based mediator (+ optional LLM nudges)
src/moderation.js      Heuristic hostility detection
src/bot.js             Scripted good-faith practice opponent
public/                Vanilla-JS single-page client
scripts/smoke.js       Zero-dependency end-to-end test
```

## Limitations (MVP)

- Single process, in-memory — not horizontally scalable as-is.
- Text only; no voice/video.
- Heuristic moderation is intentionally simple.
- No deployment config; runs locally.

MIT licensed.
