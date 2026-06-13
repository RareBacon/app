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

// Extract the client IP for the *sole* purpose of immediately fingerprinting it.
// By default we use the socket address. Only trust X-Forwarded-For if the operator
// explicitly opts in (BRIDGE_TRUST_PROXY=1) — otherwise clients could spoof it.
export function clientFingerprint(req) {
  let ip = req.socket?.remoteAddress || '';
  if (process.env.BRIDGE_TRUST_PROXY === '1') {
    const fwd = req.headers['x-forwarded-for'];
    if (typeof fwd === 'string' && fwd.length) ip = fwd.split(',')[0].trim();
  }
  return fingerprint(ip); // raw `ip` goes out of scope here and is never stored
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
