#include "./common.glsl";
#include "./common.vs";

uniform float gridCellSize;
uniform float gridWidth;
uniform float gridHeight;
uniform int gridMode;
uniform int paintMode;
uniform float paintSize;
uniform vec4 lineColor;

in vec2 vert_pos;
in vec2 texcoord;
in vec4 color;
in vec4 vel_len;

out vec4 v_color;
out vec4 v_line_color;
out vec2 v_angle;
out float v_speed;
out vec2 v_texcoord;
flat out int v_gridMode;
flat out float v_solid;

void main() {
    vec2 ot = vec2(
    float(gl_InstanceID % int(gridWidth)) * gridCellSize + (gridCellSize * 0.5),
    trunc(float(gl_InstanceID) / gridWidth) * gridCellSize + (gridCellSize * 0.5)
    );
    vec2 p = vert_pos * gridCellSize * 0.95 + ot;
    gl_Position = u_matrix * vec4(p, 0.0, 1);
    v_texcoord = vert_pos.xy + vec2(0.5);
    v_color = color;
    float ps = paintSize + (gridCellSize);
    if (paintMode == 1) {
        ps = gridCellSize / 2.0;
    }
    if (paintMode > 0) {
        if (length(ot - iMousePos.xy) <= ps) {
            switch (paintMode) {
                case 1: {
                            v_color = vec4(0.5, 0.5, 0.5, 1);
                            break;}
                case 2: {
                            v_color = vec4(0, 0, 0.5, 1);
                            break;}
                case 3: {
                            v_color = vec4(0, 0.5, 0, 1);
                            break;}
                case 4: {
                            v_color = vec4(0.5, 0, 0, 1);
                            break;}
            } // switch
            if (vel_len.w > EPSILON) {
                v_color = v_color * vec4(1.5, 1.5, 1.5, 1.0);
            }
        } // if len
    } // if paintMode
    // QA-020: two fixes here.
    // (1) `length(vel_len.z)` was length-of-a-scalar (== abs(z), and z is the
    //     non-negative flow strength cv.l already) — drop the spurious call.
    // (2) `normalize(vel_len.xy)` divides by zero when the cell has no flow,
    //     producing NaN that propagates into v_angle. Branch on its length.
    v_speed = vel_len.z;
    vec2 flowDir = vel_len.xy;
    float flowLen = length(flowDir);
    v_angle = (flowLen > EPSILON) ? flowDir / flowLen : vec2(0.0);
    v_solid = vel_len.w;
    v_gridMode = gridMode;
    v_line_color = lineColor;
}
