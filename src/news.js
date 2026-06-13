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

  const items = parseItems(xml, LIMIT);
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
