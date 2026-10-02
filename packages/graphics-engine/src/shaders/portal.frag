precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_audio_resonance;
uniform vec2 u_portal_center;

#define PI 3.14159265359

// Pseudo-random noise generator
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y);
  uv -= u_portal_center;

  // Polar coordinates for swirl vortex
  float dist = length(uv);
  float angle = atan(uv.y, uv.x);

  // Portal warp based on audio resonance & time
  float warp = 3.0 * sin(dist * 8.0 - u_time * 2.5 + u_audio_resonance * 4.0);
  float spiral = angle + warp / (dist + 0.15);

  // Dual frequency noise accumulation
  vec2 p = vec2(dist * 4.0 - u_time * 0.8, spiral * 2.0 / PI);
  float n = noise(p) * 0.65 + noise(p * 2.5 + u_time * 0.5) * 0.35;

  // Core Rick C-137 Portal Color Palette
  vec3 col_core = vec3(0.05, 0.95, 0.35);   // Toxic radioactive green
  vec3 col_accent = vec3(0.85, 1.00, 0.40); // High-voltage yellow-green
  vec3 col_void = vec3(0.01, 0.08, 0.04);   // Deep dimensional void

  // Radial boundary falloff
  float rim = smoothstep(0.75, 0.25, dist);
  float center_glow = exp(-dist * 4.5) * (1.2 + u_audio_resonance * 2.0);

  vec3 color = mix(col_void, col_core, n * rim);
  color += col_accent * center_glow;

  // Output final composited color
  gl_FragColor = vec4(color, 1.0);
}
