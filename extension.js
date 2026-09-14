// Cursor Spotlight extension entry point.
//
// This file only wires the shell lifecycle to the controller: it creates the
// controller, registers the three keybindings and removes everything again on
// disable(). All runtime logic lives in lib/ modules so this class stays small
// and its cleanup is easy to review.

import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {HOLD_MIN_SHELL_MAJOR, supportsHold} from './lib/shell-version.js';
import {SpotlightController} from './lib/spotlight.js';
import {logError} from './lib/utils.js';

// TRIGGER_RELEASE exists since mutter 47; the fallback keeps the import safe
// on GNOME 45-46 where the flag is absent.
const TRIGGER_RELEASE = Meta.KeyBindingFlags.TRIGGER_RELEASE ?? 0;
const ACTION_MODE = Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW;

export default class CursorSpotlightExtension extends Extension {
    enable() {
        this.initTranslations();
        this._settings = this.getSettings();
        this._controller = new SpotlightController(this._settings);

        this._toggleHandler = () => this._controller?.toggle();
        this._zoomHandler = () => this._controller?.toggleZoom();
        this._holdHandler = (display, window, event) => {
            if (!this._controller)
                return;
            // The binding is registered with TRIGGER_RELEASE, so this runs
            // once per press and once per release; tell them apart by event
            // type. Older shells never register the hold binding.
            const type = event && typeof event.type === 'function' ? event.type() : null;
            if (type === Clutter.EventType.KEY_PRESS)
                this._controller.setHoldActive(true);
            else if (type === Clutter.EventType.KEY_RELEASE)
                this._controller.setHoldActive(false);
            else
                console.debug('[spotlight] hold hotkey fired without a usable key event; ignored');
        };

        Main.wm.addKeybinding('toggle', this._settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT, ACTION_MODE, this._toggleHandler);
        Main.wm.addKeybinding('toggle-zoom', this._settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT, ACTION_MODE, this._zoomHandler);

        this._holdSupported = supportsHold(Config.PACKAGE_VERSION);
        if (this._holdSupported) {
            Main.wm.addKeybinding('hold', this._settings,
                Meta.KeyBindingFlags.IGNORE_AUTOREPEAT | TRIGGER_RELEASE, ACTION_MODE,
                this._holdHandler);
        } else {
            console.debug(`[spotlight] hold hotkey unavailable on GNOME Shell ` +
                `${Config.PACKAGE_VERSION}; requires ${HOLD_MIN_SHELL_MAJOR}+`);
        }
    }

    disable() {
        this._removeKeybinding('toggle');
        this._removeKeybinding('toggle-zoom');
        if (this._holdSupported)
            this._removeKeybinding('hold');

        this._controller?.destroy();
        this._controller = null;
        this._settings = null;
        this._toggleHandler = null;
        this._zoomHandler = null;
        this._holdHandler = null;
        this._holdSupported = false;
    }

    _removeKeybinding(name) {
        try {
            Main.wm.removeKeybinding(name);
        } catch (e) {
            logError(`remove keybinding ${name}`, e);
        }
    }
}
