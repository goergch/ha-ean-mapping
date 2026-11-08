# EAN-Mapping-Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** HACS-installierbare HA-Integration, die ein Sidebar-Panel „EAN Mapping“ registriert, das `todo.ean_mapping` artikelzentriert (Artikel = gleiche Beschreibung, mehrere EANs) anzeigt und bearbeitet, inkl. Bereich „Zu prüfen“.

**Architecture:** Minimaler Python-Teil (`custom_components/ean_mapping`) mit Config-Flow, der nur einen statischen Pfad und ein `panel_custom`-Panel registriert. Die gesamte Fachlogik liegt im Browser: ein reines Logikmodul (`mapping-logic.js`), ein dünner Datenzugriff über die HA-WebSocket-Verbindung (`todo-api.js`) und eine Vanilla-Web-Component (`ean-mapping-panel.js`) ohne Build-Schritt. Einzige Änderung außerhalb des Repos: `due_date` im OFF-Zweig der bestehenden Automatisierung.

**Tech Stack:** Python 3.13 / Home Assistant ≥ 2024.7 (pytest-homeassistant-custom-component), Vanilla JS ES-Module (keine Abhängigkeiten), `node --test` (Node 25) für JS-Tests, `uv` für Python-Umgebung.

**Spec:** `docs/superpowers/specs/2026-11-08-ean-mapping-panel-design.md`

## Global Constraints

- Domain `ean_mapping`; Panel: Webcomponent `ean-mapping-panel`, URL-Pfad `ean-mapping`, Titel `EAN Mapping`, Icon `mdi:barcode`, `require_admin: false`.
- Statischer Pfad `/ean_mapping_frontend` → `custom_components/ean_mapping/frontend/`; `module_url` = `/ean_mapping_frontend/ean-mapping-panel.js?v=<manifest version>`.
- Datenquelle fest: `todo.ean_mapping`. `summary` = EAN, `description` = Artikelname, `due` = „automatisch erkannt, unbestätigt“. `status` wird nie geschrieben.
- Das Panel ändert `summary` bestehender Einträge **nie**. Kein Zugriff auf `todo.zuhause` / `todo.scan_gerate`.
- Gruppierung nach **exaktem** `description`-String; leer/nur Leerzeichen/fehlend = unbenannt. Neue Namenseingaben werden getrimmt. EAN-Eingabe: alle Leerzeichen/Zeilenumbrüche entfernen, sonst unverändert.
- UI-Texte nur Deutsch. Keine CDN-/Laufzeitabhängigkeiten. Farben ausschließlich über HA-CSS-Variablen (`--primary-color`, `--primary-text-color`, `--secondary-text-color`, `--card-background-color`, `--divider-color`, `--warning-color`, `--error-color`, `--primary-background-color`).
- Layout B: zwei Spalten (links Liste ~35 %, rechts Detail); unter 700 px Breite eine Spalte mit Zurück-Button.
- Version `0.1.0` in `manifest.json`, `hacs.json` mit `"homeassistant": "2024.7.0"`.
- Commits enden mit `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. `description` fehlt / `null` / nur Leerzeichen → Eintrag gilt als unbenannt, kein Absturz, kein Artikel „“ in der Liste. (Test in Task 2)
2. Umbenennen auf einen Namen, den ein anderer Artikel exakt schon hat → Rückfrage „zusammenführen“, danach **alle** EANs beider Gruppen unter dem Zielnamen. (Test in Task 2)
3. Live-Update (frischer Scan) kommt, während der Nutzer gerade den Namen im Eingabefeld tippt → Eingabe bleibt erhalten, Auswahl bleibt bestehen. (Prüfschritt in Task 4)
4. Eintrag mit `due` **und** leerer Beschreibung → erscheint genau einmal in „Zu prüfen“, als „unbekannt“. (Test in Task 2)
5. Letzte EAN eines gerade ausgewählten Artikels entfernt/verschoben → Artikel verschwindet, rechte Spalte fällt auf Leerzustand zurück, kein Fehler. (Test in Task 2 + Prüfschritt in Task 4)

---

### Task 1: Integration-Gerüst (Python) mit Panel-Registrierung

**Files:**
- Create: `hacs.json`, `pyproject.toml`, `.gitignore`
- Create: `custom_components/ean_mapping/{manifest.json,const.py,__init__.py,config_flow.py}`
- Create: `custom_components/ean_mapping/translations/{de.json,en.json}`
- Create: `custom_components/ean_mapping/frontend/ean-mapping-panel.js` (Platzhalter: definiert leeres Custom Element `ean-mapping-panel`)
- Test: `tests/conftest.py`, `tests/test_init.py`, `tests/test_config_flow.py`

**Interfaces:**
- Produces: `const.py`: `DOMAIN = "ean_mapping"`, `PANEL_URL_PATH = "ean-mapping"`, `PANEL_COMPONENT = "ean-mapping-panel"`, `STATIC_URL = "/ean_mapping_frontend"`, `PANEL_TITLE = "EAN Mapping"`, `PANEL_ICON = "mdi:barcode"`. Frontend-Dateien unter `frontend/` werden unter `STATIC_URL/<datei>` ausgeliefert (Task 2–4 legen dort ES-Module ab, relative Imports funktionieren).

- [ ] **Step 1: Umgebung anlegen.** `pyproject.toml` mit dev-Abhängigkeit `pytest-homeassistant-custom-component` (aktuelle Version), `requires-python = ">=3.13"`; `[tool.pytest.ini_options] asyncio_mode = "auto"`, `testpaths = ["tests"]`. `uv sync` muss durchlaufen. `.gitignore`: `.venv/`, `__pycache__/`, `.pytest_cache/`, `node_modules/`.

- [ ] **Step 2: Failing tests schreiben.** `conftest.py` aktiviert `enable_custom_integrations` (autouse).
  - `test_config_flow.py::test_user_flow_creates_entry` — `hass.config_entries.flow.async_init(DOMAIN, context={"source": "user"})` → Formular; Bestätigen → `type == "create_entry"`, `title == "EAN Mapping"`.
  - `test_config_flow.py::test_single_instance` — mit bestehendem `MockConfigEntry(domain=DOMAIN)` → `type == "abort"`, `reason == "single_instance_allowed"`.
  - `test_init.py::test_setup_registers_panel` — Entry setup → `"ean-mapping" in hass.data["frontend_panels"]`; Panel-Config enthält `_panel_custom.name == "ean-mapping-panel"` und `module_url` startet mit `/ean_mapping_frontend/ean-mapping-panel.js?v=0.1.0`.
  - `test_init.py::test_static_js_served` — `hass_client` GET `/ean_mapping_frontend/ean-mapping-panel.js` → Status 200.
  - `test_init.py::test_unload_removes_panel` — nach `async_unload` → `"ean-mapping" not in hass.data["frontend_panels"]`.
  - `test_init.py::test_reload_does_not_fail` — Setup, Unload, erneutes Setup → beide `True` (statischer Pfad darf nur einmal registriert werden; Flag in `hass.data[DOMAIN]`).

- [ ] **Step 3: Tests laufen lassen.** `uv run pytest -q` → FAIL (Modul fehlt).

- [ ] **Step 4: Implementieren.**
  - `manifest.json`: `domain`, `name: "EAN Mapping"`, `version: "0.1.0"`, `config_flow: true`, `dependencies: ["http", "frontend", "panel_custom"]`, `documentation`/`issue_tracker` auf `https://github.com/goergch/ha-ean-mapping`, `codeowners: ["@goergch"]`, `iot_class: "calculated"`, `integration_type: "service"`, `single_config_entry: true`.
  - `config_flow.py`: ein `user`-Schritt ohne Felder; bei vorhandenem Eintrag `async_abort(reason="single_instance_allowed")`.
  - `__init__.py`: `async_setup_entry` → einmalig `hass.http.async_register_static_paths([StaticPathConfig(STATIC_URL, <frontend-dir>, cache_headers=False)])`, dann `panel_custom.async_register_panel(hass, webcomponent_name=PANEL_COMPONENT, frontend_url_path=PANEL_URL_PATH, module_url=f"{STATIC_URL}/ean-mapping-panel.js?v={version}", sidebar_title=PANEL_TITLE, sidebar_icon=PANEL_ICON, require_admin=False)`. Version aus `manifest.json` lesen (`async_get_integration(hass, DOMAIN)`). `async_unload_entry` → `frontend.async_remove_panel(hass, PANEL_URL_PATH)`, `True`.
  - Translations: Titel/Beschreibung des Schritts, Abort-Text („Ist bereits eingerichtet.“).
  - `hacs.json`: `{"name": "EAN Mapping", "homeassistant": "2024.7.0", "render_readme": true}`.

- [ ] **Step 5: Tests grün.** `uv run pytest -q` → alle 6 PASS.

- [ ] **Step 6: Commit.** `feat: integration skeleton registering sidebar panel`

---

### Task 2: Reine Logik `mapping-logic.js`

**Files:**
- Create: `custom_components/ean_mapping/frontend/mapping-logic.js`
- Create: `package.json` (`"type": "module"`, Script `"test": "node --test tests/js/"`)
- Test: `tests/js/mapping-logic.test.js`

**Interfaces:**
- Typ `Item` = `{uid: string, summary: string, description?: string|null, due?: string|null, status: string}` (Form wie von `todo/item/list`).
- Produces (alle Named Exports, alle rein/unverändernd):
  - `isUnnamed(item): boolean` — `description` fehlt/null/`trim()===''`.
  - `groupArticles(items): Article[]` mit `Article = {name: string, items: Item[]}`; nur benannte; Schlüssel exakter `description`-String; sortiert per `localeCompare(…, 'de', {sensitivity:'base'})`; Items je Artikel nach `summary` sortiert.
  - `reviewQueue(items): {kind: 'unknown'|'auto', item: Item}[]` — `unknown` = unbenannt (egal ob `due`); `auto` = benannt **und** `due` gesetzt. Reihenfolge: alle `unknown` zuerst, dann `auto` nach `due` absteigend.
  - `whitespaceConflicts(articles): string[][]` — Gruppen ≥ 2 Artikelnamen mit gleichem `trim()`.
  - `filterArticles(articles, query): Article[]` — leer → alle; sonst case-insensitive Teilstring in `name` oder in irgendeiner `summary`.
  - `normalizeName(s): string` — `trim()`.
  - `normalizeEan(s): string` — `s.replace(/\s+/g, '')`.
  - `planRename(items, oldName, newName): {updates: {uid: string, description: string}[], mergeInto: string|null}` — `newName` wird normalisiert; `updates` = alle Items mit exakt `oldName`; `mergeInto = newName` wenn ein anderes Item exakt `newName` hat, sonst `null`; bei `newName === oldName` oder leer → `updates: []`.
  - `planAddEan(items, rawEan, name): {ok: true, add: {summary, description}} | {ok: false, reason: 'empty'|'duplicate', existing?: Item}`.
  - `todayIso(date = new Date()): string` — lokales Datum `YYYY-MM-DD`.

- [ ] **Step 1: Failing tests schreiben** (`node:test` + `node:assert/strict`), mindestens:
  - `groupArticles` gruppiert `[{summary:'1',description:'Milch'},{summary:'2',description:'Milch'},{summary:'3',description:'Butter'}]` → `[Butter(1), Milch(2)]`.
  - Review Focus 1: Items mit `description` `undefined`, `null`, `'  '` → `groupArticles` liefert `[]`, `isUnnamed` jeweils `true`.
  - Exakte Gruppierung: `'Milch'` und `'Milch '` → zwei Artikel; `whitespaceConflicts` → `[['Milch','Milch ']]` (Reihenfolge egal, im Test sortieren).
  - Review Focus 4: Item `{description:'', due:'2026-11-01'}` → `reviewQueue` Länge 1, `kind:'unknown'`.
  - `reviewQueue` Reihenfolge: unknown vor auto; zwei auto mit `due` `2026-11-01`/`2026-11-05` → `2026-11-05` zuerst.
  - Review Focus 2: `planRename(items, 'Milsani Vollmilch', 'Milch')` bei bestehendem Artikel `Milch` → `mergeInto === 'Milch'`, `updates` enthält genau die uids der `Milsani Vollmilch`-Items mit `description:'Milch'`.
  - `planRename` mit `'  Milch  '` → `description:'Milch'`; mit gleichem Namen oder `''` → `updates: []`.
  - Review Focus 5: nach Entfernen des einzigen Items von `Butter` liefert `groupArticles` keinen Artikel `Butter`.
  - `planAddEan(items, ' 40144 00900057\n', 'Milch')` → `{ok:true, add:{summary:'4014400900057', description:'Milch'}}`; vorhandene EAN → `reason:'duplicate'` mit `existing`; `'  '` → `reason:'empty'`.
  - `filterArticles` findet `Milch` über Query `'0090'` (EAN-Teil) und `'milch'`.
  - `todayIso(new Date(2026, 0, 5))` → `'2026-01-05'`.

- [ ] **Step 2: Laufen lassen.** `npm test` → FAIL (Modul fehlt).

- [ ] **Step 3: Implementieren** gemäß Signaturen oben.

- [ ] **Step 4: Grün.** `npm test` → alle PASS.

- [ ] **Step 5: Commit.** `feat: pure mapping logic for grouping, review queue and rename planning`

---

### Task 3: Datenzugriff `todo-api.js` + Live-Check `due` löschen

**Files:**
- Create: `custom_components/ean_mapping/frontend/todo-api.js`
- Test: `tests/js/todo-api.test.js`

**Interfaces:**
- Consumes: `hass` mit `hass.connection.subscribeMessage(cb, msg) → Promise<unsubscribeFn>` und `hass.callService(domain, service, data, target)`.
- Produces: `export const ENTITY_ID = 'todo.ean_mapping'`; `export class TodoApi { constructor(hass); setHass(hass); subscribe(onItems: (items: Item[]) => void): Promise<() => void>; add(summary, description, due?: string): Promise; update(uid, {description?, due?: string|null}): Promise; remove(uid): Promise; clearDue(item: Item): Promise }`.
  - `subscribe` nutzt WS `{type: 'todo/item/subscribe', entity_id: ENTITY_ID}`; ruft `onItems(event.items)`.
  - `add` → `callService('todo','add_item',{item: summary, description, due_date?}, {entity_id})` (`due_date` nur wenn gesetzt).
  - `update` → `callService('todo','update_item',{item: uid, description?, due_date?}, {entity_id})`; `due: null` wird als `due_date: null` gesendet.
  - `remove` → `callService('todo','remove_item',{item: [uid]}, {entity_id})`.
  - `clearDue(item)` → Strategie gemäß Step 1 (unten).

- [ ] **Step 1: Live prüfen, wie sich `due` bei `local_todo` löschen lässt** (über HA-MCP `call_service`, nur mit Testeintrag):
  1. `todo.add_item` auf `todo.ean_mapping`: `item: "PANELTEST-0000"`, `description: "Paneltest"`, `due_date: <heute>`.
  2. `todo.update_item`: `item: "PANELTEST-0000"`, `due_date: null`.
  3. `todo.get_items` → prüfen, ob `due` beim Testeintrag fehlt.
  4. `todo.remove_item` `PANELTEST-0000` — immer, auch bei Fehlschlag.
  Ergebnis im Commit-Text festhalten. **Erfolg →** `clearDue` = `update(uid, {due: null})`. **Misserfolg →** `clearDue` = `remove(uid)` dann `add(item.summary, item.description)` (ohne due).

- [ ] **Step 2: Failing tests schreiben** mit Fake-`hass`, das Aufrufe aufzeichnet:
  - `subscribe` sendet exakt `{type:'todo/item/subscribe', entity_id:'todo.ean_mapping'}` und reicht `items` aus einem simulierten Event an den Callback.
  - `add('123','Milch')` → Aufruf ohne `due_date`-Schlüssel; `add('123','Milch','2026-11-08')` → mit.
  - `update('u1',{description:'Milch'})` → Daten `{item:'u1', description:'Milch'}` (kein `due_date`-Schlüssel); `update('u1',{due:null})` → `{item:'u1', due_date:null}`.
  - `remove('u1')` → `{item:['u1']}`.
  - `clearDue` entspricht der in Step 1 gewählten Strategie (Aufrufsequenz prüfen).

- [ ] **Step 3: Laufen lassen** → FAIL. **Step 4: Implementieren.** **Step 5:** `npm test` → PASS.

- [ ] **Step 6: Commit.** `feat: todo api wrapper for todo.ean_mapping` (+ Ergebnis aus Step 1).

---

### Task 4: Panel-UI `ean-mapping-panel.js` + lokale Vorschau

**Files:**
- Modify: `custom_components/ean_mapping/frontend/ean-mapping-panel.js` (ersetzt Platzhalter)
- Create: `dev/preview.html`, `dev/fake-hass.js` (In-Memory-`hass` mit Beispieldaten; nicht ausgeliefert)

**Interfaces:**
- Consumes: alle Exporte aus Task 2 und `TodoApi`/`ENTITY_ID` aus Task 3 (relative Imports `./mapping-logic.js`, `./todo-api.js`).
- Produces: `customElements.define('ean-mapping-panel', …)`; HA setzt Properties `hass`, `narrow`, `panel`, `route`. `dev/fake-hass.js` exportiert `createFakeHass(items: Item[]) → hass` mit `connection.subscribeMessage` (pusht nach jeder Änderung die neue Liste) und `callService` für `add_item`/`update_item`/`remove_item` gemäß Task-3-Formaten.

Ansicht (Texte genau so):
- Kopfzeile: bei `narrow` `<ha-menu-button>` mit `.hass`/`.narrow` (Sidebar-Toggle), Titel „EAN Mapping“.
- Links: Kachel „📥 Zu prüfen (n)“ (versteckt bei n = 0); Warnhinweis bei `whitespaceConflicts` („‚X‘ und ‚Y‘ unterscheiden sich nur durch Leerzeichen“ + Button „Zusammenführen“ → Rename auf getrimmten Namen); Suchfeld „Artikel oder EAN suchen“; Artikelzeilen „Name · n“; „+ Neuer Artikel“.
- Rechts, Artikel: Feld „Artikelname (so landet er auf Bring!)“ + „Speichern“; bei `mergeInto` Bestätigung „‚A‘ gibt es schon. Zusammenführen?“ (eigener In-Page-Dialog, **kein** `window.confirm`); EAN-Liste mit „Entfernen“, „Verschieben …“ (Artikelauswahl), „Zur Prüfung markieren“ (setzt `due` = `todayIso()`), bei gesetztem `due` Hinweis „automatisch erkannt am TT.MM.JJJJ“; Kopf-Aktion „Alle zur Prüfung markieren“; Feld + „EAN hinzufügen“ mit Meldungen für `empty`/`duplicate` („Diese EAN gehört schon zu ‚X‘“).
- Rechts, Zu prüfen: je Eintrag EAN, ggf. Name und Datum; `auto`: „Passt“ (`clearDue`), „Umbenennen“ (Name ändern + `clearDue`), „Zu Artikel …“; `unknown`: „Zu Artikel …“, „Neuer Artikel“ (Name eingeben). „Zu Artikel …“ = Auswahl mit Suchfeld über bestehende Artikelnamen; setzt `description` und löscht `due`.
- „+ Neuer Artikel“: Name + erste EAN, legt per `planAddEan` an.
- Leerzustand rechts: „Artikel auswählen oder ‚Zu prüfen‘ öffnen“.
- Fehler bei Service-Aufrufen: Meldungsleiste mit Fehlertext, Daten bleiben unverändert.

Verhalten: Daten nur aus `subscribe`; beim ersten `hass` subscriben, in `disconnectedCallback` abmelden. Bei neuen Items **nur Listen neu rendern**, nicht ein fokussiertes/dirty Eingabefeld überschreiben (Review Focus 3); Auswahl per Artikelname halten, verschwindet der Artikel → Leerzustand (Review Focus 5). Mehrere Updates eines Renames parallel per `Promise.all`.

- [ ] **Step 1: `dev/fake-hass.js` + `dev/preview.html`** mit Beispieldaten: 3 Artikel (Milch mit 3 EANs, Butter 2, Haferflocken 1), 1 unbekannte EAN, 1 auto-erkannte („Milsani Frische Vollmilch 3,5% 1l“, `due` gesetzt), 1 Leerzeichen-Variante „Butter “. Preview stellt HA-CSS-Variablen hell/dunkel bereit und einen Button, der einen „frischen Scan“ (neues unbekanntes Item) einspielt. Start: `python3 -m http.server -d . 8765` aus Repo-Root, öffnen `http://localhost:8765/dev/preview.html`.
- [ ] **Step 2: Panel implementieren.**
- [ ] **Step 3: Im Browser prüfen** (Claude in Chrome oder Nutzer), jeweils sichtbares Ergebnis:
  - Artikel „Milch“ umbenennen in „Vollmilch“ → alle 3 EANs unter „Vollmilch“.
  - Auto-Eintrag „Zu Artikel … → Milch“ → verschwindet aus „Zu prüfen“, Milch hat 4 EANs.
  - „Butter “-Warnung → „Zusammenführen“ → Butter hat 3 EANs, Warnung weg.
  - Review Focus 3: in Namensfeld tippen, „frischen Scan“ auslösen → Text bleibt, Zähler „Zu prüfen“ steigt.
  - Review Focus 5: Haferflocken auswählen, einzige EAN entfernen → Leerzustand, keine Konsolenfehler.
  - Doppelte EAN hinzufügen → Meldung „Diese EAN gehört schon zu ‚…‘“.
  - Fensterbreite < 700 px → eine Spalte mit Zurück; Dark-Mode-Variablen → lesbar.
- [ ] **Step 4:** `npm test` und `uv run pytest -q` weiterhin grün.
- [ ] **Step 5: Commit.** `feat: EAN mapping panel UI with local preview`

---

### Task 5: Automatisierung markiert OFF-Treffer mit `due_date`

**Files:** keine im Repo (Live-Änderung in HA über `mcp__home-assistant__*`); danach Notiz in `/Users/goergch/workspaces/scanner/CLAUDE.md`.

- [ ] **Step 1:** `get_automation_config("1790237372933")` holen; im Zweig `match is none` → `off_name != ''` die Aktion `todo.add_item` auf `todo.ean_mapping` finden (`data: {description: "{{ off_name }}", item: "{{ ean }}"}`).
- [ ] **Step 2:** genau dort `due_date: "{{ now().date() | string }}"` ergänzen, sonst nichts ändern; per `update_automation` schreiben.
- [ ] **Step 3:** erneut holen und vergleichen: einzige Differenz ist das neue Feld. `get_error_log` ohne neue Fehler zu `automation.ean_scan_bring_zuhause`.
- [ ] **Step 4:** in `scanner/CLAUDE.md` unter `todo.ean_mapping` ergänzen: „Automatisch über OpenFoodFacts angelegte Einträge bekommen `due` = Scan-Tag (= ‚zu prüfen‘ im Panel `ha-ean-mapping`).“

---

### Task 6: README und Release 0.1.0

**Files:**
- Create: `README.md` (Deutsch: Zweck, Voraussetzung `todo.ean_mapping`, Installation über HACS → Benutzerdefiniertes Repository `https://github.com/goergch/ha-ean-mapping`, Typ „Integration“ → herunterladen → HA neu starten → Integration „EAN Mapping“ hinzufügen; Bedeutung von `due`; lokale Vorschau/Tests).

- [ ] **Step 1:** README schreiben.
- [ ] **Step 2:** `npm test` und `uv run pytest -q` grün.
- [ ] **Step 3:** Commit `docs: README with HACS installation`, `git push`.
- [ ] **Step 4:** `gh release create v0.1.0 --title "0.1.0" --notes "Erste Version: Sidebar-Panel für todo.ean_mapping"`; `gh release view v0.1.0` zeigt das Release.
