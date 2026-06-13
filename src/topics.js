// Curated debate topics. Each topic is phrased as a neutral statement so a
// stance slider (-3 = strongly disagree ... +3 = strongly agree) is unambiguous.
// "volatility" is a rough heat rating used only to surface how charged a topic is.

export const TOPICS = [
  {
    id: 'gun-control',
    title: 'Gun control',
    statement: 'Stricter gun control laws would make the country safer.',
    volatility: 'high',
  },
  {
    id: 'immigration',
    title: 'Immigration',
    statement: 'Immigration levels should be increased.',
    volatility: 'high',
  },
  {
    id: 'climate-policy',
    title: 'Climate policy',
    statement: 'The government should aggressively regulate emissions even at economic cost.',
    volatility: 'high',
  },
  {
    id: 'abortion',
    title: 'Abortion',
    statement: 'Abortion should be broadly legal.',
    volatility: 'high',
  },
  {
    id: 'taxes',
    title: 'Taxes on the wealthy',
    statement: 'Taxes on high earners should be raised significantly.',
    volatility: 'medium',
  },
  {
    id: 'free-speech',
    title: 'Speech moderation',
    statement: 'Social platforms should more aggressively moderate harmful speech.',
    volatility: 'medium',
  },
  {
    id: 'death-penalty',
    title: 'Death penalty',
    statement: 'The death penalty is a justifiable punishment.',
    volatility: 'medium',
  },
  {
    id: 'universal-healthcare',
    title: 'Universal healthcare',
    statement: 'Healthcare should be provided as a single public system.',
    volatility: 'medium',
  },
];

const TOPIC_MAP = new Map(TOPICS.map((t) => [t.id, t]));

export function getTopic(id) {
  return TOPIC_MAP.get(id);
}

// Convert a numeric stance (-3..+3) into a short human label relative to a topic.
export function stanceLabel(stance) {
  const s = Number(stance);
  if (s <= -3) return 'Strongly disagree';
  if (s === -2) return 'Disagree';
  if (s === -1) return 'Somewhat disagree';
  if (s === 0) return 'Neutral';
  if (s === 1) return 'Somewhat agree';
  if (s === 2) return 'Agree';
  return 'Strongly agree';
}

// Two stances are "opposite" when they sit on different sides of neutral.
export function areOpposite(a, b) {
  return Number(a) > 0 !== Number(b) > 0 && Number(a) !== 0 && Number(b) !== 0;
}
