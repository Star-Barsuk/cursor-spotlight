// Circular mask for the zoom lens, drawn with a GPU fragment shader.
//
// The lens itself is a rectangular Clutter.Clone, so without a mask the
// magnified content is visible as a rectangle everywhere the dim overlay
// is partially transparent. The shader multiplies the lens alpha by a
// radial falloff, cutting the clone to the same circle as the spotlight
// hole so the two layers blend seamlessly.
//
// The shader API changed in GNOME Shell 51: Shell.GLSLEffect was removed
// in favour of Clutter.ShaderEffect + Cogl.Snippet. Both backends are
// kept here behind feature detection so the rest of the extension only
// sees createLensMaskEffect() / setMask(). When GNOME 45-50 support is
// dropped, delete the first branch.

import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';

// Shared by both backends. cogl_* names are GLES2-portable replacements
// for the deprecated gl_* builtins.
const DECLARATIONS = `
uniform vec2 lens_size;
uniform float spot_radius;
uniform float inner_stop;
`;

// Coverage is 1 inside the fully clear part of the spotlight, fades to 0
// at the spotlight edge and is 0 outside. Multiplying premultiplied
// cogl_color_out keeps the alpha-correct blend (as mutter's rounded-clip
// shader does). The max() guards edge-softness == 0, where inner_stop is 1.
const CODE = `
vec2 p = (cogl_tex_coord_in[0].xy - 0.5) * lens_size;
float d = length(p) / spot_radius;
float g = clamp((1.0 - d) / max(1.0 - inner_stop, 0.0001), 0.0, 1.0);
cogl_color_out *= g;
`;

let createEffect = null;

if (typeof Shell.GLSLEffect !== 'undefined') {
    // GNOME Shell 45-50.
    const LensMaskGLSLEffect = GObject.registerClass(
        class LensMaskGLSLEffect extends Shell.GLSLEffect {
            _init() {
                super._init();
                this._lensLocation = this.get_uniform_location('lens_size');
                this._radiusLocation = this.get_uniform_location('spot_radius');
                this._innerLocation = this.get_uniform_location('inner_stop');
            }

            vfunc_build_pipeline() {
                this.add_glsl_snippet(Cogl.SnippetHook.FRAGMENT,
                    DECLARATIONS, CODE, false);
            }

            setMask({width, height, radius, innerStop}) {
                this.set_uniform_float(this._lensLocation, 2, [width, height]);
                this.set_uniform_float(this._radiusLocation, 1, [radius]);
                this.set_uniform_float(this._innerLocation, 1, [innerStop]);
                this.queue_repaint();
            }
        });
    createEffect = () => new LensMaskGLSLEffect();
} else if (typeof Clutter.ShaderEffect !== 'undefined') {
    // GNOME Shell 51+. vfunc_get_static_snippet is called once per
    // subclass; uniforms are set directly, as shell's own effects do.
    const LensMaskShaderEffect = GObject.registerClass(
        class LensMaskShaderEffect extends Clutter.ShaderEffect {
            vfunc_get_static_snippet() {
                // Cogl.Snippet.new, not `new Cogl.Snippet`: the snippet
                // has no construct properties in GJS (gnome-shell#9273).
                return Cogl.Snippet.new(Cogl.SnippetHook.FRAGMENT,
                    DECLARATIONS, CODE);
            }

            setMask({width, height, radius, innerStop}) {
                this.set_uniform_float('lens_size', 2, [width, height]);
                this.set_uniform_float('spot_radius', 1, [radius]);
                this.set_uniform_float('inner_stop', 1, [innerStop]);
                this.queue_repaint();
            }
        });
    createEffect = () => new LensMaskShaderEffect();
} else {
    console.warn('[spotlight] no GLSL shader effect API found; ' +
        'the zoom lens will not be clipped to the spotlight circle');
}

export function createLensMaskEffect() {
    return createEffect ? createEffect() : null;
}
