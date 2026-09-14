// Pointer polling loop.
//
// A repeating GLib timeout reads the pointer while the spotlight is active
// and forwards every successful read to the controller. Polling is used on
// purpose: motion events are consumed by whichever actor has the grab, so an
// event-driven tracker would miss movement over some shell surfaces. The
// source lifetime is owned entirely by this class.

import GLib from 'gi://GLib';

import {TIMER_INTERVAL_MS} from './constants.js';
import {logError} from './utils.js';

export class PointerTracker {
    constructor(onMove) {
        this._onMove = onMove;
        this._timerId = null;
        this._x = 0;
        this._y = 0;
    }

    get x() {
        return this._x;
    }

    get y() {
        return this._y;
    }

    // Read the pointer once, outside the loop (used when the spotlight is
    // switched on so the first frame is already under the cursor).
    refresh() {
        try {
            const [x, y] = global.get_pointer();
            if (Number.isFinite(x) && Number.isFinite(y)) {
                this._x = x;
                this._y = y;
            }
        } catch (e) {
            logError('get_pointer', e);
        }
    }

    start() {
        if (this._timerId)
            return;
        this._timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, TIMER_INTERVAL_MS, () => {
            try {
                const [x, y] = global.get_pointer();
                if (Number.isFinite(x) && Number.isFinite(y)) {
                    this._x = x;
                    this._y = y;
                    this._onMove(x, y);
                }
            } catch (e) {
                logError('pointer tick', e);
            }
            return GLib.SOURCE_CONTINUE;
        });
    }

    stop() {
        if (!this._timerId)
            return;
        GLib.source_remove(this._timerId);
        this._timerId = null;
    }

    destroy() {
        this.stop();
        this._onMove = null;
    }
}
