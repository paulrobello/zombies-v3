#include "./common.glsl";
#include "./common.vs";

in vec4 vert_pos;
in vec2 texcoord;
in vec4 pos_rad;
in vec4 color;

out vec2 v_texcoord;
out vec4 v_color;
flat out float v_duration;
flat out float v_thickness;
void main() {
    if (pos_rad.w < EPSILON) {
        gl_Position = vec4(0, 0, 0, 1);
    } else {
        gl_Position = u_matrix * (vert_pos * vec4(pos_rad.z * 2.0, pos_rad.z * 2.0, 1.0, 1.0) + vec4(pos_rad.xy, 0, 0));
    }
    v_texcoord = texcoord;
    v_color = vec4(color.xyz, 1);
    v_duration = pos_rad.w;
    v_thickness = color.w;
}
