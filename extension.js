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
        Main.layoutManager.addChrome(this._actor);

        this._repaintId = this._actor.connect('repaint', (_area) => {
            this._onRepaint(_area);
        });

        this._connectSettings();
    }

    _connectSettings() {
        this._dimOpacityId = this._settings.connect('changed::dim-opacity', () => {
            if (this._active) this._actor.queue_repaint();
        });
        this._focusWidthId = this._settings.connect('changed::focus-width', () => {
            if (this._active) this._actor.queue_repaint();
        });
        this._focusHeightId = this._settings.connect('changed::focus-height', () => {
            if (this._active) this._actor.queue_repaint();
        });
        this._edgeSoftnessId = this._settings.connect('changed::edge-softness', () => {
            if (this._active) this._actor.queue_repaint();
        });
        this._zoomFactorId = this._settings.connect('changed::zoom-factor', () => {
            if (this._active) this._actor.queue_repaint();
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

    toggle() {
        this._active = !this._active;
        if (!this._active) {
            this._zoomActive = false;
            this._actor.hide();
        } else {
            this._actor.show();
            this._actor.set_size(
                Main.layoutManager.primaryMonitor.width,
                Main.layoutManager.primaryMonitor.height
            );
            this._actor.queue_repaint();
        }
    }

    toggleZoom() {
        if (!this._active) return;
        this._zoomActive = !this._zoomActive;
        this._actor.queue_repaint();
    }

    updatePointer(x, y) {
        this._pointerX = x;
        this._pointerY = y;
        if (this._active) {
            this._actor.queue_repaint();
        }
    }

    _onRepaint(area) {
        const [surfaceWidth, surfaceHeight] = area.get_surface_size();
        const actorWidth = area.width;
        const actorHeight = area.height;

        if (actorWidth === 0 || actorHeight === 0) return;

        const context = area.get_context();
        const scale = surfaceWidth / actorWidth;

        const dimOpacity = this._settings.get_int('dim-opacity') / 100;
        const focusWidth = this._settings.get_int('focus-width');
        const focusHeight = this._settings.get_int('focus-height');
        const edgeSoftness = this._settings.get_int('edge-softness');

        const pointerX = this._pointerX * scale;
        const pointerY = this._pointerY * scale;
        const focusW = focusWidth * scale;
        const focusH = focusHeight * scale;

        context.setOperator(Cairo.Operator.SOURCE);
        context.setSourceRGBA(0, 0, 0, dimOpacity);
        context.rectangle(0, 0, surfaceWidth, surfaceHeight);
        context.fill();

        const radiusX = focusW / 2;
        const radiusY = focusH / 2;
        const minRadius = Math.min(radiusX, radiusY);

        context.save();
        context.translate(pointerX, pointerY);
        context.scale(radiusX, radiusY);

        const feather = Math.min(minRadius, edgeSoftness * scale);
        const innerStop = minRadius > 0 ? Math.max(0, 1 - feather / minRadius) : 0;

        const grad = context.createRadialGradient(0, 0, 0, 0, 0, 1);
        grad.addColorStopRGBA(0, 0, 0, 0, 1);
        grad.addColorStopRGBA(innerStop, 0, 0, 0, 1);
        grad.addColorStopRGBA(1, 0, 0, 0, 0);

        context.setOperator(Cairo.Operator.DEST_OUT);
        context.setSource(grad);
        context.arc(0, 0, 1, 0, 2 * Math.PI);
        context.fill();

        context.restore();

        if (this._zoomActive) {
            const zoomFactor = this._settings.get_double('zoom-factor');

            context.save();
            context.translate(pointerX, pointerY);
            context.scale(zoomFactor, zoomFactor);
            context.translate(-pointerX, -pointerY);

            const clipRadiusX = radiusX;
            const clipRadiusY = radiusY;
            context.newPath();
            context.ellipse(pointerX, pointerY, clipRadiusX, clipRadiusY, 0, 0, 2 * Math.PI);
            context.clip();

            context.setOperator(Cairo.Operator.SOURCE);
            const stageCog = global.stage.get_stage_image();
            if (stageCog) {
                context.setSource(stageCog, 0, 0);
                context.paint();
            }

            context.restore();
        }

        context.$dispose();
    }

    destroy() {
        this._actor.disconnect(this._repaintId);
        this._disconnectSettings();
        Main.layoutManager.removeChrome(this._actor);
        this._actor.destroy();
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
