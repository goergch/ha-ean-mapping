import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TodoApi, ENTITY_ID } from '../../custom_components/ean_mapping/frontend/todo-api.js';

function fakeHass() {
  const calls = [];
  const subs = [];
  return {
    calls,
    subs,
    connection: {
      subscribeMessage: async (cb, msg) => {
        subs.push({ cb, msg });
        return () => { subs.find((s) => s.cb === cb).closed = true; };
      },
    },
    callService: async (domain, service, data, target) => {
      calls.push({ domain, service, data, target });
    },
  };
}

test('entity id is fixed', () => {
  assert.equal(ENTITY_ID, 'todo.ean_mapping');
});

test('subscribe sends todo/item/subscribe and forwards items; unsubscribe works', async () => {
  const hass = fakeHass();
  const api = new TodoApi(hass);
  let got = null;
  const unsub = await api.subscribe((items) => { got = items; });
  assert.deepEqual(hass.subs[0].msg, { type: 'todo/item/subscribe', entity_id: 'todo.ean_mapping' });
  hass.subs[0].cb({ items: [{ uid: 'a', summary: '1' }] });
  assert.deepEqual(got, [{ uid: 'a', summary: '1' }]);
  unsub();
  assert.equal(hass.subs[0].closed, true);
});

test('add omits due_date unless given', async () => {
  const hass = fakeHass();
  const api = new TodoApi(hass);
  await api.add('123', 'Milch');
  await api.add('123', 'Milch', '2026-11-08');
  assert.deepEqual(hass.calls, [
    { domain: 'todo', service: 'add_item', data: { item: '123', description: 'Milch' }, target: { entity_id: 'todo.ean_mapping' } },
    { domain: 'todo', service: 'add_item', data: { item: '123', description: 'Milch', due_date: '2026-11-08' }, target: { entity_id: 'todo.ean_mapping' } },
  ]);
});

test('update sends only given fields; due null clears', async () => {
  const hass = fakeHass();
  const api = new TodoApi(hass);
  await api.update('u1', { description: 'Milch' });
  await api.update('u1', { due: null });
  await api.update('u1', { description: 'Milch', due: '2026-11-08' });
  assert.deepEqual(hass.calls.map((c) => [c.service, c.data]), [
    ['update_item', { item: 'u1', description: 'Milch' }],
    ['update_item', { item: 'u1', due_date: null }],
    ['update_item', { item: 'u1', description: 'Milch', due_date: '2026-11-08' }],
  ]);
});

test('remove sends uid list', async () => {
  const hass = fakeHass();
  await new TodoApi(hass).remove('u1');
  assert.deepEqual(hass.calls[0].data, { item: ['u1'] });
  assert.equal(hass.calls[0].service, 'remove_item');
});

test('clearDue uses update_item with due_date null (verified live on local_todo)', async () => {
  const hass = fakeHass();
  await new TodoApi(hass).clearDue({ uid: 'u1', summary: '1', description: 'Milch', due: '2026-11-08' });
  assert.deepEqual(hass.calls.map((c) => [c.service, c.data]), [['update_item', { item: 'u1', due_date: null }]]);
});

test('setHass switches the hass used for calls', async () => {
  const a = fakeHass();
  const b = fakeHass();
  const api = new TodoApi(a);
  api.setHass(b);
  await api.remove('u1');
  assert.equal(a.calls.length, 0);
  assert.equal(b.calls.length, 1);
});
