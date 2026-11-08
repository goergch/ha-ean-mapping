// Reine Logik für das EAN-Mapping-Panel. Keine Seiteneffekte, keine DOM-Zugriffe.
// Item = {uid, summary (EAN), description (Artikelname), due, status}

const collator = new Intl.Collator('de', { sensitivity: 'base' });

export function isUnnamed(item) {
  return typeof item.description !== 'string' || item.description.trim() === '';
}

export function groupArticles(items) {
  const byName = new Map();
  for (const item of items) {
    if (isUnnamed(item)) continue;
    if (!byName.has(item.description)) byName.set(item.description, []);
    byName.get(item.description).push(item);
  }
  return [...byName.entries()]
    .map(([name, list]) => ({
      name,
      items: [...list].sort((a, b) => collator.compare(a.summary, b.summary)),
    }))
    .sort((a, b) => collator.compare(a.name, b.name) || (a.name < b.name ? -1 : 1));
}

export function reviewQueue(items) {
  const unknown = items.filter(isUnnamed).map((item) => ({ kind: 'unknown', item }));
  const auto = items
    .filter((i) => !isUnnamed(i) && i.due)
    .sort((a, b) => (a.due < b.due ? 1 : a.due > b.due ? -1 : 0))
    .map((item) => ({ kind: 'auto', item }));
  return [...unknown, ...auto];
}

export function whitespaceConflicts(articles) {
  const byTrim = new Map();
  for (const a of articles) {
    const key = a.name.trim();
    if (!byTrim.has(key)) byTrim.set(key, []);
    byTrim.get(key).push(a.name);
  }
  return [...byTrim.values()].filter((names) => names.length > 1);
}

export function filterArticles(articles, query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return articles;
  return articles.filter(
    (a) => a.name.toLowerCase().includes(q) || a.items.some((i) => i.summary.toLowerCase().includes(q)),
  );
}

export function normalizeName(s) {
  return (s ?? '').trim();
}

export function normalizeEan(s) {
  return (s ?? '').replace(/\s+/g, '');
}

export function planRename(items, oldName, newName) {
  const target = normalizeName(newName);
  if (!target || target === oldName) return { updates: [], mergeInto: null };
  const updates = items
    .filter((i) => i.description === oldName)
    .map((i) => ({ uid: i.uid, description: target }));
  const mergeInto = items.some((i) => i.description === target) ? target : null;
  return { updates, mergeInto };
}

export function planAddEan(items, rawEan, name) {
  const summary = normalizeEan(rawEan);
  if (!summary) return { ok: false, reason: 'empty' };
  const existing = items.find((i) => i.summary === summary);
  if (existing) return { ok: false, reason: 'duplicate', existing };
  return { ok: true, add: { summary, description: normalizeName(name) } };
}

export function todayIso(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
