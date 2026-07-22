// Heading stripe rule (fix(render): boid heading stripe commits):
// The boid carries a thin red "heading stripe" along its leading edge so a
// viewer can read which direction it is moving. v_angle is the boid's
// normalized velocity in boid-space; v_texcoord is the per-vertex local
// coordinate in [0, 1] with (0.5, 0.5) at the boid's center.
//
// "Leading half" = the half of the boid pointing in the direction of motion.
// The branch below selects it by requiring `dot(v_angle, dir) < 0.0` — dir
// points from the center to the fragment, so a negative dot product means the
// fragment is on the side v_angle points *toward* (the leading half). The
// stripe is then the narrow band where the perpendicular component of dir is
// small, i.e. the fragment lies close to the v_angle axis. Stationary boids
// (v_static > 0) skip the stripe entirely and render as a plain disc.
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
