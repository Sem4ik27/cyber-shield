import { RULES, ORDER } from './data.js';

export const store = {
  get(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  },
  del(key) {
    try { localStorage.removeItem(key); } catch {}
  }
};

export const state = {
  log: [],
  reports: store.get('ks_reports', []),
  stats: store.get('ks_stats', { messages: 0, reports: 0 }),
  mode: store.get('ks_mode', 'classic'),
  ollama: { status: 'unknown', model: null, error: null },
  knowledge: { status: 'unknown', count: 0, error: null, choices: [] },
  quiz: { i: 0, score: 0, selected: null, answered: false }
};

export function normalize(text) {
  return text.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

export function classify(raw) {
  const text = normalize(raw);
  let best = 'fallback';
  let bestScore = 0;
  for (const key of ORDER) {
    let score = 0;
    for (const [phrase, weight] of RULES[key]) {
      if (text.includes(phrase)) score += weight;
    }
    if (score > bestScore) {
      bestScore = score;
      best = key;
    }
  }
  return bestScore >= 2 ? best : 'fallback';
}

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
