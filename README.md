# EAN Mapping für Home Assistant

Sidebar-Panel zur Pflege der EAN→Artikel-Zuordnung in der `local_todo`-Liste
**`todo.ean_mapping`** (genutzt von der Scan-Automatisierung „EAN-Scan → Bring!“).

- **Artikelzentriert:** Alle Einträge mit gleicher Beschreibung bilden einen Artikel.
  Ein Artikel kann beliebig viele EANs haben (Marken, Größen).
- **Umbenennen** ändert die Beschreibung aller EANs des Artikels auf einmal;
  existiert der neue Name schon, werden die Artikel nach Rückfrage zusammengeführt.
- **Zu prüfen:** unbekannte EANs (ohne Beschreibung) und automatisch über
  OpenFoodFacts erkannte Einträge (mit Fälligkeitsdatum) – bestätigen, umbenennen
  oder einem bestehenden Artikel zuordnen.
- EANs hinzufügen, verschieben, entfernen, zur Prüfung markieren.
- Die Daten bleiben vollständig in `todo.ean_mapping`; das Panel speichert nichts selbst.

## Datenmodell

| Feld in `todo.ean_mapping` | Bedeutung |
|---|---|
| Zusammenfassung | EAN (wird vom Panel nie verändert) |
| Beschreibung | Artikelname – genau so landet er auf der Einkaufsliste |
| Fälligkeitsdatum | gesetzt = „automatisch erkannt, noch nicht bestätigt“ |

Damit automatisch erkannte Artikel unter „Zu prüfen“ erscheinen, setzt die
Scan-Automatisierung beim Anlegen eines OpenFoodFacts-Treffers
`due_date: "{{ now().date() | string }}"`.

## Installation (HACS)

1. HACS → ⋮ → **Benutzerdefinierte Repositories** →
   `https://github.com/goergch/ha-ean-mapping`, Typ **Integration**.
2. „EAN Mapping“ herunterladen, Home Assistant neu starten.
3. *Einstellungen → Geräte & Dienste → Integration hinzufügen → „EAN Mapping“*.
4. In der Sidebar erscheint **EAN Mapping**.

Voraussetzung: Home Assistant ≥ 2024.7 und eine `local_todo`-Liste mit der
Entity-ID `todo.ean_mapping`.

## Entwicklung

```bash
uv sync                 # Python-Testumgebung
uv run pytest -q        # Integration (Panel-Registrierung, Config-Flow)
npm test                # Logik + Datenzugriff (node --test, keine Abhängigkeiten)

# Oberfläche lokal mit Beispieldaten (ohne Home Assistant)
python3 -m http.server -d . 8765
open http://localhost:8765/dev/preview.html
node dev/check-preview.mjs /tmp/shots   # Szenarien in headless Chrome prüfen
```
