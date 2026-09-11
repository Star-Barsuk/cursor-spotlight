import Cairo from 'cairo';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const TIMER_INTERVAL_MS = 16;

class SpotlightOverlay {
    constructor(settings) {
        this._settings = settings;
        this._active = false;
        this._zoomActive = false;
        this._pointerX = 0;
        this._pointerY = 0;

        this._actor = new St.DrawingArea({
            reactive: false,
            x: 0,
            y: 0,
        });
        this._actor.hide();
        this._addToChrome();
        this._createLens();

        this._monitorsChangedId = Main.layoutManager.connect('monitors-changed', () => {
            if (this._active) {
                this._updateSize();
                this._actor.queue_repaint();
                this._updateLens();
            }
        });

        // The overlay must stay hidden while the overview is visible
        // (Super / Show Apps open the overview). It is reshown when the
        // overview hides, but only if the spotlight is still active.
        // The zoom lens follows the same rule.
        this._overviewShowingId = Main.overview.connect('showing', () => {
            this._actor.hide();
            this._lens.hide();
        });
        this._overviewHiddenId = Main.overview.connect('hidden', () => {
            this._syncVisibility();
            this._syncLens();
        });

        this._repaintId = this._actor.connect('repaint', (_area) => {
            this._onRepaint(_area);
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

    _lensSize() {
        const w = Math.max(1, this._settings.get_int('focus-width'));
        const h = Math.max(1, this._settings.get_int('focus-height'));
        return [w, h];
    }

    _zoomFactor() {
        return Math.max(1, Math.min(5, this._settings.get_double('zoom-factor')));
    }

    _updateLens() {
        if (!this._active || !this._zoomActive)
            return;
        const [w, h] = this._lensSize();
        const z = this._zoomFactor();
        this._lens.set_position(this._pointerX - w / 2, this._pointerY - h / 2);
        this._lens.set_size(w, h);
        this._lensClone.set_scale(z, z);
        this._lensClone.set_position(w / 2 - this._pointerX * z, h / 2 - this._pointerY * z);
    }

    _syncLens() {
        if (this._active && this._zoomActive && !Main.overview.visible) {
            this._updateLens();
            this._lens.show();
        } else {
            this._lens.hide();
        }
    }

    _connectSettings() {
        this._dimOpacityId = this._settings.connect('changed::dim-opacity', () => {
            if (this._active) this._actor.queue_repaint();
        });
        this._focusWidthId = this._settings.connect('changed::focus-width', () => {
            if (this._active) this._actor.queue_repaint();
            this._updateLens();
        });
        this._focusHeightId = this._settings.connect('changed::focus-height', () => {
            if (this._active) this._actor.queue_repaint();
            this._updateLens();
        });
        this._edgeSoftnessId = this._settings.connect('changed::edge-softness', () => {
            if (this._active) this._actor.queue_repaint();
        });
        this._zoomFactorId = this._settings.connect('changed::zoom-factor', () => {
            this._updateLens();
        });
    }

    _disconnectSettings() {
        this._settings.disconnect(this._dimOpacityId);
        this._settings.disconnect(this._focusWidthId);
        this._settings.disconnect(this._focusHeightId);
        this._settings.disconnect(this._edgeSoftnessId);
        this._settings.disconnect(this._zoomFactorId);
    }

    get active() {
        return this._active;
    }

    _updateSize() {
        this._actor.set_position(0, 0);
        this._actor.set_size(global.stage.width, global.stage.height);
    }

    toggle() {
        this._active = !this._active;
        if (!this._active)
            this._zoomActive = false;
        this._syncVisibility();
        this._syncLens();
    }

    _syncVisibility() {
        if (this._active && !Main.overview.visible) {
            this._updateSize();
            this._actor.show();
            this._actor.queue_repaint();
        } else {
            this._actor.hide();
        }
    }

    toggleZoom() {
        if (!this._active) return;
        this._zoomActive = !this._zoomActive;
        this._syncLens();
    }

    updatePointer(x, y) {
        this._pointerX = x;
        this._pointerY = y;
        if (this._active) {
            // Keep the actor in sync with the stage size every frame,
            // like the reference extension does.
            if (this._actor.width !== global.stage.width ||
                this._actor.height !== global.stage.height) {
                this._updateSize();
            }
            this._actor.queue_repaint();
            // The lens is GPU-composited: only its transform changes,
            // no repaint needed.
            this._updateLens();
        }
    }

    _onRepaint(area) {
        const [surfaceWidth, surfaceHeight] = area.get_surface_size();
        const actorWidth = Math.max(1, area.width);
        const actorHeight = Math.max(1, area.height);
        const scaleX = surfaceWidth / actorWidth;
        const scaleY = surfaceHeight / actorHeight;

        const dimOpacity = Math.max(0, Math.min(100, this._settings.get_int('dim-opacity'))) / 100;
        const outerRadiusX = Math.max(1, this._settings.get_int('focus-width') * scaleX / 2);
        const outerRadiusY = Math.max(1, this._settings.get_int('focus-height') * scaleY / 2);
        const minOuterRadius = Math.max(1, Math.min(outerRadiusX, outerRadiusY));
        const edgeSoftness = Math.max(0, this._settings.get_int('edge-softness')) * Math.min(scaleX, scaleY);
        const featherSize = Math.min(minOuterRadius, edgeSoftness);
        const innerStop = Math.max(0, 1 - featherSize / minOuterRadius);
        const centerX = Math.max(0, Math.min(surfaceWidth, this._pointerX * scaleX));
        const centerY = Math.max(0, Math.min(surfaceHeight, this._pointerY * scaleY));

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
        const gradient = new Cairo.RadialGradient(0, 0, 0, 0, 0, 1);
        gradient.addColorStopRGBA(0, 0, 0, 0, 1);
        gradient.addColorStopRGBA(innerStop, 0, 0, 0, 1);
        gradient.addColorStopRGBA(1, 0, 0, 0, 0);

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
        if (this._monitorsChangedId) {
            Main.layoutManager.disconnect(this._monitorsChangedId);
            this._monitorsChangedId = null;
        }
        if (this._overviewShowingId) {
            Main.overview.disconnect(this._overviewShowingId);
            this._overviewShowingId = null;
        }
        if (this._overviewHiddenId) {
            Main.overview.disconnect(this._overviewHiddenId);
            this._overviewHiddenId = null;
        }
        this._actor.disconnect(this._repaintId);
        this._disconnectSettings();
        if (this._actor.get_parent() === Main.layoutManager.uiGroup)
            Main.layoutManager.removeChrome(this._actor);
        else if (this._actor.get_parent())
            this._actor.get_parent().remove_child(this._actor);
        this._actor.destroy();
        if (this._lens) {
            if (this._lens.get_parent())
                this._lens.get_parent().remove_child(this._lens);
            this._lens.destroy();
            this._lens = null;
            this._lensClone = null;
        }
    }
}

export default class CursorSpotlightExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._overlay = new SpotlightOverlay(this._settings);
        this._timerId = null;
        this._startTimer();

        this._toggleHandler = () => {
            this._overlay.toggle();
        };
        this._zoomHandler = () => {
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

    _startTimer() {
        this._timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, TIMER_INTERVAL_MS, () => {
            const [x, y] = global.get_pointer();
            this._overlay.updatePointer(x, y);
            return GLib.SOURCE_CONTINUE;
        });
    }

    disable() {
        Main.wm.removeKeybinding('toggle');
        Main.wm.removeKeybinding('toggle-zoom');

        if (this._timerId) {
            GLib.source_remove(this._timerId);
            this._timerId = null;
        }

        this._overlay.destroy();
        this._overlay = null;
        this._settings = null;
    }
}
