#include "./common.glsl";
#include "./common.vs";

in vec2 vert_pos;
in vec2 texcoord;
in vec4 pos_vel;
in vec4 color;
in vec4 rad_static;

out vec2 v_texcoord;
out vec4 v_color;
out vec2 v_angle;
out float v_speed;
out float v_radius;
out float v_static;

void main() {
    if (rad_static.x < EPSILON) {
        gl_Position = vec4(0, 0, 0, 1);
    } else {
        vec2 p = vert_pos * rad_static.x * 2.0 + pos_vel.xy;
        gl_Position = u_matrix * vec4(p, 0.0, 1.0);
    }
    v_texcoord = vert_pos + vec2(0.5);
    v_color = color;
    float l = length(pos_vel.zw);
    v_speed = l;
    // QA-020: stationary boids have l == 0, so divide-by-zero would propagate
    // NaN into v_angle (and from there into boid.fs's heading-stripe test).
    // Guard: emit a zero heading when there is no velocity.
    v_angle = (l > EPSILON) ? pos_vel.zw / l : vec2(0.0);
    v_radius = rad_static.x * 2.0;
    v_static = rad_static.y;
}
