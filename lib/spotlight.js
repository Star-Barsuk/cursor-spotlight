// Spotlight controller.
//
// Owns the runtime state (latched toggle, momentary hold, zoom), the cached
// settings, the pointer tracker and the two actors (dim overlay + zoom lens).
// It also orchestrates visibility: the spotlight hides while the overview or
// the lock screen is visible and is restored afterwards without changing the
// toggle state.
//
// This class is the single owner of every resource it creates (settings
// signals, shell signals, the tracker timer, both actors), so teardown is
// self-contained.

import Shell from 'gi://Shell';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {
    clampDouble,
    clampInt,
    DEFAULT_DIM,
    DEFAULT_EDGE,
    DEFAULT_FOCUS,
    DEFAULT_ZOOM,
    DIM_MAX,
    DIM_MIN,
    EDGE_MAX,
    EDGE_MIN,
    FOCUS_MAX,
    FOCUS_MIN,
    ZOOM_MAX,
    ZOOM_MIN,
} from './constants.js';
import {getDouble, getInt, logError, safeDisconnect} from './utils.js';
import {PointerTracker} from './pointer-tracker.js';
import {SpotlightOverlay} from './overlay.js';
import {ZoomLens} from './lens.js';

export class SpotlightController {
    constructor(settings) {
        this._settings = settings;

        // The effective state is the union of the latched toggle and the
        // momentary hold, so the two hotkeys never cancel each other.
        this._active = false;
        this._toggleActive = false;
        this._holdActive = false;
        this._zoomActive = false;
        this._lastPaint = null;

        // [object, signalId] pairs so every shell signal is disconnected
        // from the object it was connected to.
        this._shellSignals = [];
        this._settingsIds = [];

        this._reloadSettings();

        this._tracker = new PointerTracker((x, y) => this.updatePointer(x, y));
        this._overlay = new SpotlightOverlay();
        this._lens = new ZoomLens(Main.layoutManager.uiGroup);

        this._mountActors();
        this._refreshPointer();

        this._applyMask();
        this._connectSettings();
        this._connectShell();
    }

    _mountActors() {
        // Mount on the stage, above uiGroup: the lens clones uiGroup, so
        // neither actor may live inside it or the clone would show them
        // (feedback loop). Visibility stays ours; input never reaches them.
        global.stage.add_child(this._lens.actor);
        global.stage.add_child(this._overlay.actor);
        global.stage.set_child_above_sibling(this._overlay.actor, this._lens.actor);
        Shell.util_set_hidden_from_pick(this._overlay.actor, true);
        Shell.util_set_hidden_from_pick(this._lens.actor, true);
    }

    // Settings are cached so the 60 fps repaint path does no GSettings I/O.
    _reloadSettings() {
        this._dimOpacity = clampInt(getInt(this._settings, 'dim-opacity', DEFAULT_DIM),
            DIM_MIN, DIM_MAX, DEFAULT_DIM) / 100;
        this._focusRadius = clampInt(getInt(this._settings, 'focus-radius', DEFAULT_FOCUS),
            FOCUS_MIN, FOCUS_MAX, DEFAULT_FOCUS);
        this._edgeSoftness = clampInt(getInt(this._settings, 'edge-softness', DEFAULT_EDGE),
            EDGE_MIN, EDGE_MAX, DEFAULT_EDGE);
        this._zoomFactor = clampDouble(getDouble(this._settings, 'zoom-factor', DEFAULT_ZOOM),
            ZOOM_MIN, ZOOM_MAX, DEFAULT_ZOOM);
    }

    // Feather and inner stop shared by the overlay hole and the lens mask so
    // their soft edges line up. The ratios are scale-independent.
    _maskParams() {
        const radius = Math.max(1, this._focusRadius);
        const feather = Math.min(radius, Math.max(0, this._edgeSoftness));
        return {
            radius,
            innerStop: Math.max(0, 1 - feather / radius),
        };
    }

    _applyMask() {
        const {radius, innerStop} = this._maskParams();
        this._lens.setMask({
            width: radius * 2,
            height: radius * 2,
            radius,
            innerStop,
        });
    }

    _isObscured() {
        if (Main.overview.visible)
            return true;
        if (Main.sessionMode && Main.sessionMode.isLocked)
            return true;
        if (Main.screenShield && Main.screenShield.locked)
            return true;
        return false;
    }

    _refreshPointer() {
        this._tracker.refresh();
    }

    _stageBounds() {
        // Union of all monitors: the stage size is wrong when a monitor sits
        // left of or above the primary (negative coordinates).
        const monitors = Main.layoutManager.monitors;
        if (!monitors || monitors.length === 0)
            return [0, 0, global.stage.width, global.stage.height];
        let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
        for (const m of monitors) {
            x1 = Math.min(x1, m.x);
            y1 = Math.min(y1, m.y);
            x2 = Math.max(x2, m.x + m.width);
            y2 = Math.max(y2, m.y + m.height);
        }
        if (!Number.isFinite(x1) || x2 <= x1 || y2 <= y1)
            return [0, 0, global.stage.width, global.stage.height];
        return [x1, y1, x2 - x1, y2 - y1];
    }

    _updateSize() {
        const [x, y, width, height] = this._stageBounds();
        if (this._overlay.x === x && this._overlay.y === y &&
            this._overlay.width === width && this._overlay.height === height)
            return;
        this._overlay.setBounds(x, y, width, height);
        this._lastPaint = null;
    }

    _queueRepaint() {
        this._overlay.setPaintParams(
            this._tracker.x, this._tracker.y,
            this._dimOpacity, this._focusRadius, this._edgeSoftness);
        this._overlay.queueRepaint();
    }

    _updateLens(force = false) {
        if (!this._active || !this._zoomActive)
            return;
        if (force)
            this._lens.invalidate();
        this._lens.update(this._tracker.x, this._tracker.y,
            Math.max(1, this._focusRadius), this._zoomFactor);
    }

    _syncLens(force = false) {
        if (this._active && this._zoomActive && !this._isObscured()) {
            this._updateLens(force);
            this._lens.show();
        } else {
            this._lens.hide();
        }
    }

    _syncVisibility() {
        if (this._active && !this._isObscured()) {
            this._updateSize();
            this._overlay.show();
            this._lastPaint = null;
            this._queueRepaint();
        } else {
            this._overlay.hide();
        }
    }

    toggle() {
        this._toggleActive = !this._toggleActive;
        this._applyActive();
        console.debug(`[spotlight] toggle latched=${this._toggleActive} active=${this._active}`);
    }

    setHoldActive(active) {
        active = !!active;
        if (active === this._holdActive)
            return;
        this._holdActive = active;
        this._applyActive();
        console.debug(`[spotlight] hold ${active ? 'pressed' : 'released'} active=${this._active}`);
    }

    // Safety net for a swallowed key release (overview, lock screen): clear
    // the momentary state without disturbing the latch.
    _releaseHold() {
        if (!this._holdActive)
            return;
        this._holdActive = false;
        this._applyActive();
        console.debug(`[spotlight] hold state cleared active=${this._active}`);
    }

    _applyActive() {
        const want = this._toggleActive || this._holdActive;
        if (want === this._active)
            return;
        if (want)
            this._activate();
        else
            this._deactivate();
    }

    _activate() {
        this._active = true;
        // Read the pointer now so the first visible frame already has the
        // hole under the cursor (no flash at the old position).
        this._refreshPointer();
        this._lastPaint = null;
        this._lens.invalidate();
        this._updateSize();
        this._tracker.start();
        this._syncVisibility();
        this._syncLens(true);
    }

    _deactivate() {
        this._active = false;
        this._zoomActive = false;
        this._tracker.stop();
        this._lastPaint = null;
        this._lens.invalidate();
        this._syncVisibility();
        this._syncLens(true);
    }

    toggleZoom() {
        console.debug(`[spotlight] toggleZoom active=${this._active} zoomActive=${this._zoomActive} zoomFactor=${this._zoomFactor}`);
        if (!this._active) {
            Main.notify(_('Cursor Spotlight'), _('Turn on the spotlight first, then toggle zoom.'));
            return;
        }
        this._zoomActive = !this._zoomActive;
        if (this._zoomActive)
            this._refreshPointer();
        this._syncLens(true);
    }

    updatePointer(x, y) {
        if (!this._active || this._isObscured())
            return;
        if (this._lastPaint && x === this._lastPaint[0] && y === this._lastPaint[1])
            return;
        this._lastPaint = [x, y];
        this._queueRepaint();
        // The lens is GPU-composited: only its transform changes.
        if (this._zoomActive)
            this._updateLens();
    }

    _connectSettings() {
        const watch = (key, handler) => {
            this._settingsIds.push(this._settings.connect(`changed::${key}`, handler));
        };

        watch('dim-opacity', () => {
            this._reloadSettings();
            if (this._active)
                this._queueRepaint();
        });
        watch('focus-radius', () => {
            this._reloadSettings();
            this._lastPaint = null;
            this._lens.invalidate();
            if (this._active)
                this._queueRepaint();
            this._applyMask();
            this._updateLens(true);
        });
        watch('edge-softness', () => {
            this._reloadSettings();
            if (this._active)
                this._queueRepaint();
            this._applyMask();
            this._updateLens(true);
        });
        watch('zoom-factor', () => {
            this._reloadSettings();
            this._lens.invalidate();
            this._updateLens(true);
        });
    }

    _disconnectSettings() {
        for (const id of this._settingsIds)
            safeDisconnect(this._settings, id);
        this._settingsIds = [];
    }

    _connectShell() {
        const track = (object, id) => {
            this._shellSignals.push([object, id]);
        };

        track(Main.layoutManager, Main.layoutManager.connect('monitors-changed', () => {
            this._lastPaint = null;
            this._lens.invalidate();
            if (this._active && !this._isObscured()) {
                this._updateSize();
                this._queueRepaint();
                this._updateLens(true);
            }
        }));

        // Opening the overview or locking the screen can swallow the key
        // release of a held hotkey; drop the hold state so it cannot stick.
        track(Main.overview, Main.overview.connect('showing', () => {
            this._releaseHold();
            this._overlay.hide();
            this._lens.hide();
        }));
        track(Main.overview, Main.overview.connect('hidden', () => {
            this._lastPaint = null;
            this._syncVisibility();
            this._syncLens(true);
        }));

        if (Main.screenShield) {
            try {
                track(Main.screenShield, Main.screenShield.connect('locked', () => {
                    this._releaseHold();
                    this._overlay.hide();
                    this._lens.hide();
                }));
            } catch (e) {
                logError('connect screenShield::locked', e);
            }
            try {
                track(Main.screenShield, Main.screenShield.connect('unlocked', () => {
                    this._lastPaint = null;
                    this._syncVisibility();
                    this._syncLens(true);
                }));
            } catch (e) {
                logError('connect screenShield::unlocked', e);
            }
        }
    }

    _disconnectShell() {
        for (const [object, id] of this._shellSignals)
            safeDisconnect(object, id);
        this._shellSignals = [];
    }

    destroy() {
        this._active = false;
        this._toggleActive = false;
        this._holdActive = false;
        this._zoomActive = false;

        this._tracker.destroy();
        this._disconnectSettings();
        this._disconnectShell();

        this._lens.destroy();
        this._overlay.destroy();

        this._settings = null;
    }
}
