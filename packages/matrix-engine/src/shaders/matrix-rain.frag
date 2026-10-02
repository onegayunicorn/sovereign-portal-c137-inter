precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_audio_resonance;

// Column / glyph grid resolution
#define COLUMNS 42.0
#define ROWS 26.0

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

// Cheap 5x5 bit-matrix glyph so we never depend on a font atlas
float glyph(vec2 cellUv, float seed) {
  vec2 g = floor(cellUv * 5.0);
  float bit = floor(hash(vec2(g.x + seed * 7.0, g.y + seed * 13.0)) * 3.0);
  return step(1.0, bit);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 frag = gl_FragCoord.xy;

  // Grid cell coordinates
  vec2 cell = vec2(floor(uv.x * COLUMNS), floor(uv.y * ROWS));
  vec2 cellUv = fract(vec2(uv.x * COLUMNS, uv.y * ROWS));

  // Per-column speed and phase -> staggered rainfall
  float colSeed = hash(vec2(cell.x, 3.7));
  float speed = 0.35 + colSeed * 0.9 + u_audio_resonance * 1.6;
  float colPhase = hash(vec2(cell.x, 9.1)) * ROWS;

  // Falling head position for this column (wraps over ROWS)
  float head = mod(u_time * speed + colPhase, ROWS + 6.0);

  // Distance of this cell behind the head (0 at the head)
  float trail = mod(head - (floor(uv.y * ROWS) + 0.5), ROWS + 6.0);
  float fade = exp(-trail * 0.45);

  // Glyph fade-out of a cell that is still resolving
  float flicker = 0.75 + 0.25 * sin(u_time * 18.0 + cell.x * 2.1 + cell.y * 0.7);

  float lit = glyph(cellUv, colSeed * 31.0) * fade * flicker;

  // Palette: portal green -> hud yellow at peak resonance
  vec3 green = vec3(0.0, 1.0, 0.53);
  vec3 yellow = vec3(0.83, 1.0, 0.0);
  vec3 color = mix(green, yellow, clamp(u_audio_resonance, 0.0, 1.0));

  // Bright head, dimmer tail; empty void background
  float headGlow = exp(-trail * 3.0) * 0.6;
  vec3 outColor = color * (lit * 0.9 + headGlow);
  outColor += vec3(0.008, 0.043, 0.020); // #020b05 void floor

  // Subtle horizontal jitter for analogue interference, never fully clean
  outColor.r += 0.02 * sin(frag.y * 0.5 + u_time * 3.0);

  gl_FragColor = vec4(outColor, 1.0);
}
