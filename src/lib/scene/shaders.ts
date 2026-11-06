// The scene's GLSL, WebGL2. See index.ts for how each program is used.

/** A piece's instance data: where it is on its orbit, how it is turned, and its colour. */
export const VS_PIECE = `#version 300 es
precision highp float;
layout(location = 0) in vec4 a0; // angle, radius, node, inclination
layout(location = 1) in vec4 a1; // size px, spin, heat, bank
layout(location = 2) in vec4 a2; // rgb, alpha
layout(location = 3) in vec4 a3; // offset from the orbit's centre xyz, how much the hand moves it
layout(location = 4) in vec4 a4; // eased push aside from the cursor (and Start's blast) xy, in scene units, and the turn it adds
layout(location = 5) in vec3 m_pos;
layout(location = 6) in vec3 m_nor;
uniform vec2 u_res; uniform vec2 u_off; uniform float u_zoom; uniform float u_cam;
// The hand: the eased cursor or tilt, -1 to 1 each way with y up.
uniform vec2 u_hand;
out vec3 v_n; out vec3 v_col; out float v_a; out float v_heat; out float v_depth; out float v_coc;
// Turns v about the y axis by a.x (its face toward +x), then the x axis by a.y (toward +y).
vec3 turn(vec3 v, vec2 a) {
  float c = cos(a.x), s = sin(a.x);
  v = vec3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c);
  c = cos(a.y); s = sin(a.y);
  return vec3(v.x, v.y * c + v.z * s, -v.y * s + v.z * c);
}
void main() {
  // The orbit's plane, tilted by its inclination about the line of nodes.
  float cO = cos(a0.z), sO = sin(a0.z), ci = cos(a0.w), si = sin(a0.w);
  vec3 e1 = vec3(cO, sO, 0.0), e2 = vec3(-sO * ci, cO * ci, si), en = vec3(sO * si, -cO * si, ci);
  float ca = cos(a0.x), sa = sin(a0.x);
  vec3 out_ = ca * e1 + sa * e2;
  vec3 T = -sa * e1 + ca * e2;
  vec3 P = a0.y * out_ + a3.xyz;
  // Idle pieces (the ones that answer the hand) share one rule for light and
  // focus: darker the farther they are, brighter as they come closer, and
  // sharp only near the plane of Start, blurring as they leave it either way.
  float idle = step(0.5, a3.w), zn = P.z / u_cam;
  v_depth = idle > 0.5 ? mix(0.1, 0.95, pow(smoothstep(-0.5, 0.42, zn), 2.0))
    : (a0.y > 0.5 ? clamp(0.9 + 0.3 * out_.z, 0.55, 1.15) : 1.0);
  v_coc = idle * clamp(abs(zn) / (1.0 - zn) / 0.75, 0.0, 1.0);
  // Nearer pieces shift with the hand and farther ones against it, a soft
  // parallax about the eye, and every piece turns its face a little toward it.
  vec2 h = u_hand * a3.w;
  P.xy += h * 0.16 * clamp(P.z, -0.19 * u_cam, 0.19 * u_cam);
  vec2 ta = h * 0.35;
  out_ = turn(out_, ta); T = turn(T, ta); en = turn(en, ta);
  // Pieces near the cursor ease aside and turn a little more (worked out per piece in script).
  vec2 push = a4.xy;
  // The disc's axis leans from the orbit's centre (bank 0) to its pole (bank pi/2);
  // the piece spins about that axis.
  vec3 N = cos(a1.w) * -out_ + sin(a1.w) * en;
  vec3 Bv = cross(N, T);
  float sp = a1.y + a4.z;
  float cs = cos(sp), ss = sin(sp);
  vec3 X = cs * T + ss * Bv, Y = -ss * T + cs * Bv;
  vec3 Wp = P + a1.x * (m_pos.x * X + m_pos.y * Y + m_pos.z * N);
  float sc = u_cam / (u_cam - Wp.z);
  gl_Position = vec4(((Wp.xy * sc + push) * u_zoom + u_off) / (u_res * 0.5), -Wp.z / (u_cam * 1.5), 1.0);
  v_n = m_nor.x * X + m_nor.y * Y + m_nor.z * N;
  v_col = a2.rgb; v_a = a2.a; v_heat = a1.z;
}`;

/**
 * Lit by one light from the upper left, the same side the keys' rims catch.
 * Solid, with no halo: a crowd never adds up to a glow. Heat (a reward, the
 * travelling wave) pales a piece a little.
 */
export const FS_PIECE = `#version 300 es
precision highp float;
in vec3 v_n; in vec3 v_col; in float v_a; in float v_heat; in float v_depth; in float v_coc;
layout(location = 0) out vec4 o;
// How out of focus the piece is (0 sharp, 1 the most blur), weighted by its
// coverage so the resolve can recover it.
layout(location = 1) out vec4 o_coc;
const vec3 L = vec3(-0.448, 0.647, 0.617);
const vec3 Hh = vec3(-0.25, 0.361, 0.898);
void main() {
  vec3 n = normalize(v_n);
  if (!gl_FrontFacing) n = -n;
  float dif = max(dot(n, L), 0.0);
  float spe = pow(max(dot(n, Hh), 0.0), 30.0);
  vec3 base = mix(v_col, vec3(max(v_col.r, max(v_col.g, v_col.b))), 0.2 * clamp(v_heat, 0.0, 1.0));
  vec3 c = base * (0.55 + 0.6 * dif) * v_depth + vec3(0.38 * spe * max(v_col.r, max(v_col.g, v_col.b)));
  float a = clamp(v_a, 0.0, 1.0);
  o = vec4(c * a, a);
  o_coc = vec4(v_coc * a, 0.0, 0.0, a);
}`;

/** A streak from tail to head, for sparks and the ping's fading path. */
export const VS_SPARK = `#version 300 es
precision highp float;
layout(location = 0) in vec4 a0; // head xy, tail xy
layout(location = 1) in vec4 a1; // rgb, alpha
layout(location = 2) in vec4 a2; // width, even (1: no fade from head to tail)
uniform vec2 u_res;
uniform vec2 u_off;
uniform float u_zoom;
uniform float u_cam;
vec4 toClip(vec2 p) { return vec4((p * u_zoom + u_off) / (u_res * 0.5), 0.0, 1.0); }
out vec2 v_uv; out vec4 v_c; out float v_even;
void main() {
  vec2 cn = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1)) * 2.0 - 1.0;
  vec2 d = a0.xy - a0.zw;
  float L = length(d);
  vec2 t = L > 1e-3 ? d / L : vec2(1.0, 0.0);
  vec2 n = vec2(-t.y, t.x);
  float w = a2.x + 1.0;
  vec2 pos = mix(a0.zw, a0.xy, cn.x * 0.5 + 0.5) + t * cn.x * w * (1.0 - a2.y) + n * cn.y * w;
  gl_Position = toClip(pos);
  v_uv = vec2(cn.x * 0.5 + 0.5, cn.y); v_c = a1; v_even = a2.y;
}`;

export const FS_SPARK = `#version 300 es
precision highp float;
in vec2 v_uv; in vec4 v_c; in float v_even;
out vec4 o;
void main() {
  float along = mix(pow(clamp(v_uv.x, 0.0, 1.0), 1.4), 1.0, v_even);
  float a = clamp(v_c.a, 0.0, 1.0) * exp(-3.5 * v_uv.y * v_uv.y) * along;
  o = vec4(v_c.rgb * a, a);
}`;

/** One triangle over the whole screen. */
export const VS_FULL = `#version 300 es
out vec2 v_uv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/**
 * The scene laid over the ground. Its light is held down behind the interface
 * (boxes, in device pixels with y up), and a soft pool of shade sits behind
 * the number (u_eye: centre, radius, strength) so the digits always win.
 *
 * Two effects bend or soften the scene on its way to the screen:
 * - Depth of field, in idle (u_dofR, the most blur in device pixels; 0 is
 *   off). Each pixel takes the largest blur of the pieces around it, then
 *   averages the scene over a disc that size, so a piece out of focus
 *   softens on both sides of its edge.
 * - A reward's shockwave (u_wave: front radius, width, strength in device
 *   pixels, and fade). Space bends outward as the front passes, like light
 *   round a heavy mass: whatever the front crosses is carried out and
 *   stretched along it, the bend trails off behind the front, the colours
 *   part slightly where it is steepest, and the slope catches the light on
 *   one side and shades the other, so the wave reads even over bare ground.
 */
export const FS_COMP = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_scene;
uniform sampler2D u_coc;
uniform vec4 u_box[6]; uniform float u_boxK[6]; uniform vec4 u_eye; uniform float u_feather;
uniform vec2 u_px; uniform float u_dofR;
uniform vec4 u_wave[16]; uniform vec3 u_waveCol[16]; uniform int u_waves; uniform vec2 u_waveC;
out vec4 o;
float inside(vec4 b, vec2 p) {
  vec2 d = max(b.xy - p, p - b.zw);
  float dist = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  return 1.0 - smoothstep(-u_feather, u_feather, dist);
}
vec2 disc(int i, float n, float a0) {
  float a = float(i) * 2.39996323 + a0;
  return sqrt((float(i) + 0.5) / n) * vec2(cos(a), sin(a));
}
vec4 sceneAt(vec2 uv, float a0) {
  if (u_dofR < 0.5) return texture(u_scene, uv);
  float R = 0.0;
  for (int i = 0; i < 24; i++) {
    vec4 c = texture(u_coc, uv + disc(i, 24.0, 0.0) * u_dofR * u_px);
    if (c.a > 0.004) R = max(R, c.r / c.a);
  }
  vec4 c0 = texture(u_coc, uv);
  if (c0.a > 0.004) R = max(R, c0.r / c0.a);
  R *= u_dofR;
  if (R < 0.75) return texture(u_scene, uv);
  vec4 acc = vec4(0.0);
  for (int i = 0; i < 32; i++) acc += texture(u_scene, uv + disc(i, 32.0, a0) * R * u_px);
  return acc / 32.0;
}
// The bend's profile across the front, x in widths (0 at the front,
// negative behind it): a steep rise ahead and a tail behind, short enough
// that waves close behind one another stay apart.
float bend(float x) { return x > 0.0 ? exp(-2.2 * x * x) : exp(-0.8 * x * x); }
void main() {
  vec2 p = gl_FragCoord.xy;
  float a0 = 6.2831853 * fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
  vec2 shift = vec2(0.0);
  float spread = 0.0, light = 0.0;
  vec3 tint = vec3(0.0);
  // Waves in flight together take the strongest bend at each pixel rather
  // than adding theirs up, so a quick run of rewards ripples the scene
  // crest by crest instead of piling into one smear.
  if (u_waves > 0) {
    vec2 rel = p - u_waveC;
    float d = length(rel);
    vec2 dir = rel / max(d, 1.0);
    float lit = dot(dir, vec2(-0.57, 0.82)), bent = 0.0;
    for (int i = 0; i < 16; i++) {
      if (i >= u_waves) break;
      vec4 w = u_wave[i];
      float x = (d - w.x) / w.y;
      float b = bend(x);
      // Scale the bend down near the eye so the centre never tears.
      float k = w.z * w.w * smoothstep(0.0, 1.5 * w.y, d);
      bent = max(bent, k * b);
      // The slope of the bend, per width: where light catches the ripple.
      float slope = (bend(x + 0.05) - bend(x - 0.05)) / 0.1;
      spread = max(spread, k * abs(slope) * 0.05);
      float s = w.w * slope;
      light += s * lit;
      tint += u_waveCol[i] * max(0.0, -s) * 0.5 + u_waveCol[i] * max(0.0, s) * 0.12;
    }
    shift = dir * bent;
  }
  vec2 uv = (p - shift) * u_px;
  vec4 s = sceneAt(uv, a0);
  if (spread > 0.05) {
    vec2 dir = normalize(p - u_waveC + 1e-3);
    s.r = sceneAt(uv - dir * spread * u_px, a0).r;
    s.b = sceneAt(uv + dir * spread * u_px, a0).b;
  }
  float keep = 1.0;
  for (int i = 0; i < 6; i++) keep *= 1.0 - u_boxK[i] * inside(u_box[i], p);
  float pool = u_eye.w * (1.0 - smoothstep(u_eye.z * 0.7, u_eye.z * 1.35, length(p - shift - u_eye.xy)));
  keep *= 1.0 - 0.8 * pool;
  vec3 ground = vec3(0.0314, 0.0510, 0.0471) * (1.0 - 0.8 * pool);
  // The ripple's light: a lift on its lit slope and shade on the other,
  // tinted with the reward's colour, held down behind the interface.
  ground *= 1.0 + 0.9 * clamp(light, -0.6, 0.6);
  ground += tint * 0.065 * keep;
  vec3 col = ground * (1.0 - s.a * keep) + s.rgb * keep;
  float n = fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  o = vec4(col + (n - 0.5) / 255.0, 1.0);
}`;
