#include "./common.glsl";
in vec2 v_texcoord;
in vec4 v_color;
in vec2 v_angle;
in float v_speed;
in float v_radius;
in float v_static;

out vec4 FragColor;

void main() {
    if (v_radius < EPSILON) {
        discard;
    }
    vec2 dir = vec2(0.5, 0.5) - v_texcoord;
    float r2 = dot(dir, dir);
    if (r2 >= 0.25) {
        discard;
    }
    if (v_static < EPSILON && dot(v_angle, dir) < 0.0) {
        if (abs(dot(vec2(-v_angle.y, v_angle.x), dir)) < 0.1) {
            FragColor = vec4(1.0, 0.0, 0.0, 1.0);
        } else {
            FragColor = v_color;
        }
    } else {
        FragColor = v_color;
    }
    r2 = 1.0 - r2;
    FragColor.rgb = FragColor.rgb * clamp((r2 * r2), 0.0, 1.0);
}
