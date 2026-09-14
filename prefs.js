import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gtk from 'gi://Gtk';
import * as Config from 'resource:///org/gnome/Shell/Extensions/js/misc/config.js';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {HOLD_MIN_SHELL_MAJOR, supportsHold} from './lib/shell-version.js';

export default class CursorSpotlightPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        // Track settings signals so they can be disconnected when the
        // prefs window closes (avoids duplicates on reopen).
        const settingsIds = [];
        window.connect('close-request', () => {
            for (const id of settingsIds) {
                try {
                    settings.disconnect(id);
                } catch (e) {
                }
            }
            return false;
        });

        const page = new Adw.PreferencesPage({
            title: 'General',
            icon_name: 'preferences-other-symbolic',
        });
        window.add(page);

        const spotlightGroup = new Adw.PreferencesGroup({
            title: 'Spotlight',
        });
        page.add(spotlightGroup);

        this._addKeybindingRow(window, spotlightGroup, settings, 'toggle', 'Toggle spotlight');

        if (supportsHold(Config.PACKAGE_VERSION)) {
            this._addKeybindingRow(window, spotlightGroup, settings, 'hold',
                'Hold spotlight (momentary)');
        } else {
            const unsupported = new Adw.ActionRow({
                title: 'Hold spotlight',
                subtitle: `Requires GNOME Shell ${HOLD_MIN_SHELL_MAJOR}+`,
            });
            unsupported.sensitive = false;
            spotlightGroup.add(unsupported);
        }

        this._addSpinRow(spotlightGroup, settings, settingsIds, 'dim-opacity',
            'Dim opacity', 'percent', 0, 100);

        this._addSpinRow(spotlightGroup, settings, settingsIds, 'focus-radius',
            'Focus radius', 'pixels', 1, 10000);

        this._addSpinRow(spotlightGroup, settings, settingsIds, 'edge-softness',
            'Edge softness', 'pixels', 0, 500);

        const zoomGroup = new Adw.PreferencesGroup({
            title: 'Zoom',
        });
        page.add(zoomGroup);

        this._addKeybindingRow(window, zoomGroup, settings, 'toggle-zoom', 'Toggle zoom');

        this._addDoubleSpinRow(zoomGroup, settings, settingsIds, 'zoom-factor',
            'Zoom factor', 'x', 1.0, 5.0, 0.05);
    }

    _addKeybindingRow(window, group, settings, key, title) {
        const row = new Adw.ActionRow({title});
        const button = new Gtk.Button({
            label: this._formatAccel(settings.get_strv(key)),
            valign: Gtk.Align.CENTER,
        });
        button.add_css_class('flat');

        button.connect('clicked', () => {
            this._showCaptureDialog(window, settings, key, title, button);
        });

        row.add_suffix(button);
        row.activatable_widget = button;
        group.add(row);
    }

    _showCaptureDialog(window, settings, key, title, button) {
        const heading = `Set ${title}`;
        const body = 'Press a key combination, Esc to cancel, Backspace to clear';
        // Adw.MessageDialog is deprecated since GNOME 47; prefer AlertDialog
        // when it is available so prefs keep working after its removal.
        const hasAlertDialog = Adw.AlertDialog !== undefined;
        const dialog = hasAlertDialog
            ? new Adw.AlertDialog({heading, body})
            : new Adw.MessageDialog({
                transient_for: window,
                modal: true,
                heading,
                body,
            });
        dialog.add_response('cancel', 'Cancel');

        const keyController = new Gtk.EventControllerKey();
        dialog.add_controller(keyController);

        keyController.connect('key-pressed', (_ctrl, keyval, _keycode, state) => {
            if (keyval === Gdk.KEY_Escape) {
                dialog.close();
                return true;
            }
            // Only plain Backspace clears the binding, so Ctrl+Backspace
            // and similar combinations can still be assigned.
            const mods = state & Gtk.accelerator_get_default_mod_mask();
            if (keyval === Gdk.KEY_BackSpace && mods === 0) {
                settings.set_strv(key, []);
                button.set_label(this._formatAccel([]));
                dialog.close();
                return true;
            }

            if (!Gtk.accelerator_valid(keyval, mods))
                return true;

            const accel = Gtk.accelerator_name(keyval, mods);
            settings.set_strv(key, [accel]);
            button.set_label(this._formatAccel([accel]));
            dialog.close();
            return true;
        });

        dialog.connect('response', () => dialog.close());
        if (hasAlertDialog)
            dialog.present(window);
        else
            dialog.present();
    }

    _formatAccel(strv) {
        if (!strv || strv.length === 0) return 'Disabled';
        try {
            const [ok, keyval, mods] = Gtk.accelerator_parse(strv[0]);
            if (ok && keyval !== 0)
                return Gtk.accelerator_get_label(keyval, mods);
        } catch (e) {
            log(`Failed to parse accelerator "${strv[0]}": ${e.message}`);
        }
        return strv[0];
    }

    _addSpinRow(group, settings, settingsIds, key, title, subtitle, min, max) {
        const adjustment = new Gtk.Adjustment({
            lower: min,
            upper: max,
            step_increment: 1,
            page_increment: 10,
            value: settings.get_int(key),
        });
        const row = new Adw.SpinRow({
            title,
            subtitle,
            adjustment,
            digits: 0,
            numeric: true,
        });
        let updating = false;
        adjustment.connect('value-changed', () => {
            if (updating)
                return;
            settings.set_int(key, Math.round(adjustment.get_value()));
        });
        settingsIds.push(settings.connect(`changed::${key}`, () => {
            updating = true;
            row.set_value(settings.get_int(key));
            updating = false;
        }));
        group.add(row);
    }

    _addDoubleSpinRow(group, settings, settingsIds, key, title, subtitle, min, max, step) {
        const adjustment = new Gtk.Adjustment({
            lower: min,
            upper: max,
            step_increment: step,
            page_increment: step * 5,
            value: settings.get_double(key),
        });
        const row = new Adw.SpinRow({
            title,
            subtitle,
            adjustment,
            digits: 2,
            numeric: true,
        });
        let updating = false;
        adjustment.connect('value-changed', () => {
            if (updating)
                return;
            settings.set_double(key, adjustment.get_value());
        });
        settingsIds.push(settings.connect(`changed::${key}`, () => {
            updating = true;
            row.set_value(settings.get_double(key));
            updating = false;
        }));
        group.add(row);
    }
}
