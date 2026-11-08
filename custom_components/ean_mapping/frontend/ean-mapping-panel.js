// Sidebar-Panel „EAN Mapping“: artikelzentrierte Pflege von todo.ean_mapping.
import {
  groupArticles, reviewQueue, whitespaceConflicts, filterArticles,
  normalizeName, planRename, planAddEan, todayIso,
} from './mapping-logic.js';
import { TodoApi } from './todo-api.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const fmtDate = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[3]}.${m[2]}.${m[1]}` : esc(iso);
};

const STYLE = `
  :host { display: block; height: 100%; color: var(--primary-text-color); background: var(--primary-background-color);
    font-family: var(--paper-font-body1_-_font-family, Roboto, system-ui, sans-serif); font-size: 14px; }
  * { box-sizing: border-box; }
  .toolbar { display: flex; align-items: center; gap: 8px; height: 56px; padding: 0 16px;
    background: var(--app-header-background-color, var(--primary-color)); color: var(--app-header-text-color, #fff);
    font-size: 20px; }
  .layout { display: flex; height: calc(100% - 56px); }
  .left { width: 35%; min-width: 260px; max-width: 420px; border-right: 1px solid var(--divider-color);
    overflow-y: auto; padding: 12px; background: var(--card-background-color); }
  .right { flex: 1; overflow-y: auto; padding: 16px 20px; }
  .tile { display: block; width: 100%; text-align: left; padding: 10px 12px; margin-bottom: 10px; border-radius: 8px;
    border: 1px solid var(--warning-color); background: color-mix(in srgb, var(--warning-color) 15%, transparent);
    color: inherit; font: inherit; font-weight: 600; cursor: pointer; }
  .tile.active { outline: 2px solid var(--primary-color); }
  .warn { padding: 8px 10px; margin-bottom: 10px; border-radius: 8px; font-size: 13px;
    background: color-mix(in srgb, var(--warning-color) 12%, transparent); }
  input[type=text] { width: 100%; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--divider-color);
    background: var(--card-background-color); color: var(--primary-text-color); font: inherit; }
  .search { margin-bottom: 8px; }
  .row { display: flex; justify-content: space-between; width: 100%; padding: 8px 10px; border: 0; border-radius: 6px;
    background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
  .row:hover { background: color-mix(in srgb, var(--primary-color) 8%, transparent); }
  .row.active { background: color-mix(in srgb, var(--primary-color) 18%, transparent); font-weight: 600; }
  .count { color: var(--secondary-text-color); }
  button.btn { padding: 6px 12px; border-radius: 6px; border: 1px solid var(--primary-color); background: none;
    color: var(--primary-color); font: inherit; cursor: pointer; white-space: nowrap; }
  button.btn.primary { background: var(--primary-color); color: var(--text-primary-color, #fff); }
  button.btn.danger { border-color: var(--error-color); color: var(--error-color); }
  button.btn:disabled { opacity: .5; cursor: default; }
  button.link { border: 0; background: none; color: var(--primary-color); font: inherit; cursor: pointer; padding: 8px 10px; }
  .label { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: var(--secondary-text-color); margin: 16px 0 6px; }
  .label.split { display: flex; justify-content: space-between; align-items: center; }
  .inline { display: flex; gap: 8px; align-items: center; }
  .inline input { flex: 1; }
  .ean { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: space-between;
    padding: 10px 0; border-bottom: 1px solid var(--divider-color); }
  .ean .main { flex: 1; min-width: 200px; }
  .ean .code { font-family: ui-monospace, monospace; word-break: break-all; }
  .muted { color: var(--secondary-text-color); font-size: 13px; }
  .actions { display: flex; flex-wrap: wrap; gap: 6px; }
  .picker { width: 100%; padding: 8px; border: 1px solid var(--divider-color); border-radius: 8px; margin-top: 6px; }
  .picker .row { padding: 6px 8px; }
  .empty { color: var(--secondary-text-color); margin-top: 40px; text-align: center; }
  .error { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 4px 4px 4px 12px;
    margin-bottom: 12px; border-radius: 6px; background: color-mix(in srgb, var(--error-color) 15%, transparent);
    color: var(--error-color); }
  .msg { color: var(--error-color); font-size: 13px; margin-top: 4px; }
  h2 { margin: 0 0 4px; font-size: 22px; font-weight: 500; }
  .back { display: none; }
  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: flex; align-items: center;
    justify-content: center; z-index: 10; }
  .dialog { background: var(--card-background-color); color: var(--primary-text-color); padding: 20px;
    border-radius: 12px; max-width: 380px; width: calc(100% - 32px); }
  .dialog .actions { justify-content: flex-end; margin-top: 16px; }
  @media (max-width: 700px) {
    .left { width: 100%; max-width: none; min-width: 0; border-right: 0; }
    .layout.has-sel .left { display: none; }
    .layout:not(.has-sel) .right { display: none; }
    .back { display: inline-block; margin-bottom: 8px; padding-left: 0; }
  }
`;

class EanMappingPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._items = [];
    this._loaded = false;
    this._sel = null; // {type:'article', name} | {type:'review'} | {type:'new'}
    this._drafts = new Map(); // data-key -> Eingabewert (überlebt Neu-Rendern)
    this._picker = null; // {uid, mode: 'move'|'assign'}
    this._msgs = new Map(); // Formular-Meldungen pro Schlüssel
    this._confirm = null; // {text, yes, run}
    this._error = '';
    this._busy = false;
    this._narrow = false;
    this.shadowRoot.addEventListener('click', (e) => this._onClick(e));
    this.shadowRoot.addEventListener('input', (e) => this._onInput(e));
    this.shadowRoot.addEventListener('keydown', (e) => this._onKey(e));
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._api) {
      this._api = new TodoApi(hass);
      if (this.isConnected) this._subscribe();
    } else {
      this._api.setHass(hass);
    }
    const mb = this.shadowRoot.querySelector('ha-menu-button');
    if (mb) mb.hass = hass;
  }

  get hass() { return this._hass; }

  set narrow(v) {
    if (!!v === this._narrow) return;
    this._narrow = !!v;
    this._render();
  }

  get narrow() { return this._narrow; }

  connectedCallback() {
    if (this._api && !this._unsub && !this._subscribing) this._subscribe();
    this._render();
  }

  disconnectedCallback() {
    if (this._unsub) { this._unsub(); this._unsub = null; }
  }

  async _subscribe() {
    this._subscribing = true;
    try {
      const unsub = await this._api.subscribe((items) => {
        this._items = items;
        this._loaded = true;
        this._render();
      });
      if (this.isConnected) this._unsub = unsub; else unsub();
    } catch (err) {
      this._error = `Liste konnte nicht geladen werden: ${err?.message || err}`;
      this._render();
    } finally {
      this._subscribing = false;
    }
  }

  // ---------- Aktionen ----------

  async _run(fn) {
    if (this._busy) return;
    this._busy = true;
    this._error = '';
    this._render();
    try {
      await fn();
    } catch (err) {
      this._error = `Fehler: ${err?.message || err}`;
    } finally {
      this._busy = false;
      this._render();
    }
  }

  _draft(key, fallback = '') {
    return this._drafts.has(key) ? this._drafts.get(key) : fallback;
  }

  _updateAll(updates) {
    return Promise.all(updates.map((u) => this._api.update(u.uid, { description: u.description })));
  }

  _onClick(e) {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const { action, name, uid } = el.dataset;
    const item = uid ? this._items.find((i) => i.uid === uid) : null;

    switch (action) {
      case 'select':
        this._sel = { type: 'article', name };
        this._picker = null;
        this._msgs.clear();
        break;
      case 'review':
        this._sel = { type: 'review' };
        this._picker = null;
        break;
      case 'new':
        this._sel = { type: 'new' };
        this._picker = null;
        break;
      case 'back':
        this._sel = null;
        this._picker = null;
        break;
      case 'dismiss-error':
        this._error = '';
        break;
      case 'confirm-no':
        this._confirm = null;
        break;
      case 'confirm-yes': {
        const run = this._confirm?.run;
        this._confirm = null;
        this._render();
        run?.();
        return;
      }
      case 'save-name': {
        const key = `name:${name}`;
        const plan = planRename(this._items, name, this._draft(key, name));
        if (!plan.updates.length) return;
        const target = plan.updates[0].description;
        const go = () => this._run(async () => {
          await this._updateAll(plan.updates);
          this._drafts.delete(key);
          if (this._sel?.type === 'article' && this._sel.name === name) this._sel = { type: 'article', name: target };
        });
        if (plan.mergeInto) {
          this._confirm = { text: `„${plan.mergeInto}“ gibt es schon. Zusammenführen?`, yes: 'Zusammenführen', run: go };
          break;
        }
        go();
        return;
      }
      case 'merge-ws': {
        const names = JSON.parse(el.dataset.names);
        const target = names[0].trim();
        const sources = names.filter((n) => n !== target);
        const updates = sources.flatMap((n) => planRename(this._items, n, target).updates);
        this._run(async () => {
          await this._updateAll(updates);
          if (this._sel?.type === 'article' && sources.includes(this._sel.name)) this._sel = { type: 'article', name: target };
        });
        return;
      }
      case 'remove':
        this._confirm = {
          text: `EAN ${item?.summary ?? ''} aus dem Mapping entfernen?`,
          yes: 'Entfernen',
          run: () => this._run(() => this._api.remove(uid)),
        };
        break;
      case 'mark':
        this._run(() => this._api.update(uid, { due: todayIso() }));
        return;
      case 'mark-all': {
        const list = this._items.filter((i) => i.description === name && !i.due);
        this._run(() => Promise.all(list.map((i) => this._api.update(i.uid, { due: todayIso() }))));
        return;
      }
      case 'picker':
        this._picker = this._picker?.uid === uid ? null : { uid, mode: el.dataset.mode };
        this._drafts.delete('pick');
        break;
      case 'pick': {
        const mode = this._picker?.mode;
        this._picker = null;
        const changes = mode === 'assign' ? { description: name, due: null } : { description: name };
        this._run(() => this._api.update(uid, changes));
        return;
      }
      case 'ok':
        if (item) this._run(() => this._api.clearDue(item));
        return;
      case 'rename-item': {
        const key = `rn:${uid}`;
        const newName = normalizeName(this._draft(key, item?.description || ''));
        if (!newName) { this._msgs.set(key, 'Bitte einen Namen eingeben.'); break; }
        this._msgs.delete(key);
        this._run(async () => {
          await this._api.update(uid, { description: newName, due: null });
          this._drafts.delete(key);
        });
        return;
      }
      case 'add-ean': {
        const key = `add:${name}`;
        const plan = planAddEan(this._items, this._draft(key), name);
        if (!plan.ok) { this._msgs.set(key, this._addError(plan)); break; }
        this._msgs.delete(key);
        this._run(async () => {
          await this._api.add(plan.add.summary, plan.add.description);
          this._drafts.delete(key);
        });
        return;
      }
      case 'create': {
        const newName = normalizeName(this._draft('new:name'));
        if (!newName) { this._msgs.set('new', 'Bitte einen Artikelnamen eingeben.'); break; }
        const plan = planAddEan(this._items, this._draft('new:ean'), newName);
        if (!plan.ok) { this._msgs.set('new', this._addError(plan)); break; }
        this._msgs.delete('new');
        this._run(async () => {
          await this._api.add(plan.add.summary, plan.add.description);
          this._drafts.delete('new:name');
          this._drafts.delete('new:ean');
          this._sel = { type: 'article', name: plan.add.description };
        });
        return;
      }
      default:
        return;
    }
    this._render();
  }

  _addError(plan) {
    if (plan.reason === 'empty') return 'Bitte eine EAN eingeben.';
    const owner = plan.existing?.description?.trim();
    return owner
      ? `Diese EAN gehört schon zu „${owner}“.`
      : 'Diese EAN ist schon im Mapping (noch unbenannt, siehe „Zu prüfen“).';
  }

  _onInput(e) {
    const key = e.target.dataset?.key;
    if (!key) return;
    this._drafts.set(key, e.target.value);
    if (key === 'q' || key === 'pick') this._render();
  }

  _onKey(e) {
    if (e.key !== 'Enter') return;
    const submit = e.target.dataset?.submit;
    if (!submit) return;
    this.shadowRoot.querySelector(`[data-submit-target="${CSS.escape(submit)}"]`)?.click();
  }

  // ---------- Rendering ----------

  _render() {
    const root = this.shadowRoot;
    const active = root.activeElement;
    const focusKey = active?.dataset?.key;
    const selStart = active?.selectionStart;
    const selEnd = active?.selectionEnd;
    const scroll = [...root.querySelectorAll('.left, .right')].map((n) => n.scrollTop);

    const articles = groupArticles(this._items);
    const queue = reviewQueue(this._items);
    let sel = this._sel;
    if (sel?.type === 'article' && !articles.some((a) => a.name === sel.name)) sel = null;

    root.innerHTML = `
      <style>${STYLE}</style>
      <div class="toolbar">
        ${this._narrow ? '<ha-menu-button></ha-menu-button>' : ''}
        <span>EAN Mapping</span>
      </div>
      <div class="layout ${sel ? 'has-sel' : ''}">
        <div class="left">${this._renderLeft(articles, queue, sel)}</div>
        <div class="right">
          ${this._error ? `<div class="error"><span>${esc(this._error)}</span><button class="link" data-action="dismiss-error" aria-label="Schließen">✕</button></div>` : ''}
          ${sel ? '<button class="link back" data-action="back">← Zurück</button>' : ''}
          ${this._renderRight(articles, queue, sel)}
        </div>
      </div>
      ${this._confirm ? `
        <div class="overlay"><div class="dialog" role="dialog" aria-modal="true">
          <div>${esc(this._confirm.text)}</div>
          <div class="actions">
            <button class="btn" data-action="confirm-no">Abbrechen</button>
            <button class="btn primary" data-action="confirm-yes">${esc(this._confirm.yes)}</button>
          </div>
        </div></div>` : ''}
    `;

    const mb = root.querySelector('ha-menu-button');
    if (mb) { mb.hass = this._hass; mb.narrow = this._narrow; }

    for (const input of root.querySelectorAll('input[data-key]')) {
      if (this._drafts.has(input.dataset.key)) input.value = this._drafts.get(input.dataset.key);
    }
    if (focusKey) {
      const el = root.querySelector(`input[data-key="${CSS.escape(focusKey)}"]`);
      if (el) {
        el.focus();
        try { el.setSelectionRange(selStart, selEnd); } catch { /* nicht unterstützt */ }
      }
    }
    root.querySelectorAll('.left, .right').forEach((n, i) => { n.scrollTop = scroll[i] || 0; });
  }

  _renderLeft(articles, queue, sel) {
    const q = this._draft('q');
    const shown = filterArticles(articles, q);
    const conflicts = whitespaceConflicts(articles);
    const dis = this._busy ? 'disabled' : '';
    return `
      ${queue.length ? `<button class="tile ${sel?.type === 'review' ? 'active' : ''}" data-action="review">📥 Zu prüfen (${queue.length})</button>` : ''}
      ${conflicts.map((names) => `
        <div class="warn">
          ${names.map((n) => `„${esc(n)}“`).join(' und ')} unterscheiden sich nur durch Leerzeichen.
          <button class="link" data-action="merge-ws" data-names="${esc(JSON.stringify(names))}" ${dis}>Zusammenführen</button>
        </div>`).join('')}
      <input type="text" class="search" data-key="q" placeholder="Artikel oder EAN suchen" autocomplete="off">
      ${!this._loaded ? '<div class="muted">Lade …</div>' : ''}
      ${shown.map((a) => `
        <button class="row ${sel?.type === 'article' && sel.name === a.name ? 'active' : ''}" data-action="select" data-name="${esc(a.name)}">
          <span>${esc(a.name)}</span><span class="count">· ${a.items.length}</span>
        </button>`).join('')}
      ${this._loaded && q.trim() && !shown.length ? '<div class="muted">Keine Treffer.</div>' : ''}
      <button class="link" data-action="new">+ Neuer Artikel</button>
    `;
  }

  _renderRight(articles, queue, sel) {
    if (!sel) return '<div class="empty">Artikel auswählen oder „Zu prüfen“ öffnen</div>';
    if (sel.type === 'new') return this._renderNew();
    if (sel.type === 'review') return this._renderReview(articles, queue);
    return this._renderArticle(articles.find((a) => a.name === sel.name), articles);
  }

  _renderPicker(uid, articles, exclude) {
    if (this._picker?.uid !== uid) return '';
    const list = filterArticles(articles, this._draft('pick')).filter((a) => a.name !== exclude).slice(0, 8);
    return `
      <div class="picker">
        <input type="text" data-key="pick" placeholder="Artikel suchen" autocomplete="off">
        ${list.map((a) => `<button class="row" data-action="pick" data-uid="${esc(uid)}" data-name="${esc(a.name)}">${esc(a.name)}</button>`).join('')}
        ${!list.length ? '<div class="muted">Keine Artikel gefunden.</div>' : ''}
      </div>`;
  }

  _renderArticle(article, articles) {
    const name = article.name;
    const dis = this._busy ? 'disabled' : '';
    const addKey = `add:${name}`;
    return `
      <div class="label">Artikelname (so landet er auf Bring!)</div>
      <div class="inline">
        <input type="text" data-key="name:${esc(name)}" data-submit="save" value="${esc(name)}" autocomplete="off">
        <button class="btn primary" data-action="save-name" data-submit-target="save" data-name="${esc(name)}" ${dis}>Speichern</button>
      </div>
      <div class="label split">
        <span>EANs (${article.items.length})</span>
        <button class="link" data-action="mark-all" data-name="${esc(name)}" ${dis}>Alle zur Prüfung markieren</button>
      </div>
      ${article.items.map((i) => `
        <div class="ean">
          <div class="main">
            <div class="code">${esc(i.summary)}</div>
            ${i.due ? `<div class="muted">automatisch erkannt am ${fmtDate(i.due)}</div>` : ''}
          </div>
          <div class="actions">
            ${i.due ? '' : `<button class="btn" data-action="mark" data-uid="${esc(i.uid)}" ${dis}>Zur Prüfung markieren</button>`}
            <button class="btn" data-action="picker" data-mode="move" data-uid="${esc(i.uid)}" ${dis}>Verschieben …</button>
            <button class="btn danger" data-action="remove" data-uid="${esc(i.uid)}" ${dis}>Entfernen</button>
          </div>
          ${this._renderPicker(i.uid, articles, name)}
        </div>`).join('')}
      <div class="label">EAN hinzufügen</div>
      <div class="inline">
        <input type="text" data-key="${esc(addKey)}" data-submit="add" placeholder="EAN" inputmode="numeric" autocomplete="off">
        <button class="btn" data-action="add-ean" data-submit-target="add" data-name="${esc(name)}" ${dis}>EAN hinzufügen</button>
      </div>
      ${this._msgs.has(addKey) ? `<div class="msg">${esc(this._msgs.get(addKey))}</div>` : ''}
    `;
  }

  _renderReview(articles, queue) {
    const dis = this._busy ? 'disabled' : '';
    if (!queue.length) return '<h2>Zu prüfen</h2><div class="empty">Alles erledigt – nichts zu prüfen.</div>';
    return `
      <h2>Zu prüfen</h2>
      <div class="muted">Unbekannte und automatisch erkannte EANs</div>
      ${queue.map(({ kind, item }) => {
        const key = `rn:${item.uid}`;
        const auto = kind === 'auto';
        return `
        <div class="ean">
          <div class="main">
            <div class="code">${esc(item.summary)}</div>
            <div class="muted">${auto ? `automatisch erkannt am ${fmtDate(item.due)}: „${esc(item.description)}“` : 'unbekannt'}</div>
            <div class="inline" style="margin-top:6px">
              <input type="text" data-key="${esc(key)}" data-submit="${esc(key)}" value="${auto ? esc(item.description) : ''}"
                placeholder="${auto ? '' : 'Neuer Artikelname'}" autocomplete="off">
              <button class="btn" data-action="rename-item" data-submit-target="${esc(key)}" data-uid="${esc(item.uid)}" ${dis}>${auto ? 'Umbenennen' : 'Neuer Artikel'}</button>
            </div>
            ${this._msgs.has(key) ? `<div class="msg">${esc(this._msgs.get(key))}</div>` : ''}
          </div>
          <div class="actions">
            ${auto ? `<button class="btn primary" data-action="ok" data-uid="${esc(item.uid)}" ${dis}>Passt</button>` : ''}
            <button class="btn" data-action="picker" data-mode="assign" data-uid="${esc(item.uid)}" ${dis}>Zu Artikel …</button>
            <button class="btn danger" data-action="remove" data-uid="${esc(item.uid)}" ${dis}>Entfernen</button>
          </div>
          ${this._renderPicker(item.uid, articles, auto ? item.description : null)}
        </div>`;
      }).join('')}
    `;
  }

  _renderNew() {
    const dis = this._busy ? 'disabled' : '';
    return `
      <h2>Neuer Artikel</h2>
      <div class="label">Artikelname (so landet er auf Bring!)</div>
      <input type="text" data-key="new:name" data-submit="create" autocomplete="off">
      <div class="label">Erste EAN</div>
      <input type="text" data-key="new:ean" data-submit="create" inputmode="numeric" autocomplete="off">
      ${this._msgs.has('new') ? `<div class="msg">${esc(this._msgs.get('new'))}</div>` : ''}
      <div style="margin-top:12px"><button class="btn primary" data-action="create" data-submit-target="create" ${dis}>Anlegen</button></div>
    `;
  }
}

if (!customElements.get('ean-mapping-panel')) customElements.define('ean-mapping-panel', EanMappingPanel);
