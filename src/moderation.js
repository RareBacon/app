// Lightweight, heuristic civility check. This is NOT heavy censorship — it only
// flags signals that the mediator can use to nudge people back toward good faith.
// We deliberately keep the message text intact; the goal is de-escalation, not
// deletion.

const SLURS_AND_ABUSE = [
  // A small, intentionally conservative list of clearly abusive terms. The aim is
  // to catch direct insults aimed at a person, not to police opinions.
  'idiot', 'moron', 'stupid', 'dumbass', 'shut up', 'retard', 'libtard',
  'snowflake', 'fascist', 'nazi', 'commie', 'sheeple', 'brainwashed',
];

const HOSTILE_PATTERNS = [
  /\byou(?:'re| are)\s+(?:a|an|so|such)\b/i, // "you're a ...", "you are so ..."
  /\bshut\s+up\b/i,
  /\b(?:f|sh)\w*\s*(?:you|off)\b/i,
];

const ALL_CAPS = /^[^a-z]*[A-Z]{4,}[^a-z]*$/;

// Returns { hostile: boolean, reasons: string[] }.
export function assessMessage(text) {
  const reasons = [];
  const lower = String(text || '').toLowerCase();

  for (const term of SLURS_AND_ABUSE) {
    if (lower.includes(term)) {
      reasons.push('name-calling');
      break;
    }
  }
  for (const re of HOSTILE_PATTERNS) {
    if (re.test(text)) {
      reasons.push('personal-attack');
      break;
    }
  }
  // Shouting: long all-caps message.
  const letters = String(text || '').replace(/[^a-zA-Z]/g, '');
  if (letters.length >= 8 && letters === letters.toUpperCase() && ALL_CAPS.test(text.trim())) {
    reasons.push('shouting');
  }
  // Excessive exclamation.
  if ((String(text).match(/!/g) || []).length >= 4) {
    reasons.push('shouting');
  }

  return { hostile: reasons.length > 0, reasons: [...new Set(reasons)] };
}
