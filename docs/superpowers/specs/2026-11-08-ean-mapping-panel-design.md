# Design: Sidebar-Panel „EAN Mapping“ für Home Assistant

Stand: 2026-11-08

## Intent / Warum

Die EAN→Artikel-Zuordnung liegt in der `local_todo`-Liste `todo.ean_mapping`
(Zusammenfassung = EAN, Beschreibung = Artikelname). Die Pflege über die normale
Todo-Ansicht ist mühsam:

1. Von OpenFoodFacts (OFF) automatisch erkannte Namen stimmen oft nicht bzw. sind zu
   lang („Milsani Frische Vollmilch 3,5% 1l“ statt „Milch“) und müssen korrigiert
   werden.
2. Logisch pflegt der Nutzer **Artikel**, nicht Barcodes: ein Artikel („Milch“) hat
   mehrere EANs (Marken, Größen). Alle sollen auf denselben Bring!-Eintrag zählen.

Ziel ist eine optisch schönere, artikelzentrierte Verwaltungsoberfläche als eigener
Eintrag in der HA-Sidebar. **Nur Darstellung/Bedienung** — Datenhaltung und Scan-Logik
bleiben, wie sie sind.

## Ziele

- Eigenes Sidebar-Panel in HA (Name z. B. „EAN Mapping“, Icon `mdi:barcode`).
- Artikelzentrierte Sicht: Einträge von `todo.ean_mapping` werden nach Beschreibung
  gruppiert; jede Gruppe = ein Artikel mit ihren EANs.
- Bereich **„Zu prüfen“** für EANs, die Aufmerksamkeit brauchen.
- Bequemes Korrigieren, Zuordnen, Zusammenführen.

## Nicht-Ziele

- Kein eigener Datenspeicher, keine Migration. `todo.ean_mapping` bleibt die einzige
  Quelle der Wahrheit.
- Die Scan-Verarbeitung (Abgleich, OFF-Abruf, Zähler auf `todo.zuhause`, Push,
  Display) bleibt in der bestehenden Automatisierung
  `automation.ean_scan_bring_zuhause`.
- Keine Verwaltung von `todo.scan_gerate` oder `todo.zuhause` im Panel.
- Keine HACS-Veröffentlichung, kein Mehrsprachen-Support (nur Deutsch).

## Anti-Ziele (wäre ein Fehlschlag, selbst wenn es „funktioniert“)

- Das Panel verändert Einträge so, dass die Automatisierung sie nicht mehr findet
  (z. B. EAN in der Zusammenfassung verändert, Präfixe/Suffixe angehängt).
- Umbenennen eines Artikels erwischt nur einen Teil seiner EANs (halb umbenannte
  Gruppe → Dubletten auf der Bring!-Liste).
- Das Panel wirkt fremd in HA (eigenes Login, eigener Server, bricht im Dark Mode).

## Datenmodell (bestehend, unverändert)

`todo.ean_mapping`, ein Eintrag pro EAN:

| Feld | Bedeutung |
|---|---|
| `summary` | EAN (Schlüssel, wird von der Automatisierung per `equalto` gesucht — **nie verändern** außer bei bewusster EAN-Korrektur) |
| `description` | Artikelname; genau dieser String landet auf `todo.zuhause`. Leer = unbenannt |
| `due` | **neu genutzt:** gesetzt = „automatisch erkannt, noch nicht bestätigt“ (Datum = Tag des ersten Scans) |
| `status` | wird nicht genutzt; die Automatisierung filtert hier nicht danach. Panel lässt ihn unverändert |

Ein **Artikel** = alle Einträge mit identischer (getrimmter) `description`.
Gruppierung exakt case-sensitiv, weil die Automatisierung den String 1:1 auf die
Bring!-Liste schreibt und dort per `equalto` vergleicht.

## Einzige Änderung an der Automatisierung

Im Zweig „Unbekannter Artikel → OFF-Treffer“ bekommt das
`todo.add_item` auf `todo.ean_mapping` zusätzlich `due_date: "{{ now().date() }}"`.
Sonst nichts. Vor dem Schreiben aktuellen Stand per `get_automation_config` holen
(siehe CLAUDE.md zum Hash/Locking; aktuell wird über die `mcp__home-assistant__*`-Tools
geschrieben).

Der Zweig „kein OFF-Treffer“ legt weiterhin einen Eintrag ohne Beschreibung an —
der taucht ohne Datum in „Zu prüfen“ auf, weil die Beschreibung leer ist.

## Bedienung (Layout B, vom Nutzer gewählt: zwei Spalten)

**Linke Spalte**
- Oben Kachel „📥 Zu prüfen (n)“ — öffnet rechts die Prüfansicht.
- Suchfeld (filtert nach Artikelname und EAN).
- Artikelliste, alphabetisch, je Zeile Name + Anzahl EANs.
- „+ Neuer Artikel“.

**Rechte Spalte — Artikel-Detail**
- Artikelname editierbar („so landet er auf Bring!“). Speichern benennt **alle**
  EAN-Einträge der Gruppe um (`todo.update_item` mit neuer `description` je Eintrag).
  Existiert der neue Name schon als anderer Artikel → Rückfrage „Mit ‚X‘
  zusammenführen?“ (Zusammenführen = genau dieses Umbenennen).
- Liste der EANs. Pro EAN: entfernen (`todo.remove_item`), zu anderem Artikel
  verschieben (Beschreibung ändern).
- „+ EAN hinzufügen“ (manuelle Eingabe; legt neuen Eintrag `summary=EAN`,
  `description=Artikelname` an; Dublettenprüfung gegen bestehende EANs).
- Bei EANs mit gesetztem `due`: Hinweis „automatisch erkannt am …“.

**Rechte Spalte — Zu prüfen**
- Zwei Arten von Einträgen:
  - *Automatisch erkannt* (`due` gesetzt): zeigt EAN, OFF-Namen, Datum. Aktionen:
    „Passt“ (nur `due` entfernen), „Umbenennen“ (Name ändern + `due` entfernen),
    „Zu Artikel …“ (bestehenden Artikel wählen, Beschreibung übernehmen + `due`
    entfernen).
  - *Unbekannt* (Beschreibung leer): Aktionen „Zu Artikel …“ oder „Neuer Artikel“.
- Artikel-Auswahl mit Suche/Autovervollständigung über bestehende Artikelnamen.

Beim Umbenennen eines automatisch erkannten Eintrags bleibt ein ggf. schon auf
`todo.zuhause` stehender Eintrag mit dem alten OFF-Namen unangetastet (Panel fasst
die Bring!-Liste nicht an).

Aktualisierung: Panel lädt Daten beim Öffnen und reagiert auf Zustandsänderungen von
`todo.ean_mapping` (Abo auf `state_changed` bzw. Todo-Item-Subscription), damit ein
frischer Scan ohne Reload sichtbar wird.

## Technik

**Vom Nutzer entschieden:** Auslieferung als **HACS-Paket** aus einem öffentlichen
GitHub-Repo `goergch/ha-ean-mapping`, in HACS als benutzerdefiniertes Repository
eingebunden. Installation und HA-Neustart macht der Nutzer selbst.

**Entscheidung von Claude:** HACS-Typ **Integration** (nicht „Dashboard/Plugin“),
weil sich nur so das Sidebar-Panel ohne `panel_custom`-YAML registrieren lässt.

- `custom_components/ean_mapping/` mit minimalem Python:
  `manifest.json`, `__init__.py`, `config_flow.py` (ein Schritt, keine Optionen,
  nur eine Instanz erlaubt), `strings.json`/`translations/de.json`.
  Beim Setup: statischen Pfad für das Frontend registrieren
  (`hass.http.async_register_static_paths`) und Panel über
  `panel_custom.async_register_panel` anlegen (Titel „EAN Mapping“,
  Icon `mdi:barcode`, URL-Pfad `ean-mapping`, `require_admin: false`).
  Beim Entfernen der Integration Panel wieder abmelden.
- `hacs.json` im Repo-Root; Versionierung über GitHub-Releases (Tag = Version in
  `manifest.json`), Cache-Busting der JS-URL über die Version.
- Die Oberfläche selbst ist eine einzelne JavaScript-Datei (Web Component,
  `customElements.define`) im Integrationsordner (z. B. `frontend/ean-mapping-panel.js`).
  Die Python-Seite enthält **keine** Fachlogik.
- `todo.ean_mapping` als Entity-ID fest verdrahtet (Konstante im JS) — keine
  Konfigurationsoption nötig.
- HA übergibt dem Panel das `hass`-Objekt; Lesen/Schreiben ausschließlich über
  dessen WebSocket-Verbindung:
  - Lesen: `todo/item/list` bzw. `todo.get_items` mit `return_response`.
  - Schreiben: `todo.add_item`, `todo.update_item` (Ziel per `uid`), `todo.remove_item`.
- Keine externen CDN-Abhängigkeiten zur Laufzeit; wenn ein Hilfsmittel (z. B. Lit)
  genutzt wird, mitgebündelt oder das von HA bereitgestellte verwenden.
- Stil über HA-CSS-Variablen (`--primary-color`, `--card-background-color` …), damit
  Hell/Dunkel automatisch passt.
- Quellcode lebt im Repo `~/workspaces/ha-ean-mapping` (GitHub `goergch/ha-ean-mapping`).

## Bekannte Rahmenbedingungen

- HA läuft im Kubernetes-Cluster (`heimserver-gitops`); `/config` liegt auf einem PVC,
  HACS ist installiert.
- Die Änderung an der Automatisierung (`due_date`) wird separat über die
  HA-MCP-Tools geschrieben, nicht über das HACS-Paket.

## Aktion „Zur Prüfung markieren“ (vom Nutzer gewählt statt Altbestands-Import)

In der Artikel-Ansicht kann pro EAN (und für den ganzen Artikel) „Zur Prüfung
markieren“ gewählt werden → setzt `due` auf heute, Eintrag erscheint unter
„Zu prüfen“. Kein automatischer Import alter OFF-Einträge.

## Entscheidungen von Claude (nach Builder-Check, bitte gegenlesen)

- **`due` entfernen:** zuerst prüfen, ob `todo.update_item` mit `due_date: null` (bzw.
  `todo/item/update` ohne due) bei `local_todo` das Datum löscht. Falls nicht:
  Eintrag löschen und mit gleicher `summary`/`description` ohne Datum neu anlegen —
  unkritisch, weil die Automatisierung per `summary` sucht, nicht per `uid`.
- **Namen:** Gruppierung nach dem **exakten** String (nicht getrimmt), weil die
  Automatisierung ihn 1:1 vergleicht. Varianten, die sich nur durch Leerzeichen
  unterscheiden, zeigt das Panel als Warnung („‚Milch ‘ und ‚Milch‘ sind verschiedene
  Artikel – zusammenführen?“). Neue Eingaben werden getrimmt.
- **EAN-Eingabe:** nur Leerzeichen/Zeilenumbrüche entfernen, Ziffern unverändert
  übernehmen (kein Auffüllen auf 13 Stellen). Dublettenprüfung exakt.

## Dem Builder überlassen

- Interne Struktur des JS, Framework ja/nein, Styling-Details.
- Wie genau Sortierung, leere Zustände und Fehlermeldungen aussehen.
- Mobile-Darstellung (sinnvoll: unter ~700px eine Spalte mit Zurück-Navigation).
- Test-Ansatz (z. B. Logik zum Gruppieren/Umbenennen als reine Funktionen testbar).
