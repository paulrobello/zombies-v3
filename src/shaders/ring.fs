#include "./common.glsl";

in vec2 v_texcoord;
in vec4 v_color;
flat in float v_duration;
flat in float v_thickness;

out vec4 FragColor;

void main() {
    if (v_duration < EPSILON) {
        discard;
    }
    vec2 dir = vec2(0.5, 0.5) - v_texcoord;
    float r2 = dot(dir, dir);
    if (r2 >= 0.25) {
        discard;
    }
    if (r2 < 0.25 - v_thickness) {
        discard;
    }
    FragColor = v_color;
}
