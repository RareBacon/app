// Privacy-preserving rate limiting.
//
// We never store raw client IPs. Instead we turn an IP into a one-way fingerprint
// using HMAC-SHA256 with a secret that is generated fresh at process start and is
// NEVER persisted or logged. The fingerprint cannot be reversed to an IP without
// the secret, and on restart a new secret makes all previous fingerprints
// meaningless noise. Fingerprints live only in memory with a short TTL.

import { randomBytes, createHmac } from 'node:crypto';

// The linchpin: in-RAM only, regenerated every boot, never written anywhere.
const SECRET = randomBytes(32);

// One-way fingerprint of an IP. The raw IP is only a transient argument here and is
// discarded immediately after hashing.
export function fingerprint(ip) {
  if (!ip) return 'unknown';
  return createHmac('sha256', SECRET).update(ip).digest('hex');
}

// Extract a throttling identity for the request and return its fingerprint.
//
// Default (local / no proxy): hash the socket IP. The raw IP is only a transient
// argument and is never stored.
//
// Behind a trusted proxy (BRIDGE_TRUST_PROXY=1), prefer values the proxy supplies
// so the app need never see a raw client IP at all:
//   1. X-Client-FP    — the proxy already hashed/anonymized the client. We re-hash
//                        it with our in-RAM secret for domain separation, so a
//                        leaked header value can't be replayed across restarts.
//   2. X-Forwarded-For — first hop, hashed here (use only if the proxy can't
//                        pre-hash; coarser privacy than option 1).
// Untrusted requests never get to set these — clients could otherwise spoof them.
export function clientFingerprint(req) {
  if (process.env.BRIDGE_TRUST_PROXY === '1') {
    const pre = req.headers['x-client-fp'];
    if (typeof pre === 'string' && pre) return fingerprint(pre);
    const fwd = req.headers['x-forwarded-for'];
    if (typeof fwd === 'string' && fwd.length) {
      return fingerprint(fwd.split(',')[0].trim()); // raw IP discarded after hashing
    }
  }
  return fingerprint(req.socket?.remoteAddress || ''); // raw IP discarded after hashing
}

// Create an independent sliding-window limiter. Each limiter owns its own Map so
// different endpoints don't share counters.
export function createLimiter({ limit, windowMs }) {
  const hits = new Map(); // fingerprint -> { count, firstSeen }

  // Periodic sweep so memory can't grow unbounded. unref() so it never keeps the
  // process alive on its own.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [fp, rec] of hits) {
      if (now - rec.firstSeen > windowMs) hits.delete(fp);
    }
  }, windowMs);
  if (typeof sweep.unref === 'function') sweep.unref();

  return function tooMany(fp) {
    const now = Date.now();
    const rec = hits.get(fp);
    if (!rec || now - rec.firstSeen > windowMs) {
      hits.set(fp, { count: 1, firstSeen: now });
      return false;
    }
    rec.count += 1;
    return rec.count > limit;
  };
}
