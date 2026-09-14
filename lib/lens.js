// Zoom lens.
//
// A live, GPU-composited Clutter.Clone of the shell's window group, sitting
// below the dim overlay. The overlay dims the lens everywhere except the
// spotlight hole, where the magnified content shows through. Tracking only
// moves/scales the clone, it never repaints it.
//
// The clone is a rectangle, so it is clipped to the spotlight circle by a
// fragment shader (lib/lens-effect.js) that shares the radial falloff of the
// overlay hole, making the two soft edges line up.

import Clutter from 'gi://Clutter';

import {createLensMaskEffect} from './lens-effect.js';
import {safeDestroy} from './utils.js';

export class ZoomLens {
    constructor(source) {
        this._lens = new Clutter.Actor({
            reactive: false,
            clip_to_allocation: true,
            visible: false,
        });
        this._clone = new Clutter.Clone({
            source,
            clip_to_allocation: true,
        });
        this._clone.reactive = false;
        this._clone.set_pivot_point(0, 0);
        this._lens.add_child(this._clone);

        this._mask = createLensMaskEffect();
        if (this._mask)
            this._lens.add_effect(this._mask);

        this._lastKey = null;
    }

    get actor() {
        return this._lens;
    }

    setMask({width, height, radius, innerStop}) {
        if (this._mask)
            this._mask.setMask({width, height, radius, innerStop});
    }

    // The lens is exactly the spotlight diameter: the shader fades the clone
    // to zero at the circle edge, so no overscan is needed to hide a seam.
    update(pointerX, pointerY, radius, zoom) {
        const size = radius * 2;
        const key = `${Math.round(pointerX)}|${Math.round(pointerY)}|${size}|${zoom}`;
        if (key === this._lastKey)
            return;
        this._lastKey = key;
        this._lens.set_position(pointerX - size / 2, pointerY - size / 2);
        this._lens.set_size(size, size);
        this._clone.set_scale(zoom, zoom);
        this._clone.set_position(size / 2 - pointerX * zoom, size / 2 - pointerY * zoom);
    }

    invalidate() {
        this._lastKey = null;
    }

    show() {
        this._lens.show();
    }

    hide() {
        this._lens.hide();
    }

    destroy() {
        this._mask = null;
        this._clone = null;
        safeDestroy(this._lens);
        this._lens = null;
    }
}
