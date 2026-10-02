import React, { useEffect, useRef } from 'react';

export interface MatrixRainCanvasProps {
  /** Normalized 0..1 audio resonance — shifts rain from green to yellow. */
  resonance?: number;
  /** Renders at reduced opacity for background duty. Default 0.55. */
  opacity?: number;
  /** Extra class names merged onto the canvas. */
  className?: string;
  /** Fetch `/shaders/matrix-rain.frag` instead of the embedded source. Default true. */
  preferRemoteShader?: boolean;
}

const VERTEX_SOURCE = `
  attribute vec2 position;
  void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;

/** Canonical copy shipped at `packages/matrix-engine/src/shaders/matrix-rain.frag`. */
const EMBEDDED_FRAGMENT_SOURCE = `
  precision highp float;
  uniform vec2 u_resolution;
  uniform float u_time;
  uniform float u_audio_resonance;

  #define COLUMNS 42.0
  #define ROWS 26.0

  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123); }

  float glyph(vec2 cellUv, float seed) {
    vec2 g = floor(cellUv * 5.0);
    float bit = floor(hash(vec2(g.x + seed * 7.0, g.y + seed * 13.0)) * 3.0);
    return step(1.0, bit);
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    vec2 cellUv = fract(vec2(uv.x * COLUMNS, uv.y * ROWS));

    float colSeed = hash(vec2(floor(uv.x * COLUMNS), 3.7));
    float speed = 0.35 + colSeed * 0.9 + u_audio_resonance * 1.6;
    float colPhase = hash(vec2(floor(uv.x * COLUMNS), 9.1)) * ROWS;
    float head = mod(u_time * speed + colPhase, ROWS + 6.0);
    float trail = mod(head - (floor(uv.y * ROWS) + 0.5), ROWS + 6.0);
    float fade = exp(-trail * 0.45);
    float flicker = 0.75 + 0.25 * sin(u_time * 18.0 + floor(uv.x * COLUMNS) * 2.1);

    float lit = glyph(cellUv, colSeed * 31.0) * fade * flicker;

    vec3 green = vec3(0.0, 1.0, 0.53);
    vec3 yellow = vec3(0.83, 1.0, 0.0);
    vec3 color = mix(green, yellow, clamp(u_audio_resonance, 0.0, 1.0));

    float headGlow = exp(-trail * 3.0) * 0.6;
    vec3 outColor = color * (lit * 0.9 + headGlow) + vec3(0.008, 0.043, 0.020);
    outColor.r += 0.02 * sin(gl_FragCoord.y * 0.5 + u_time * 3.0);

    gl_FragColor = vec4(outColor, 1.0);
  }
`;

/**
 * MatrixRainCanvas — full-bleed digital-rain background driven by the shared
 * audio resonance. Falls back to an embedded GLSL copy when the shader asset is
 * unreachable (offline first boot).
 */
export const MatrixRainCanvas: React.FC<MatrixRainCanvasProps> = ({
  resonance = 0,
  opacity = 0.55,
  className,
  preferRemoteShader = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const resonanceRef = useRef(resonance);
  const programRef = useRef<WebGLProgram | null>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const disposedRef = useRef(false);

  resonanceRef.current = resonance;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    disposedRef.current = false;

    const gl = (canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: false }) ??
      canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) {
      console.warn('[MatrixRainCanvas] WebGL unavailable — background stays void black.');
      return;
    }
    glRef.current = gl;

    const compile = (type: number, source: string): WebGLShader | null => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.warn('[MatrixRainCanvas] Shader compile failed:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    let vert: WebGLShader | null = null;
    let frag: WebGLShader | null = null;
    let program: WebGLProgram | null = null;
    let buffer: WebGLBuffer | null = null;
    let rafId: number | null = null;
    const timeOffset = 0;
    let cancelled = false;
    let cleanupResize: (() => void) | null = null;

    const start = (fragmentSource: string) => {
      if (cancelled || disposedRef.current) return;
      vert = compile(gl.VERTEX_SHADER, VERTEX_SOURCE);
      frag = compile(gl.FRAGMENT_SHADER, fragmentSource);
      if (!vert || !frag) return;

      program = gl.createProgram();
      if (!program) return;
      gl.attachShader(program, vert);
      gl.attachShader(program, frag);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.warn('[MatrixRainCanvas] Program link failed:', gl.getProgramInfoLog(program));
        return;
      }
      programRef.current = program;
      gl.useProgram(program);

      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
        gl.STATIC_DRAW,
      );

      const positionAttr = gl.getAttribLocation(program, 'position');
      if (positionAttr >= 0) {
        gl.enableVertexAttribArray(positionAttr);
        gl.vertexAttribPointer(positionAttr, 2, gl.FLOAT, false, 0, 0);
      }

      const uTime = gl.getUniformLocation(program, 'u_time');
      const uResolution = gl.getUniformLocation(program, 'u_resolution');
      const uResonance = gl.getUniformLocation(program, 'u_audio_resonance');

      const resize = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
        const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;
      };
      resize();
      window.addEventListener('resize', resize);

      const startTs = performance.now();
      const render = () => {
        if (cancelled || disposedRef.current) return;
        rafId = requestAnimationFrame(render);
        const elapsed = (performance.now() - startTs) * 0.001 + timeOffset;
        gl.viewport(0, 0, canvas.width, canvas.height);
        if (uTime) gl.uniform1f(uTime, elapsed);
        if (uResolution) gl.uniform2f(uResolution, canvas.width, canvas.height);
        if (uResonance) gl.uniform1f(uResonance, resonanceRef.current);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      };

      cleanupResize = () => window.removeEventListener('resize', resize);
      rafId = requestAnimationFrame(render);
    };

    if (preferRemoteShader) {
      fetch('/shaders/matrix-rain.frag')
        .then((response) => (response.ok ? response.text() : Promise.reject(new Error('shader 404'))))
        .then((source) => start(source.trim().length > 0 ? source : EMBEDDED_FRAGMENT_SOURCE))
        .catch(() => start(EMBEDDED_FRAGMENT_SOURCE));
    } else {
      start(EMBEDDED_FRAGMENT_SOURCE);
    }

    return () => {
      cancelled = true;
      disposedRef.current = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
      cleanupResize?.();
      if (glRef.current) {
        glRef.current.deleteBuffer(buffer);
        glRef.current.deleteShader(vert);
        glRef.current.deleteShader(frag);
        glRef.current.deleteProgram(program);
      }
      programRef.current = null;
      glRef.current = null;
    };
  }, [preferRemoteShader]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        opacity,
        pointerEvents: 'none',
        zIndex: 0,
      }}
      aria-hidden="true"
    />
  );
};

export default MatrixRainCanvas;
