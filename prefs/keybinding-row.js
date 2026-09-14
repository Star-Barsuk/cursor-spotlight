// Keybinding preference row and capture dialog.
//
// Builds an Adw.ActionRow with a flat button showing the current accelerator
// and a modal dialog that records a new one. The row listens to settings so
// it stays in sync when the binding changes outside this window.

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gtk from 'gi://Gtk';
import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export function addKeybindingRow(window, group, settings, ids, key, title) {
    const row = new Adw.ActionRow({title});
    const button = new Gtk.Button({
        label: formatAccel(settings.get_strv(key)),
        valign: Gtk.Align.CENTER,
    });
    button.add_css_class('flat');

    button.connect('clicked', () => {
        showCaptureDialog(window, settings, key, title, button);
    });

    row.add_suffix(button);
    row.activatable_widget = button;
    group.add(row);

    ids.push(settings.connect(`changed::${key}`, () => {
        button.set_label(formatAccel(settings.get_strv(key)));
    }));
}

function showCaptureDialog(window, settings, key, title, button) {
    const heading = _('Set %s').format(title);
    const body = _('Press a key combination, Esc to cancel, Backspace to clear');
    // Adw.MessageDialog is deprecated since GNOME 47; prefer AlertDialog
    // when available so preferences keep working after its removal.
    const hasAlertDialog = Adw.AlertDialog !== undefined;
    const dialog = hasAlertDialog
        ? new Adw.AlertDialog({heading, body})
        : new Adw.MessageDialog({
            transient_for: window,
            modal: true,
            heading,
            body,
        });
    dialog.add_response('cancel', _('Cancel'));

    const keyController = new Gtk.EventControllerKey();
    dialog.add_controller(keyController);

    keyController.connect('key-pressed', (_ctrl, keyval, _keycode, state) => {
        if (keyval === Gdk.KEY_Escape) {
            dialog.close();
            return true;
        }
        // Only plain Backspace clears the binding, so Ctrl+Backspace and
        // similar combinations can still be assigned.
        const mods = state & Gtk.accelerator_get_default_mod_mask();
        if (keyval === Gdk.KEY_BackSpace && mods === 0) {
            settings.set_strv(key, []);
            button.set_label(formatAccel([]));
            dialog.close();
            return true;
        }

        if (!Gtk.accelerator_valid(keyval, mods))
            return true;

        const accel = Gtk.accelerator_name(keyval, mods);
        settings.set_strv(key, [accel]);
        button.set_label(formatAccel([accel]));
        dialog.close();
        return true;
    });

    dialog.connect('response', () => dialog.close());
    if (hasAlertDialog)
        dialog.present(window);
    else
        dialog.present();
}

function formatAccel(strv) {
    if (!strv || strv.length === 0)
        return _('Disabled');
    try {
        const [ok, keyval, mods] = Gtk.accelerator_parse(strv[0]);
        if (ok && keyval !== 0)
            return Gtk.accelerator_get_label(keyval, mods);
    } catch (e) {
        log(`Failed to parse accelerator "${strv[0]}": ${e.message}`);
    }
    return strv[0];
}
