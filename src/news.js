// Recent-headlines lookup, shown while a user waits to be matched. Pulls a
// per-topic Google News RSS search feed (no API key required), parses out a few
// headlines + their article links, and caches per topic so we don't hammer the
// feed on every short wait. Fully degradable: if the network is blocked or the
// fetch fails, callers get an empty list and the UI simply shows nothing.

import { getTopic } from './topics.js';

const TTL_MS = Number(process.env.BRIDGE_NEWS_TTL_MS || 600000); // 10 min
const FETCH_TIMEOUT_MS = Number(process.env.BRIDGE_NEWS_TIMEOUT_MS || 4000);
const LIMIT = 5;

// Search queries tuned per topic (fall back to the topic title otherwise).
const NEWS_QUERIES = {
  'gun-control': 'gun control legislation',
  immigration: 'immigration policy',
  'climate-policy': 'climate policy emissions regulation',
  abortion: 'abortion law',
  taxes: 'taxes on wealthy',
  'free-speech': 'social media content moderation',
  'death-penalty': 'death penalty',
  'universal-healthcare': 'universal healthcare policy',
};

// Curated, credible outlets tagged by rough political lean. Matching is a
// case-insensitive substring test against the RSS <source> name. Classifications
// are approximate and intentionally tunable — the goal is a credible, spectrum-
// spanning mix, not a verdict on any outlet. Substrings are chosen to be
// distinctive (e.g. 'associated press', not a bare 'ap') to avoid false matches.
const SOURCES = [
  // left / center-left
  { match: 'new york times', lean: 'left' },
  { match: 'nytimes', lean: 'left' },
  { match: 'washington post', lean: 'left' },
  { match: 'cnn', lean: 'left' },
  { match: 'msnbc', lean: 'left' },
  { match: 'npr', lean: 'left' },
  { match: 'the guardian', lean: 'left' },
  { match: 'vox', lean: 'left' },
  { match: 'the atlantic', lean: 'left' },
  { match: 'politico', lean: 'left' },
  { match: 'los angeles times', lean: 'left' },
  { match: 'the new yorker', lean: 'left' },
  // center / wire / public
  { match: 'reuters', lean: 'center' },
  { match: 'associated press', lean: 'center' },
  { match: 'ap news', lean: 'center' },
  { match: 'bbc', lean: 'center' },
  { match: 'axios', lean: 'center' },
  { match: 'the hill', lean: 'center' },
  { match: 'bloomberg', lean: 'center' },
  { match: 'usa today', lean: 'center' },
  { match: 'pbs', lean: 'center' },
  { match: 'cnbc', lean: 'center' },
  { match: 'c-span', lean: 'center' },
  { match: 'christian science monitor', lean: 'center' },
  { match: 'newsnation', lean: 'center' },
  { match: 'nbc news', lean: 'center' },
  { match: 'abc news', lean: 'center' },
  { match: 'cbs news', lean: 'center' },
  // right / center-right
  { match: 'wall street journal', lean: 'right' },
  { match: 'fox news', lean: 'right' },
  { match: 'national review', lean: 'right' },
  { match: 'new york post', lean: 'right' },
  { match: 'ny post', lean: 'right' },
  { match: 'washington examiner', lean: 'right' },
  { match: 'washington times', lean: 'right' },
  { match: 'reason', lean: 'right' },
  { match: 'the dispatch', lean: 'right' },
  { match: 'the daily wire', lean: 'right' },
  { match: 'the telegraph', lean: 'right' },
  { match: 'newsmax', lean: 'right' },
  { match: 'the free press', lean: 'right' },
];

const LEAN_ORDER = ['left', 'center', 'right'];
const MAX_PER_OUTLET = 2;

function leanOf(source) {
  const s = String(source || '').toLowerCase();
  for (const { match, lean } of SOURCES) {
    if (s.includes(match)) return lean;
  }
  return null;
}

// From a pool of parsed items, keep only credible outlets and round-robin across
// left/center/right for a balanced spread (≤2 per outlet). Falls back to the
// unfiltered top items when too few credible sources are present.
export function selectBalanced(pool, limit = LIMIT) {
  const allowed = pool
    .map((it) => ({ ...it, lean: leanOf(it.source) }))
    .filter((it) => it.lean);

  if (allowed.length < 2) return pool.slice(0, limit); // sparse feed — degrade

  const buckets = { left: [], center: [], right: [] };
  for (const it of allowed) buckets[it.lean].push(it);

  const perOutlet = new Map();
  const out = [];
  let progressed = true;
  while (out.length < limit && progressed) {
    progressed = false;
    for (const lean of LEAN_ORDER) {
      const b = buckets[lean];
      while (b.length) {
        const it = b.shift();
        const key = String(it.source || '').toLowerCase();
        const count = perOutlet.get(key) || 0;
        if (count >= MAX_PER_OUTLET) continue;
        perOutlet.set(key, count + 1);
        out.push(it);
        progressed = true;
        break;
      }
      if (out.length >= limit) break;
    }
  }
  return out.slice(0, limit);
}

// topicId -> { ts, items }
const cache = new Map();

export async function getNewsForTopic(topicId) {
  const topic = getTopic(topicId);
  if (!topic) return [];

  const hit = cache.get(topicId);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.items;

  const query = NEWS_QUERIES[topicId] || topic.title;
  const url =
    'https://news.google.com/rss/search?q=' +
    encodeURIComponent(query) +
    '&hl=en-US&gl=US&ceid=US:en';

  const xml = await fetchText(url, FETCH_TIMEOUT_MS);
  if (!xml) return hit ? hit.items : []; // serve stale on failure if we have it

  // Parse a generous pool, then filter to credible outlets + balance the spread.
  const items = selectBalanced(parseItems(xml, 40), LIMIT);
  if (items.length) cache.set(topicId, { ts: Date.now(), items });
  return items;
}

async function fetchText(url, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'user-agent': 'bridge-news/0.1 (+https://localhost)' },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Minimal RSS <item> extraction — enough for Google News feeds, no XML dep.
export function parseItems(xml, limit = LIMIT) {
  const items = [];
  const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRe.exec(xml)) && items.length < limit) {
    const block = m[1];
    const title = decodeText(pick(block, 'title'));
    const url = decodeText(pick(block, 'link'));
    let source = decodeText(pick(block, 'source'));
    if (!title || !/^https?:\/\//i.test(url)) continue;
    // Google News titles often end with " - Outlet"; prefer the <source> tag and
    // strip the duplicate suffix from the headline when present.
    let cleanTitle = title;
    if (source && cleanTitle.endsWith(' - ' + source)) {
      cleanTitle = cleanTitle.slice(0, -(source.length + 3)).trim();
    }
    items.push({ title: cleanTitle, url, source });
  }
  return items;
}

function pick(block, tag) {
  const m = block.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? m[1] : '';
}

function decodeText(s) {
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}
