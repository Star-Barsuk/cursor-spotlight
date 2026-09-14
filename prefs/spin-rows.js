// Integer and floating-point preference spin rows.
//
// Each row writes to its GSettings key on change and updates itself when the
// key changes elsewhere, guarding against the echo of its own write.

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

export function addSpinRow(group, settings, ids, key, title, subtitle, min, max) {
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
    ids.push(settings.connect(`changed::${key}`, () => {
        updating = true;
        row.set_value(settings.get_int(key));
        updating = false;
    }));
    group.add(row);
}

export function addDoubleSpinRow(group, settings, ids, key, title, subtitle, min, max, step) {
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
    ids.push(settings.connect(`changed::${key}`, () => {
        updating = true;
        row.set_value(settings.get_double(key));
        updating = false;
    }));
    group.add(row);
}
