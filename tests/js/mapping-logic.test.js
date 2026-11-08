import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isUnnamed, groupArticles, reviewQueue, whitespaceConflicts, filterArticles,
  normalizeName, normalizeEan, planRename, planAddEan, todayIso,
} from '../../custom_components/ean_mapping/frontend/mapping-logic.js';

let n = 0;
const it = (summary, description, extra = {}) =>
  ({ uid: `u${++n}`, summary, description, status: 'needs_action', ...extra });

test('groupArticles groups by description and sorts', () => {
  const items = [it('1', 'Milch'), it('2', 'Milch'), it('3', 'Butter')];
  const arts = groupArticles(items);
  assert.deepEqual(arts.map((a) => [a.name, a.items.length]), [['Butter', 1], ['Milch', 2]]);
});

test('items inside an article are sorted by summary', () => {
  const arts = groupArticles([it('9', 'Milch'), it('1', 'Milch')]);
  assert.deepEqual(arts[0].items.map((i) => i.summary), ['1', '9']);
});

test('missing, null and blank descriptions are unnamed and not grouped', () => {
  const items = [it('1', undefined), it('2', null), it('3', '  ')];
  assert.deepEqual(groupArticles(items), []);
  for (const i of items) assert.equal(isUnnamed(i), true);
  assert.equal(isUnnamed(it('4', 'Milch')), false);
});

test('grouping is exact; whitespace variants are reported as conflicts', () => {
  const arts = groupArticles([it('1', 'Milch'), it('2', 'Milch ')]);
  assert.equal(arts.length, 2);
  assert.deepEqual(whitespaceConflicts(arts).map((g) => [...g].sort()), [['Milch', 'Milch ']]);
  assert.deepEqual(whitespaceConflicts(groupArticles([it('1', 'Milch')])), []);
});

test('item with due and empty description appears once as unknown', () => {
  const q = reviewQueue([it('1', '', { due: '2026-11-01' })]);
  assert.equal(q.length, 1);
  assert.equal(q[0].kind, 'unknown');
});

test('reviewQueue: unknown first, then auto by due descending; named without due excluded', () => {
  const a1 = it('1', 'A', { due: '2026-11-01' });
  const a2 = it('2', 'B', { due: '2026-11-05' });
  const u = it('3', '');
  const plain = it('4', 'C');
  const q = reviewQueue([a1, plain, a2, u]);
  assert.deepEqual(q.map((e) => [e.kind, e.item.summary]), [['unknown', '3'], ['auto', '2'], ['auto', '1']]);
});

test('planRename onto an existing article proposes merge and updates only source items', () => {
  const m = it('1', 'Milch');
  const s1 = it('2', 'Milsani Vollmilch');
  const s2 = it('3', 'Milsani Vollmilch');
  const r = planRename([m, s1, s2], 'Milsani Vollmilch', 'Milch');
  assert.equal(r.mergeInto, 'Milch');
  assert.deepEqual(r.updates, [
    { uid: s1.uid, description: 'Milch' },
    { uid: s2.uid, description: 'Milch' },
  ]);
});

test('planRename trims, and no-ops on same or empty name', () => {
  const a = it('1', 'Milk');
  assert.deepEqual(planRename([a], 'Milk', '  Milch  '), { updates: [{ uid: a.uid, description: 'Milch' }], mergeInto: null });
  assert.deepEqual(planRename([a], 'Milk', 'Milk').updates, []);
  assert.deepEqual(planRename([a], 'Milk', '   ').updates, []);
});

test('planRename can fix a whitespace variant to its trimmed name (merge)', () => {
  const a = it('1', 'Butter');
  const b = it('2', 'Butter ');
  const r = planRename([a, b], 'Butter ', 'Butter');
  assert.deepEqual(r, { updates: [{ uid: b.uid, description: 'Butter' }], mergeInto: 'Butter' });
});

test('removing the only item of an article removes the article', () => {
  const b = it('1', 'Butter');
  const m = it('2', 'Milch');
  assert.deepEqual(groupArticles([b, m].filter((i) => i !== b)).map((a) => a.name), ['Milch']);
});

test('planAddEan normalizes, detects duplicates and empty input', () => {
  const existing = it('4014400900057', 'Milch');
  assert.deepEqual(planAddEan([], ' 40144 00900057\n', ' Milch '), { ok: true, add: { summary: '4014400900057', description: 'Milch' } });
  assert.deepEqual(planAddEan([existing], '4014400900057', 'Butter'), { ok: false, reason: 'duplicate', existing });
  assert.deepEqual(planAddEan([], '  ', 'Milch'), { ok: false, reason: 'empty' });
});

test('filterArticles matches name case-insensitively and EAN substrings', () => {
  const arts = groupArticles([it('4014400900057', 'Milch'), it('111', 'Butter')]);
  assert.deepEqual(filterArticles(arts, '0090').map((a) => a.name), ['Milch']);
  assert.deepEqual(filterArticles(arts, 'milch').map((a) => a.name), ['Milch']);
  assert.equal(filterArticles(arts, '').length, 2);
  assert.equal(filterArticles(arts, '  ').length, 2);
});

test('normalizers', () => {
  assert.equal(normalizeName('  a b '), 'a b');
  assert.equal(normalizeEan(' 1 2\t3\n'), '123');
});

test('todayIso uses local date', () => {
  assert.equal(todayIso(new Date(2026, 0, 5)), '2026-01-05');
});
