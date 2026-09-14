// Shared numeric bounds, defaults and clamping helpers.
//
// Kept free of any GI / Shell imports so both extension.js (shell process)
// and prefs.js (preferences process) can share the same limits. The schema
// only bounds some keys; the extension and the preferences UI enforce these
// values so dconf can never feed an out-of-range number into the render path.

export const TIMER_INTERVAL_MS = 16;

export const FOCUS_MIN = 1;
export const FOCUS_MAX = 10000;
export const EDGE_MIN = 0;
export const EDGE_MAX = 2000;
export const DIM_MIN = 0;
export const DIM_MAX = 100;
export const ZOOM_MIN = 1.0;
export const ZOOM_MAX = 5.0;

export const DEFAULT_DIM = 75;
export const DEFAULT_FOCUS = 130;
export const DEFAULT_EDGE = 56;
export const DEFAULT_ZOOM = 1.25;

export function clampInt(value, min, max, fallback) {
    if (!Number.isFinite(value))
        return fallback;
    return Math.max(min, Math.min(max, Math.round(value)));
}

export function clampDouble(value, min, max, fallback) {
    if (!Number.isFinite(value))
        return fallback;
    return Math.max(min, Math.min(max, value));
}
