precision mediump float;

uniform sampler2D u_screen_texture;
uniform vec2 u_resolution;
uniform float u_time;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;

  // Barrel distortion for CRT curvature
  vec2 cc = uv - 0.5;
  float dist = dot(cc, cc);
  uv = uv + cc * (dist * 0.08);

  // Vignette
  float vig = 1.0 - dist * 1.5;

  // Chromatic aberration (interdimensional split)
  float split = 0.0025;
  float r = texture2D(u_screen_texture, uv + vec2(split, 0.0)).r;
  float g = texture2D(u_screen_texture, uv).g;
  float b = texture2D(u_screen_texture, uv - vec2(split, 0.0)).b;

  // Scanline modulation
  float scanline = sin(uv.y * u_resolution.y * 1.5 + u_time * 10.0) * 0.08;
  vec3 col = vec3(r, g, b) - scanline;

  col *= vig;

  gl_FragColor = vec4(col, 1.0);
}
