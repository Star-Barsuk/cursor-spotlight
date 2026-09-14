// Dim overlay actor.
//
// A full-stage, non-reactive St.DrawingArea that paints black at the
// configured opacity and then cuts a soft-edged circular hole under the
// pointer. The actor only draws the dimming; the magnified content is a
// separate Clutter.Clone lens (lib/lens.js) sitting below it.
//
// The Cairo.RadialGradient is cached while its shape (innerStop) is
// unchanged so the per-frame paint does not allocate a pattern each tick.

import Cairo from 'cairo';
import St from 'gi://St';

import {safeDisconnect, safeDestroy} from './utils.js';

export class SpotlightOverlay {
    constructor() {
        this._actor = new St.DrawingArea({
            reactive: false,
            x: 0,
            y: 0,
        });
        this._actor.hide();
        this._repaintId = this._actor.connect('repaint', area => this._paint(area));

        this._pointerX = 0;
        this._pointerY = 0;
        this._dimOpacity = 0.75;
        this._focusRadius = 130;
        this._edgeSoftness = 56;

        this._cachedGradient = null;
        this._cachedInnerStop = -1;
    }

    get actor() {
        return this._actor;
    }

    get x() {
        return this._actor.x;
    }

    get y() {
        return this._actor.y;
    }

    get width() {
        return this._actor.width;
    }

    get height() {
        return this._actor.height;
    }

    setPaintParams(pointerX, pointerY, dimOpacity, focusRadius, edgeSoftness) {
        this._pointerX = pointerX;
        this._pointerY = pointerY;
        this._dimOpacity = dimOpacity;
        this._focusRadius = focusRadius;
        this._edgeSoftness = edgeSoftness;
    }

    setBounds(x, y, width, height) {
        this._actor.set_position(x, y);
        this._actor.set_size(width, height);
    }

    show() {
        this._actor.show();
    }

    hide() {
        this._actor.hide();
    }

    queueRepaint() {
        this._actor.queue_repaint();
    }

    _paint(area) {
        const [surfaceWidth, surfaceHeight] = area.get_surface_size();
        const actorWidth = Math.max(1, area.width);
        const actorHeight = Math.max(1, area.height);
        const scaleX = surfaceWidth / actorWidth;
        const scaleY = surfaceHeight / actorHeight;

        // A single radius keeps the spotlight round on mixed-DPI setups
        // (per-axis scale factors would distort it).
        const scale = Math.min(scaleX, scaleY);
        const radius = Math.max(1, this._focusRadius * scale);
        const edgeSoftness = Math.max(0, this._edgeSoftness) * scale;
        const featherSize = Math.min(radius, edgeSoftness);
        const innerStop = Math.max(0, 1 - featherSize / radius);

        // The actor may be offset for multi-monitor bounds: convert stage
        // coordinates into actor-local surface coordinates.
        const actorX = area.x;
        const actorY = area.y;
        const centerX = Math.max(0, Math.min(surfaceWidth, (this._pointerX - actorX) * scaleX));
        const centerY = Math.max(0, Math.min(surfaceHeight, (this._pointerY - actorY) * scaleY));

        const context = area.get_context();

        context.setOperator(Cairo.Operator.SOURCE);
        context.setSourceRGBA(0, 0, 0, this._dimOpacity);
        context.paint();

        context.save();
        context.translate(centerX, centerY);
        context.scale(radius, radius);

        // NOTE: must use the Cairo.RadialGradient constructor. The
        // context.createRadialGradient() variant does not reliably produce
        // a working pattern in GJS and leaves the screen fully dimmed.
        let gradient;
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

        context.$dispose();
    }

    destroy() {
        safeDisconnect(this._actor, this._repaintId);
        this._repaintId = null;
        safeDestroy(this._actor);
        this._actor = null;
        this._cachedGradient = null;
    }
}
