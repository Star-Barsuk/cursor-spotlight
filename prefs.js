// Cursor Spotlight preferences entry point.
//
// Builds the preferences window and delegates the widget construction to the
// modules in prefs/. All settings bounds come from lib/constants.js so the
// preferences UI and the extension enforce the same limits.

import Adw from 'gi://Adw';
import * as Config from 'resource:///org/gnome/Shell/Extensions/js/misc/config.js';
import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    DIM_MAX,
    DIM_MIN,
    EDGE_MAX,
    EDGE_MIN,
    FOCUS_MAX,
    FOCUS_MIN,
    ZOOM_MAX,
    ZOOM_MIN,
} from './lib/constants.js';
import {HOLD_MIN_SHELL_MAJOR, supportsHold} from './lib/shell-version.js';
import {safeDisconnect} from './lib/utils.js';
import {addKeybindingRow} from './prefs/keybinding-row.js';
import {addDoubleSpinRow, addSpinRow} from './prefs/spin-rows.js';

export default class CursorSpotlightPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        this.initTranslations();
        const settings = this.getSettings();
        // Track settings signals so they are disconnected when the window
        // closes (avoids duplicate handlers on reopen).
        const ids = [];
        window.connect('close-request', () => {
            for (const id of ids)
                safeDisconnect(settings, id);
            ids.length = 0;
            return false;
        });

        const page = new Adw.PreferencesPage({
            title: _('General'),
            icon_name: 'preferences-other-symbolic',
        });
        window.add(page);

        const spotlightGroup = new Adw.PreferencesGroup({
            title: _('Spotlight'),
        });
        page.add(spotlightGroup);

        addKeybindingRow(window, spotlightGroup, settings, ids, 'toggle',
            _('Toggle spotlight'));

        if (supportsHold(Config.PACKAGE_VERSION)) {
            addKeybindingRow(window, spotlightGroup, settings, ids, 'hold',
                _('Hold spotlight (momentary)'));
        } else {
            const unsupported = new Adw.ActionRow({
                title: _('Hold spotlight'),
                subtitle: _('Requires GNOME Shell %d+').format(HOLD_MIN_SHELL_MAJOR),
            });
            unsupported.sensitive = false;
            spotlightGroup.add(unsupported);
        }

        addSpinRow(spotlightGroup, settings, ids, 'dim-opacity',
            _('Dim opacity'), _('percent'), DIM_MIN, DIM_MAX);
        addSpinRow(spotlightGroup, settings, ids, 'focus-radius',
            _('Focus radius'), _('pixels'), FOCUS_MIN, FOCUS_MAX);
        addSpinRow(spotlightGroup, settings, ids, 'edge-softness',
            _('Edge softness'), _('pixels'), EDGE_MIN, EDGE_MAX);

        const zoomGroup = new Adw.PreferencesGroup({
            title: _('Zoom'),
        });
        page.add(zoomGroup);

        addKeybindingRow(window, zoomGroup, settings, ids, 'toggle-zoom',
            _('Toggle zoom'));
        addDoubleSpinRow(zoomGroup, settings, ids, 'zoom-factor',
            _('Zoom factor'), _('x'), ZOOM_MIN, ZOOM_MAX, 0.05);
    }
}
