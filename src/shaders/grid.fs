#include "./common.glsl";

// QA-027: per-file tuning knob. Only the dir-line half-width is surfaced;
// the `vec2(0.5)` / `dot(dir,dir) >= 0.25` literals are unit-quad geometry.
#define GRID_DIR_LINE_HALF_WIDTH 0.05

flat in int v_gridMode;
flat in float v_solid;
in vec2 v_angle;
in vec4 v_color;
in vec4 v_line_color;
in float v_speed;
in vec2 v_texcoord;

out vec4 FragColor;
void main() {
    FragColor = v_color;
    switch (v_gridMode) {
        case 1: {
                    break;}
        case 2: {
                    if (v_solid < EPSILON) {
                        // dir = centre - frag, so the flow-pointing half is dir·(-v_angle) > 0.
                        vec2 dir = vec2(0.5) - v_texcoord;
                        if (v_speed > EPSILON && dot(-v_angle, dir) > 0.0) {
                            // line = small perpendicular offset; perp = (-v_angle.y, v_angle.x).
                            if (abs(dot(vec2(-v_angle.y, v_angle.x), dir)) < GRID_DIR_LINE_HALF_WIDTH) {
                                FragColor = v_line_color * clamp(v_speed, 0.0, 1.0);
                            }
                        }
                    }
                    break;}
    }
    FragColor.a = 1.0;
}
