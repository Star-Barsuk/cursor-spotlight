import Cairo from 'cairo';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const TIMER_INTERVAL_MS = 16;

// Hardening limits for values that can arrive via dconf (schema has
// no upper bound for focus/edge). prefs.js caps at the same numbers.
const FOCUS_MIN = 1;
const FOCUS_MAX = 10000;
const EDGE_MIN = 0;
const EDGE_MAX = 2000;
const DIM_MIN = 0;
const DIM_MAX = 100;
const ZOOM_MIN = 1.0;
const ZOOM_MAX = 5.0;

function clampInt(value, min, max, fallback) {
    if (!Number.isFinite(value))
        return fallback;
    return Math.max(min, Math.min(max, Math.round(value)));
}

function clampDouble(value, min, max, fallback) {
    if (!Number.isFinite(value))
        return fallback;
    return Math.max(min, Math.min(max, value));
}

class SpotlightOverlay {
    constructor(settings) {
        this._settings = settings;
        this._active = false;
        this._zoomActive = false;
        this._pointerX = 0;
        this._pointerY = 0;
        this._lastPaintX = null;
        this._lastPaintY = null;
        this._lastLensKey = null;
        this._timerId = null;
        this._destroyed = false;

        this._reloadSettings();
        this._cachedGradient = null;
        this._cachedInnerStop = -1;

        this._actor = new St.DrawingArea({
            reactive: false,
            x: 0,
            y: 0,
        });
        this._actor.hide();
        this._addToChrome();
        this._createLens();
        this._refreshPointer();

        this._monitorsChangedId = Main.layoutManager.connect('monitors-changed', () => {
            // Forget last paint so the next tick repaints even if the
            // pointer did not move (geometry changed).
            this._lastPaintX = null;
            this._lastPaintY = null;
            this._lastLensKey = null;
            if (this._active && !this._isObscured()) {
                this._updateSize();
                this._actor.queue_repaint();
                this._updateLens(true);
            }
        });

        // The overlay must stay hidden while the overview is visible
        // (Super / Show Apps open the overview). It is reshown when the
        // overview hides, but only if the spotlight is still active.
        // The zoom lens follows the same rule. The same applies to the
        // lock screen.
        this._overviewShowingId = Main.overview.connect('showing', () => {
            this._actor.hide();
            this._lens.hide();
        });
        this._overviewHiddenId = Main.overview.connect('hidden', () => {
            this._lastPaintX = null;
            this._lastPaintY = null;
            this._syncVisibility();
            this._syncLens(true);
        });

        this._screenLockedId = null;
        this._screenUnlockedId = null;
        if (Main.screenShield) {
            try {
                this._screenLockedId = Main.screenShield.connect('locked', () => {
                    this._actor.hide();
                    if (this._lens)
                        this._lens.hide();
                });
            } catch (e) {
                this._screenLockedId = null;
            }
            try {
                this._screenUnlockedId = Main.screenShield.connect('unlocked', () => {
                    this._lastPaintX = null;
                    this._lastPaintY = null;
                    this._syncVisibility();
                    this._syncLens(true);
                });
            } catch (e) {
                this._screenUnlockedId = null;
            }
        }

        this._repaintId = this._actor.connect('repaint', (area) => {
            this._onRepaint(area);
        });

        this._connectSettings();
    }

    _addToChrome() {
        // Plain addChrome on purpose: no trackFullscreen (the layout
        // manager would own actor.visible and resurrect a hidden overlay
        // on overview show/hide) and no affectsInputRegion (removed in
        // GNOME 50 with X11 support; the actor is reactive:false anyway).
        Main.layoutManager.addChrome(this._actor);
    }

    _createLens() {
        // Zoom lens: a live GPU-composited clone of the window group
        // (app windows + background, but not the dim overlay itself,
        // so there is no feedback loop). It sits directly below the
        // overlay: the overlay dims the lens everywhere except the
        // spotlight hole, where the magnified content shows through.
        this._lens = new Clutter.Actor({
            reactive: false,
            clip_to_allocation: true,
            visible: false,
        });
        this._lensClone = new Clutter.Clone({source: global.window_group});
        this._lensClone.set_pivot_point(0, 0);
        this._lens.add_child(this._lensClone);
        Main.layoutManager.uiGroup.add_child(this._lens);
        Main.layoutManager.uiGroup.set_child_below_sibling(this._lens, this._actor);
    }

    _reloadSettings() {
        // Cache settings so the 60fps repaint path does no GSettings I/O.
        // Values are clamped: dconf can hold anything within the schema
        // range (which has no upper bound for focus/edge).
        let dim, fw, fh, edge, zoom;
        try {
            dim = this._settings.get_int('dim-opacity');
        } catch (e) {
            dim = 75;
        }
        try {
            fw = this._settings.get_int('focus-width');
        } catch (e) {
            fw = 260;
        }
        try {
            fh = this._settings.get_int('focus-height');
        } catch (e) {
            fh = 180;
        }
        try {
            edge = this._settings.get_int('edge-softness');
        } catch (e) {
            edge = 56;
        }
        try {
            zoom = this._settings.get_double('zoom-factor');
        } catch (e) {
            zoom = 1.25;
        }
        this._dimOpacity = clampInt(dim, DIM_MIN, DIM_MAX, 75) / 100;
        this._focusW = clampInt(fw, FOCUS_MIN, FOCUS_MAX, 260);
        this._focusH = clampInt(fh, FOCUS_MIN, FOCUS_MAX, 180);
        this._edgeSoftness = clampInt(edge, EDGE_MIN, EDGE_MAX, 56);
        this._zoomFactor = clampDouble(zoom, ZOOM_MIN, ZOOM_MAX, 1.25);
        // Gradient depends only on innerStop: invalidate the cache.
        this._cachedInnerStop = -1;
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
        try {
            const [x, y] = global.get_pointer();
            if (Number.isFinite(x) && Number.isFinite(y)) {
                this._pointerX = x;
                this._pointerY = y;
            }
        } catch (e) {
            // Keep the last known position on failure.
        }
    }

    _ensureTimer() {
        if (this._timerId || this._destroyed)
            return;
        this._timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, TIMER_INTERVAL_MS, () => {
            if (this._destroyed)
                return GLib.SOURCE_REMOVE;
            try {
                const [x, y] = global.get_pointer();
                this.updatePointer(x, y);
            } catch (e) {
                // Ignore one-off pointer read failures.
            }
            return GLib.SOURCE_CONTINUE;
        });
    }

    _stopTimer() {
        if (this._timerId) {
            GLib.source_remove(this._timerId);
            this._timerId = null;
        }
    }

    _updateLens(force = false) {
        if (!this._active || !this._zoomActive)
            return;
        const w = Math.max(1, this._focusW);
        const h = Math.max(1, this._focusH);
        const z = this._zoomFactor;
        // Overscan by the feather size so the hard rectangle edge of the
        // clone never shows as a seam inside the soft ellipse edge.
        const overscan = Math.min(Math.min(w, h) / 2, this._edgeSoftness + 2);
        const lw = w + overscan * 2;
        const lh = h + overscan * 2;
        const key = `${Math.round(this._pointerX)}|${Math.round(this._pointerY)}|${lw}|${lh}|${z}`;
        if (!force && key === this._lastLensKey)
            return;
        this._lastLensKey = key;
        this._lens.set_position(this._pointerX - lw / 2, this._pointerY - lh / 2);
        this._lens.set_size(lw, lh);
        this._lensClone.set_scale(z, z);
        this._lensClone.set_position(lw / 2 - this._pointerX * z, lh / 2 - this._pointerY * z);
    }

    _syncLens(force = false) {
        if (this._active && this._zoomActive && !this._isObscured()) {
            this._updateLens(force);
            this._lens.show();
        } else {
            this._lens.hide();
        }
    }

    _connectSettings() {
        this._dimOpacityId = this._settings.connect('changed::dim-opacity', () => {
            this._reloadSettings();
            if (this._active) this._actor.queue_repaint();
        });
        this._focusWidthId = this._settings.connect('changed::focus-width', () => {
            this._reloadSettings();
            this._lastPaintX = null;
            this._lastLensKey = null;
            if (this._active) this._actor.queue_repaint();
            this._updateLens();
        });
        this._focusHeightId = this._settings.connect('changed::focus-height', () => {
            this._reloadSettings();
            this._lastPaintX = null;
            this._lastLensKey = null;
            if (this._active) this._actor.queue_repaint();
            this._updateLens();
        });
        this._edgeSoftnessId = this._settings.connect('changed::edge-softness', () => {
            this._reloadSettings();
            if (this._active) this._actor.queue_repaint();
            this._updateLens();
        });
        this._zoomFactorId = this._settings.connect('changed::zoom-factor', () => {
            this._reloadSettings();
            this._updateLens();
        });
    }

    _disconnectSettings() {
        if (!this._settings)
            return;
        for (const id of [this._dimOpacityId, this._focusWidthId,
            this._focusHeightId, this._edgeSoftnessId, this._zoomFactorId]) {
            if (id) {
                try {
                    this._settings.disconnect(id);
                } catch (e) {
                    // Already disconnected during teardown.
                }
            }
        }
        this._dimOpacityId = null;
        this._focusWidthId = null;
        this._focusHeightId = null;
        this._edgeSoftnessId = null;
        this._zoomFactorId = null;
    }

    get active() {
        return this._active;
    }

    _stageBounds() {
        // Union of all monitors: stage (0,0)+size is wrong when a monitor
        // sits left/above the primary (negative coordinates).
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
        const [x, y, w, h] = this._stageBounds();
        this._actor.set_position(x, y);
        this._actor.set_size(w, h);
    }

    toggle() {
        this._active = !this._active;
        if (!this._active) {
            this._zoomActive = false;
            this._stopTimer();
            this._lastPaintX = null;
            this._lastPaintY = null;
            this._lastLensKey = null;
        } else {
            // Read the pointer now so the first visible frame already has
            // the hole under the cursor (no flash at the old position).
            this._refreshPointer();
            this._lastPaintX = null;
            this._lastPaintY = null;
            this._lastLensKey = null;
            this._updateSize();
            this._ensureTimer();
        }
        this._syncVisibility();
        this._syncLens(true);
    }

    _syncVisibility() {
        if (this._active && !this._isObscured()) {
            this._updateSize();
            this._actor.show();
            // Force one immediate repaint with the fresh pointer position.
            this._lastPaintX = null;
            this._actor.queue_repaint();
        } else {
            this._actor.hide();
        }
    }

    toggleZoom() {
        if (!this._active) return;
        this._zoomActive = !this._zoomActive;
        if (this._zoomActive)
            this._refreshPointer();
        this._syncLens(true);
    }

    updatePointer(x, y) {
        if (!Number.isFinite(x) || !Number.isFinite(y))
            return;
        this._pointerX = x;
        this._pointerY = y;
        if (!this._active || this._destroyed)
            return;
        if (this._isObscured())
            return;
        // Keep the actor in sync with the stage size, like the reference
        // extension does, but only repaint when something actually changed.
        if (this._actor.width !== global.stage.width ||
            this._actor.height !== global.stage.height) {
            const [bx, by, bw, bh] = this._stageBounds();
            if (this._actor.x !== bx || this._actor.y !== by ||
                this._actor.width !== bw || this._actor.height !== bh) {
                this._updateSize();
                this._lastPaintX = null;
            }
        }
        if (x === this._lastPaintX && y === this._lastPaintY)
            return;
        this._lastPaintX = x;
        this._lastPaintY = y;
        this._actor.queue_repaint();
        // The lens is GPU-composited: only its transform changes,
        // no repaint needed.
        if (this._zoomActive)
            this._updateLens();
    }

    _onRepaint(area) {
        const [surfaceWidth, surfaceHeight] = area.get_surface_size();
        const actorWidth = Math.max(1, area.width);
        const actorHeight = Math.max(1, area.height);
        const scaleX = surfaceWidth / actorWidth;
        const scaleY = surfaceHeight / actorHeight;

        const dimOpacity = this._dimOpacity;
        const outerRadiusX = Math.max(1, this._focusW * scaleX / 2);
        const outerRadiusY = Math.max(1, this._focusH * scaleY / 2);
        const minOuterRadius = Math.max(1, Math.min(outerRadiusX, outerRadiusY));
        const edgeSoftness = Math.max(0, this._edgeSoftness) * Math.min(scaleX, scaleY);
        const featherSize = Math.min(minOuterRadius, edgeSoftness);
        const innerStop = Math.max(0, 1 - featherSize / minOuterRadius);
        // Actor may be offset for multi-monitor bounds: convert stage
        // coordinates into actor-local surface coordinates.
        const actorX = area.x ?? 0;
        const actorY = area.y ?? 0;
        const centerX = Math.max(0, Math.min(surfaceWidth, (this._pointerX - actorX) * scaleX));
        const centerY = Math.max(0, Math.min(surfaceHeight, (this._pointerY - actorY) * scaleY));

        const context = area.get_context();

        context.setOperator(Cairo.Operator.SOURCE);
        context.setSourceRGBA(0, 0, 0, dimOpacity);
        context.paint();

        context.save();
        context.translate(centerX, centerY);
        context.scale(outerRadiusX, outerRadiusY);

        // NOTE: must use the Cairo.RadialGradient constructor, like the
        // reference extension. context.createRadialGradient() does not
        // reliably produce a working pattern in GJS and leaves the
        // screen fully dimmed with no spotlight hole.
        // The gradient depends only on innerStop, so reuse it across
        // frames instead of allocating 60 patterns per second.
        let gradient = null;
        if (this._cachedGradient && this._cachedInnerStop === innerStop) {
            gradient = this._cachedGradient;
        } else {
            gradient = new Cairo.RadialGradient(0, 0, 0, 0, 0, 1);
            gradient.addColorStopRGBA(0, 0, 0, 0, 1);
            gradient.addColorStopRGBA(innerStop, 0, 0, 0, 1);
            gradient.addColorStopRGBA(1, 0, 0, 0, 0);
            this._cachedGradient = gradient;
            this._cachedInnerStop = innerStop;
        }

        context.setOperator(Cairo.Operator.DEST_OUT);
        context.setSource(gradient);
        context.arc(0, 0, 1, 0, Math.PI * 2);
        context.fill();
        context.restore();

        // Zoom is rendered by the Clutter.Clone lens below this overlay,
        // not here: there is no public stage-to-cairo API to magnify
        // pixels inside a repaint handler.

        context.$dispose();
    }

    destroy() {
        this._destroyed = true;
        this._stopTimer();
        if (this._monitorsChangedId) {
            try {
                Main.layoutManager.disconnect(this._monitorsChangedId);
            } catch (e) {
            }
            this._monitorsChangedId = null;
        }
        if (this._overviewShowingId) {
            try {
                Main.overview.disconnect(this._overviewShowingId);
            } catch (e) {
            }
            this._overviewShowingId = null;
        }
        if (this._overviewHiddenId) {
            try {
                Main.overview.disconnect(this._overviewHiddenId);
            } catch (e) {
            }
            this._overviewHiddenId = null;
        }
        if (this._screenLockedId && Main.screenShield) {
            try {
                Main.screenShield.disconnect(this._screenLockedId);
            } catch (e) {
            }
            this._screenLockedId = null;
        }
        if (this._screenUnlockedId && Main.screenShield) {
            try {
                Main.screenShield.disconnect(this._screenUnlockedId);
            } catch (e) {
            }
            this._screenUnlockedId = null;
        }
        if (this._repaintId) {
            try {
                this._actor.disconnect(this._repaintId);
            } catch (e) {
            }
            this._repaintId = null;
        }
        this._disconnectSettings();
        this._cachedGradient = null;
        try {
            if (this._actor.get_parent() === Main.layoutManager.uiGroup)
                Main.layoutManager.removeChrome(this._actor);
            else if (this._actor.get_parent())
                this._actor.get_parent().remove_child(this._actor);
        } catch (e) {
        }
        try {
            this._actor.destroy();
        } catch (e) {
        }
        if (this._lens) {
            try {
                if (this._lens.get_parent())
                    this._lens.get_parent().remove_child(this._lens);
            } catch (e) {
            }
            try {
                this._lens.destroy();
            } catch (e) {
            }
            this._lens = null;
            this._lensClone = null;
        }
        this._settings = null;
    }
}

export default class CursorSpotlightExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._overlay = new SpotlightOverlay(this._settings);

        this._toggleHandler = () => {
            if (this._overlay)
                this._overlay.toggle();
        };
        this._zoomHandler = () => {
            if (this._overlay)
                this._overlay.toggleZoom();
        };

        Main.wm.addKeybinding(
            'toggle',
            this._settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
            this._toggleHandler
        );
        Main.wm.addKeybinding(
            'toggle-zoom',
            this._settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
            this._zoomHandler
        );
    }

    disable() {
        try {
            Main.wm.removeKeybinding('toggle');
        } catch (e) {
        }
        try {
            Main.wm.removeKeybinding('toggle-zoom');
        } catch (e) {
        }

        if (this._overlay) {
            try {
                this._overlay.destroy();
            } catch (e) {
            }
            this._overlay = null;
        }
        this._settings = null;
        this._toggleHandler = null;
        this._zoomHandler = null;
    }
}
