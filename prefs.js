import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class CursorSpotlightPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage({
            title: 'General',
            icon_name: 'preferences-other-symbolic',
        });
        window.add(page);

        const spotlightGroup = new Adw.PreferencesGroup({
            title: 'Spotlight',
        });
        page.add(spotlightGroup);

        this._addKeybindingRow(spotlightGroup, settings, 'toggle', 'Toggle spotlight');

        this._addSpinRow(spotlightGroup, settings, 'dim-opacity',
            'Dim opacity', 'percent', 0, 100);

        this._addSpinRow(spotlightGroup, settings, 'focus-width',
            'Focus width', 'pixels', 1, 10000);

        this._addSpinRow(spotlightGroup, settings, 'focus-height',
            'Focus height', 'pixels', 1, 10000);

        this._addSpinRow(spotlightGroup, settings, 'edge-softness',
            'Edge softness', 'pixels', 0, 500);

        const zoomGroup = new Adw.PreferencesGroup({
            title: 'Zoom',
        });
        page.add(zoomGroup);

        this._addKeybindingRow(zoomGroup, settings, 'toggle-zoom', 'Toggle zoom');

        this._addDoubleSpinRow(zoomGroup, settings, 'zoom-factor',
            'Zoom factor', 'x', 1.0, 5.0, 0.05);
    }

    _addKeybindingRow(group, settings, key, title) {
        const row = new Adw.ActionRow({title});
        const button = new Gtk.Button({
            label: this._formatAccel(settings.get_strv(key)),
            valign: Gtk.Align.CENTER,
        });
        button.add_css_class('flat');

        const dialog = new Gtk.ShortcutDialog({
            modal: true,
            transient_for: group.get_root(),
        });

        const controller = new Gtk.ShortcutController({
            scope: Gtk.ShortcutScope.MANAGED,
        });
        dialog.add_controller(controller);

        const shortcutLabel = new Gtk.ShortcutLabel({
            accelerator: this._formatAccel(settings.get_strv(key)),
        });
        dialog.set_child(shortcutLabel);

        controller.connect('accel-changed', (_ctrl, accel) => {
            settings.set_strv(key, [accel]);
            button.set_label(this._formatAccel(settings.get_strv(key)));
            shortcutLabel.set_accelerator(accel);
            dialog.close();
            return true;
        });

        button.connect('clicked', () => {
            shortcutLabel.set_accelerator(this._formatAccel(settings.get_strv(key)));
            dialog.present();
        });

        row.add_suffix(button);
        row.activatable_widget = button;
        group.add(row);
    }

    _formatAccel(strv) {
        if (!strv || strv.length === 0) return '';
        try {
            const [keyval, mods] = Gtk.accelerator_parse(strv[0]);
            if (keyval !== 0)
                return Gtk.accelerator_get_label(keyval, mods);
        } catch (e) {
            log(`Failed to parse accelerator "${strv[0]}": ${e.message}`);
        }
        return strv[0];
    }

    _addSpinRow(group, settings, key, title, suffix, min, max) {
        const row = new Adw.SpinRow({
            title,
            subtitle: suffix,
            adjustment: new Gtk.Adjustment({
                lower: min,
                upper: max,
                step_increment: 1,
                page_increment: 10,
                value: settings.get_int(key),
            }),
        });
        settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
        group.add(row);
    }

    _addDoubleSpinRow(group, settings, key, title, suffix, min, max, step) {
        const row = new Adw.SpinRow({
            title,
            subtitle: suffix,
            adjustment: new Gtk.Adjustment({
                lower: min,
                upper: max,
                step_increment: step,
                page_increment: 0.25,
                value: settings.get_double(key),
            }),
        });
        settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
        group.add(row);
    }
}
