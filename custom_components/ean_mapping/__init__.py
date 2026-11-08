"""EAN Mapping: registriert ein Sidebar-Panel zur Pflege von todo.ean_mapping."""

from __future__ import annotations

from pathlib import Path

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.loader import async_get_integration

from .const import (
    DOMAIN,
    PANEL_COMPONENT,
    PANEL_ICON,
    PANEL_TITLE,
    PANEL_URL_PATH,
    STATIC_URL,
)

FRONTEND_DIR = Path(__file__).parent / "frontend"


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    integration = await async_get_integration(hass, DOMAIN)
    # Versionierter Pfad: auch die relativen Imports des Panels (mapping-logic.js,
    # todo-api.js) bekommen so nach jedem Update eine neue URL (Cache-Busting).
    base_url = f"{STATIC_URL}/{integration.version}"

    data = hass.data.setdefault(DOMAIN, {})
    if data.get("static_registered") != base_url:
        await hass.http.async_register_static_paths(
            [StaticPathConfig(base_url, str(FRONTEND_DIR), cache_headers=False)]
        )
        data["static_registered"] = base_url

    await panel_custom.async_register_panel(
        hass,
        webcomponent_name=PANEL_COMPONENT,
        frontend_url_path=PANEL_URL_PATH,
        module_url=f"{base_url}/{PANEL_COMPONENT}.js",
        sidebar_title=PANEL_TITLE,
        sidebar_icon=PANEL_ICON,
        require_admin=False,
    )
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    frontend.async_remove_panel(hass, PANEL_URL_PATH)
    return True
