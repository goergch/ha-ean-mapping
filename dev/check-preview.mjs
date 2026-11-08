// Drives dev/preview.html in headless Chrome via CDP and checks the panel scenarios.
// Usage: python3 -m http.server -d . 8765 &  then  node dev/check-preview.mjs <screenshot-dir>
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT = process.argv[2];
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'cdp-'))}`,
  '--window-size=1200,800', '--no-first-run', 'about:blank',
], { stdio: 'ignore' });

let ws; let id = 0; const pending = new Map(); const errors = [];
async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); break; }
    } catch { /* not up yet */ }
    await sleep(200);
  }
  await new Promise((r) => ws.addEventListener('open', r));
  ws.addEventListener('message', (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
  });
}
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
async function ev(expr) {
  const r = await send('Runtime.evaluate', { expression: `(async()=>{${H};return (${expr});})()`, awaitPromise: true, returnByValue: true });
  if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval error');
  await sleep(200);
  return r.result.result.value;
}
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT, name), Buffer.from(r.result.data, 'base64'));
}

// Page helpers (injected per eval)
const H = `
  const R = document.querySelector('ean-mapping-panel').shadowRoot;
  const $ = (s) => R.querySelector(s);
  const $$ = (s) => [...R.querySelectorAll(s)];
  const click = (s) => { const e = $(s); if (!e) throw new Error('missing ' + s); e.click(); };
  const type = (s, v) => { const e = $(s); if (!e) throw new Error('missing ' + s); e.focus(); e.value = v; e.dispatchEvent(new Event('input', {bubbles: true, composed: true})); };
  const rows = () => $$('.left .row').map((r) => [...r.children].map((c) => c.textContent).join(' '));
  const tile = () => $('.tile')?.textContent.trim() ?? null;
`;

const results = [];
const check = (name, ok, detail) => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' :: ' + JSON.stringify(detail)}`); };

try {
  await connect();
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: 'http://localhost:8765/dev/preview.html' });
  await sleep(1200);

  let r = await ev(`({rows: rows(), tile: tile(), warn: !!$('.warn'), empty: $('.right .empty')?.textContent})`);
  check('initial list', JSON.stringify(r.rows) === JSON.stringify(['Butter · 2', 'Butter  · 1', 'Haferflocken · 1', 'Milch · 3', 'Milsani Frische Vollmilch 3,5% 1l · 1']), r.rows);
  check('initial review tile', r.tile === '📥 Zu prüfen (2)', r.tile);
  check('whitespace warning shown', r.warn, r);
  check('empty state', r.empty === 'Artikel auswählen oder „Zu prüfen“ öffnen', r.empty);
  await shot('01-initial.png');

  // Rename Milch -> Vollmilch
  await ev(`click('.row[data-name="Milch"]')`);
  await ev(`type('input[data-key="name:Milch"]', 'Vollmilch')`);
  await ev(`click('[data-action="save-name"]')`);
  r = await ev(`({rows: rows(), title: $('input[data-key^="name:"]')?.value})`);
  check('rename moves all 3 EANs', r.rows.includes('Vollmilch · 3') && !r.rows.some((x) => x.startsWith('Milch ')), r);
  check('selection follows rename', r.title === 'Vollmilch', r.title);

  // Review: assign auto item to Vollmilch
  await ev(`click('.tile')`);
  await shot('02-review.png');
  await ev(`click('[data-action="picker"][data-uid="a1"]')`);
  await ev(`type('input[data-key="pick"]', 'voll')`);
  await ev(`click('[data-action="pick"][data-uid="a1"][data-name="Vollmilch"]')`);
  r = await ev(`({rows: rows(), tile: tile()})`);
  check('assign removes from review', r.tile === '📥 Zu prüfen (1)', r.tile);
  check('assigned EAN joins Vollmilch', r.rows.includes('Vollmilch · 4'), r.rows);
  check('due cleared on assign', await ev(`window.fakeHass.log.at(-1).data.due_date === null`), null);

  // Whitespace merge
  await ev(`click('[data-action="merge-ws"]')`);
  r = await ev(`({rows: rows(), warn: !!$('.warn')})`);
  check('whitespace merge', r.rows.includes('Butter · 3') && !r.warn, r);

  // Review Focus 3: typing survives live update
  await ev(`click('.row[data-name="Butter"]')`);
  await ev(`type('input[data-key="name:Butter"]', 'Butterxyz')`);
  await ev(`window.fakeHass.simulateScan('4000000000999')`);
  r = await ev(`({val: $('input[data-key="name:Butter"]').value, focused: R.activeElement?.dataset?.key, tile: tile()})`);
  check('draft survives live update', r.val === 'Butterxyz' && r.focused === 'name:Butter', r);
  check('live scan increments review', r.tile === '📥 Zu prüfen (2)', r.tile);

  // Duplicate EAN
  await ev(`type('input[data-key="add:Butter"]', '4061462045509')`);
  await ev(`click('[data-action="add-ean"]')`);
  r = await ev(`$('.msg')?.textContent`);
  check('duplicate EAN message', r === 'Diese EAN gehört schon zu „Vollmilch“.', r);

  // Add EAN with Enter key
  await ev(`type('input[data-key="add:Butter"]', ' 4000 1112223 ')`);
  await ev(`(R.activeElement.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true, composed: true})), true)`);
  r = await ev(`rows()`);
  check('add EAN via Enter', r.includes('Butter · 4'), r);

  // Review Focus 5: remove last EAN of Haferflocken
  await ev(`click('.row[data-name="Haferflocken"]')`);
  await ev(`click('[data-action="remove"]')`);
  r = await ev(`$('.dialog')?.textContent.replace(/\\s+/g,' ').trim()`);
  check('remove asks in-page', r?.startsWith('EAN 4061458074421 aus dem Mapping entfernen?'), r);
  await ev(`click('[data-action="confirm-yes"]')`);
  r = await ev(`({rows: rows(), empty: $('.right .empty')?.textContent})`);
  check('last EAN removed -> article gone + empty state', !r.rows.some((x) => x.startsWith('Haferflocken')) && r.empty === 'Artikel auswählen oder „Zu prüfen“ öffnen', r);

  // Rename onto existing -> merge dialog
  await ev(`click('.row[data-name="Milsani Frische Vollmilch 3,5% 1l"]')`).catch(() => {});
  await ev(`click('.row[data-name="Butter"]')`);
  await ev(`type('input[data-key="name:Butter"]', 'Vollmilch')`);
  await ev(`click('[data-action="save-name"]')`);
  r = await ev(`$('.dialog')?.textContent.replace(/\\s+/g,' ').trim()`);
  check('merge confirmation', r?.startsWith('„Vollmilch“ gibt es schon. Zusammenführen?'), r);
  await ev(`click('[data-action="confirm-no"]')`);

  // Search typing must not replace the input element (mobile IME safety)
  await ev(`(window.__q = $('input[data-key="q"]'), true)`);
  await ev(`type('input[data-key="q"]', 'voll')`);
  r = await ev(`({same: window.__q === $('input[data-key="q"]'), rows: rows()})`);
  check('search keeps input element', r.same && r.rows.length === 1 && r.rows[0].startsWith('Vollmilch'), r);
  await ev(`type('input[data-key="q"]', '')`);
  await ev(`click('.row[data-name="Butter"]')`);
  await ev(`click('[data-action="picker"]')`);
  await ev(`(window.__p = $('input[data-key="pick"]'), true)`);
  await ev(`type('input[data-key="pick"]', 'voll')`);
  r = await ev(`({same: window.__p === $('input[data-key="pick"]'), opts: $$('.picker .row').map((b) => b.textContent)})`);
  check('picker search keeps input element', r.same && JSON.stringify(r.opts) === '["Vollmilch"]', r);
  await ev(`click('[data-action="picker"]')`);

  // Merge confirmation must use fresh data (EAN arriving while dialog is open)
  await ev(`type('input[data-key="name:Butter"]', 'Vollmilch')`);
  await ev(`click('[data-action="save-name"]')`);
  await ev(`window.fakeHass.callService('todo', 'add_item', {item: '4000000000777', description: 'Butter'}, {entity_id: 'todo.ean_mapping'})`);
  await ev(`click('[data-action="confirm-yes"]')`);
  r = await ev(`rows()`);
  check('merge applies to EANs added while confirming', !r.some((x) => x.startsWith('Butter ')) && r.includes('Vollmilch · 9'), r);

  // New article
  await ev(`click('[data-action="new"]')`);
  await ev(`type('input[data-key="new:name"]', '  Haferflocken ')`);
  await ev(`type('input[data-key="new:ean"]', '4061458074421')`);
  await ev(`click('[data-action="create"]')`);
  r = await ev(`({rows: rows(), title: $('input[data-key^="name:"]')?.value})`);
  check('new article created + selected', r.rows.includes('Haferflocken · 1') && r.title === 'Haferflocken', r);

  // Review: unknown -> new name
  await ev(`click('.tile')`);
  const uid = await ev(`$('[data-action="rename-item"]').dataset.uid`);
  await ev(`type('input[data-key="rn:${uid}"]', 'Quark')`);
  await ev(`click('[data-action="rename-item"][data-uid="${uid}"]')`);
  r = await ev(`({rows: rows(), tile: tile()})`);
  check('unknown named from review', r.rows.includes('Quark · 1') && r.tile === '📥 Zu prüfen (1)', r);

  // Mark for review
  await ev(`click('.row[data-name="Quark"]')`);
  await ev(`click('[data-action="mark"]')`);
  r = await ev(`({tile: tile(), hint: $('.ean .muted')?.textContent})`);
  check('mark for review', r.tile === '📥 Zu prüfen (2)' && /automatisch erkannt am \d\d\.\d\d\.\d{4}/.test(r.hint), r);
  // Passt
  await ev(`click('.tile')`);
  const autoUid = await ev(`$('[data-action="ok"]').dataset.uid`);
  await ev(`click('[data-action="ok"][data-uid="${autoUid}"]')`);
  r = await ev(`tile()`);
  check('Passt clears due', r === '📥 Zu prüfen (1)', r);
  await shot('03-after-actions.png');

  // Dark mode + narrow
  await ev(`(document.documentElement.classList.add('dark'), true)`);
  await shot('04-dark.png');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 800, deviceScaleFactor: 1, mobile: true });
  await sleep(400);
  r = await ev(`({leftShown: getComputedStyle($('.left')).display, rightShown: getComputedStyle($('.right')).display, back: getComputedStyle($('.back')).display})`);
  check('narrow: detail only + back button', r.leftShown === 'none' && r.rightShown !== 'none' && r.back !== 'none', r);
  await shot('05-narrow-detail.png');
  await ev(`click('[data-action="back"]')`);
  r = await ev(`({leftShown: getComputedStyle($('.left')).display, rightShown: getComputedStyle($('.right')).display})`);
  check('narrow: back shows list', r.leftShown !== 'none' && r.rightShown === 'none', r);
  await shot('06-narrow-list.png');

  check('no console errors', errors.length === 0, errors);
} catch (e) {
  results.push('FAIL harness :: ' + e.message);
} finally {
  console.log(results.join('\n'));
  chrome.kill();
  process.exit(0);
}
