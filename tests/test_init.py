from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.ean_mapping.const import DOMAIN

PANEL = "ean-mapping"


async def _setup(hass: HomeAssistant) -> MockConfigEntry:
    await async_setup_component(hass, "http", {})
    entry = MockConfigEntry(domain=DOMAIN, title="EAN Mapping")
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


async def test_setup_registers_panel(hass: HomeAssistant) -> None:
    await _setup(hass)
    panel = hass.data["frontend_panels"][PANEL]
    cfg = panel.config["_panel_custom"]
    assert cfg["name"] == "ean-mapping-panel"
    assert cfg["module_url"].startswith("/ean_mapping_frontend/ean-mapping-panel.js?v=0.1.0")
    assert panel.sidebar_title == "EAN Mapping"
    assert panel.sidebar_icon == "mdi:barcode"
    assert panel.require_admin is False


async def test_static_js_served(hass: HomeAssistant, hass_client) -> None:
    await _setup(hass)
    client = await hass_client()
    resp = await client.get("/ean_mapping_frontend/ean-mapping-panel.js")
    assert resp.status == 200


async def test_unload_removes_panel(hass: HomeAssistant) -> None:
    entry = await _setup(hass)
    assert await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()
    assert PANEL not in hass.data["frontend_panels"]


async def test_reload_does_not_fail(hass: HomeAssistant) -> None:
    entry = await _setup(hass)
    assert await hass.config_entries.async_unload(entry.entry_id)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    assert PANEL in hass.data["frontend_panels"]
