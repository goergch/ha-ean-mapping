// Dünner Datenzugriff auf todo.ean_mapping über die HA-WebSocket-Verbindung.

export const ENTITY_ID = 'todo.ean_mapping';

export class TodoApi {
  constructor(hass) {
    this.hass = hass;
  }

  setHass(hass) {
    this.hass = hass;
  }

  subscribe(onItems) {
    return this.hass.connection.subscribeMessage(
      (event) => onItems(event.items || []),
      { type: 'todo/item/subscribe', entity_id: ENTITY_ID },
    );
  }

  add(summary, description, due) {
    const data = { item: summary, description };
    if (due) data.due_date = due;
    return this._call('add_item', data);
  }

  update(uid, { description, due } = {}) {
    const data = { item: uid };
    if (description !== undefined) data.description = description;
    if (due !== undefined) data.due_date = due;
    return this._call('update_item', data);
  }

  remove(uid) {
    return this._call('remove_item', { item: [uid] });
  }

  // Live geprüft (HA, local_todo): update_item mit due_date: null entfernt das Datum.
  clearDue(item) {
    return this.update(item.uid, { due: null });
  }

  _call(service, data) {
    return this.hass.callService('todo', service, data, { entity_id: ENTITY_ID });
  }
}
