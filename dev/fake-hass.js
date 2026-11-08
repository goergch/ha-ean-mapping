// In-Memory-Ersatz für das HA-`hass`-Objekt (nur für dev/preview.html).
// Unterstützt todo/item/subscribe sowie todo.add_item / update_item / remove_item
// in den Formaten, die todo-api.js sendet.

export function createFakeHass(initialItems) {
  let items = initialItems.map((i) => ({ status: 'needs_action', ...i }));
  let seq = 0;
  const listeners = new Set();
  const push = () => {
    const snapshot = items.map((i) => ({ ...i }));
    queueMicrotask(() => listeners.forEach((cb) => cb({ items: snapshot })));
  };
  const find = (ref) => items.find((i) => i.uid === ref || i.summary === ref);

  const hass = {
    log: [],
    connection: {
      async subscribeMessage(cb, msg) {
        if (msg.type !== 'todo/item/subscribe') throw new Error(`unsupported ${msg.type}`);
        listeners.add(cb);
        push();
        return () => listeners.delete(cb);
      },
    },
    async callService(domain, service, data, target) {
      hass.log.push({ domain, service, data, target });
      await new Promise((r) => setTimeout(r, 30));
      if (domain !== 'todo' || target?.entity_id !== 'todo.ean_mapping') throw new Error('unexpected target');
      if (service === 'add_item') {
        const item = { uid: `fake-${++seq}`, summary: data.item, status: 'needs_action' };
        if (data.description !== undefined) item.description = data.description;
        if (data.due_date) item.due = data.due_date;
        items.push(item);
      } else if (service === 'update_item') {
        const item = find(data.item);
        if (!item) throw new Error(`Eintrag ${data.item} nicht gefunden`);
        if (data.description !== undefined) item.description = data.description;
        if (data.due_date === null) delete item.due;
        else if (data.due_date !== undefined) item.due = data.due_date;
      } else if (service === 'remove_item') {
        const refs = [].concat(data.item);
        items = items.filter((i) => !refs.includes(i.uid) && !refs.includes(i.summary));
      } else {
        throw new Error(`unsupported service ${service}`);
      }
      push();
    },
    // Nur Vorschau: simuliert einen frischen Scan einer unbekannten EAN.
    simulateScan(ean) {
      items.push({ uid: `fake-${++seq}`, summary: ean, status: 'needs_action' });
      push();
    },
  };
  return hass;
}
