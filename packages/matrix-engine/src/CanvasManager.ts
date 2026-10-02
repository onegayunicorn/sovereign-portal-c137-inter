/**
 * CanvasManager — Sovereign Portal C-137
 * WebGL1/WebGL2 program, buffer and uniform manager that drives the portal
 * vortex shader (`shaders/portal.frag`) with the audio-reactive resonance feed.
 *
 * Responsibilities
 *  - create + compile the portal program (vertex + fragment)
 *  - upload the fullscreen quad once, then re-draw it every frame
 *  - push u_time / u_resolution / u_audio_resonance / u_portal_center
 *  - handle canvas + devicePixelRatio resizes
 *  - run a frame-budgeted 60 FPS requestAnimationFrame loop
 *  - fully release GPU resources in dispose()
 */

/** Uniform block mirrored 1:1 with `portal.frag`. */
export interface PortalUniforms {
  u_time: number;
  u_resolution: [number, number];
  u_audio_resonance: number;
  u_portal_center: [number, number];
}

export interface CanvasManagerOptions {
  /** Inline GLSL fragment source. When omitted, `shaderUrl` is fetched. */
  fragmentShader?: string;
  /** URL of the portal fragment shader. Default: `/shaders/portal.frag`. */
  shaderUrl?: string;
  /** Inline GLSL vertex source. Default: PORTAL_VERTEX_SHADER. */
  vertexShader?: string;
  /** Device pixel ratio cap. Default: min(window.devicePixelRatio, 2). */
  maxPixelRatio?: number;
  /** Target frame interval in ms. Default: 1000 / 60. */
  frameBudgetMs?: number;
  /** Partial uniform overrides applied at construction. */
  uniforms?: Partial<PortalUniforms>;
}

/** Minimal fullscreen-triangle-quad vertex shader for the portal pass. */
export const PORTAL_VERTEX_SHADER = `
  attribute vec2 position;
  varying vec2 vUv;
  void main() {
    vUv = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const QUAD_VERTICES = new Float32Array([
  -1, -1, 1, -1, -1, 1,
  -1, 1, 1, -1, 1, 1,
]);

const DEFAULT_FRAGMENT_FALLBACK = `
  precision highp float;
  uniform vec2 u_resolution;
  uniform float u_time;
  uniform float u_audio_resonance;
  uniform vec2 u_portal_center;
  void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y);
    float d = length(uv - u_portal_center);
    float glow = exp(-d * 4.5) * (1.2 + u_audio_resonance * 2.0);
    gl_FragColor = vec4(vec3(0.05, 0.95, 0.35) * glow, 1.0);
  }
`;

interface UniformLocations {
  u_time: WebGLUniformLocation | null;
  u_resolution: WebGLUniformLocation | null;
  u_audio_resonance: WebGLUniformLocation | null;
  u_portal_center: WebGLUniformLocation | null;
}

export class CanvasManager {
  readonly canvas: HTMLCanvasElement;
  readonly uniforms: PortalUniforms;

  private readonly options: Required<Pick<CanvasManagerOptions, 'maxPixelRatio' | 'frameBudgetMs' | 'shaderUrl'>> &
    CanvasManagerOptions;

  private gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private vertexShader: WebGLShader | null = null;
  private fragmentShader: WebGLShader | null = null;
  private buffer: WebGLBuffer | null = null;
  private locations: UniformLocations = {
    u_time: null,
    u_resolution: null,
    u_audio_resonance: null,
    u_portal_center: null,
  };

  private rafId: number | null = null;
  private running = false;
  private disposed = false;
  private lastFrameTs = 0;
  private frameAccumulator = 0;
  private readonly startTime = performance.now();

  /** Optional live audio feed — read every frame. */
  private resonanceSource: (() => number) | null = null;

  constructor(canvas: HTMLCanvasElement, options: CanvasManagerOptions = {}) {
    if (!canvas) {
      throw new Error('[CanvasManager] A target <canvas> element is required.');
    }
    this.canvas = canvas;
    this.options = {
      maxPixelRatio:
        options.maxPixelRatio ?? Math.min(typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1, 2),
      frameBudgetMs: options.frameBudgetMs ?? 1000 / 60,
      shaderUrl: options.shaderUrl ?? '/shaders/portal.frag',
      ...options,
    };
    this.uniforms = {
      u_time: 0,
      u_resolution: [canvas.width || 1, canvas.height || 1],
      u_audio_resonance: 0,
      u_portal_center: [0, 0],
      ...(options.uniforms ?? {}),
    };
  }

  /**
   * Compiles and links the portal program. Safe to await multiple times —
   * subsequent calls are no-ops until dispose().
   */
  async init(): Promise<void> {
    if (this.disposed) {
      throw new Error('[CanvasManager] Cannot init a disposed manager.');
    }
    if (this.program) return;

    const gl = (this.canvas.getContext('webgl2', {
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
      powerPreference: 'high-performance',
    }) ??
      this.canvas.getContext('webgl', {
        alpha: true,
        antialias: true,
        premultipliedAlpha: false,
      })) as WebGLRenderingContext | WebGL2RenderingContext | null;

    if (!gl) {
      throw new Error('[CanvasManager] WebGL is not available in this browser context.');
    }
    this.gl = gl;

    const fragmentSource = this.options.fragmentShader ?? (await this.resolveFragmentSource());

    this.vertexShader = this.compileShader(gl.VERTEX_SHADER, this.options.vertexShader ?? PORTAL_VERTEX_SHADER);
    this.fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragmentSource);

    const program = gl.createProgram();
    if (!program) throw new Error('[CanvasManager] gl.createProgram() returned null.');
    gl.attachShader(program, this.vertexShader);
    gl.attachShader(program, this.fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`[CanvasManager] Portal program link failed: ${info ?? 'unknown error'}`);
    }

    this.program = program;
    gl.useProgram(program);

    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, QUAD_VERTICES, gl.STATIC_DRAW);

    const positionAttr = gl.getAttribLocation(program, 'position');
    if (positionAttr >= 0) {
      gl.enableVertexAttribArray(positionAttr);
      gl.vertexAttribPointer(positionAttr, 2, gl.FLOAT, false, 0, 0);
    }

    this.locations = {
      u_time: gl.getUniformLocation(program, 'u_time'),
      u_resolution: gl.getUniformLocation(program, 'u_resolution'),
      u_audio_resonance: gl.getUniformLocation(program, 'u_audio_resonance'),
      u_portal_center: gl.getUniformLocation(program, 'u_portal_center'),
    };

    gl.clearColor(0.008, 0.043, 0.02, 1.0);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    this.handleResize();
    this.applyUniforms();
  }

  /** Hook a live resonance feed (typically `AudioReactor.getResonance`). */
  attachAudioReactor(reactor: { getResonance: () => number } | null): void {
    this.resonanceSource = reactor ? () => reactor.getResonance() : null;
  }

  /** Move the vortex pivot in normalized clip space (-0.5 .. 0.5). */
  setPortalCenter(x: number, y: number): void {
    this.uniforms.u_portal_center = [x, y];
  }

  /** Resize the backing store to the CSS box, capped by devicePixelRatio. */
  handleResize(): void {
    if (this.disposed) return;
    const rect = this.canvas.getBoundingClientRect();
    const cssWidth = rect.width || this.canvas.clientWidth || this.canvas.width || 1;
    const cssHeight = rect.height || this.canvas.clientHeight || this.canvas.height || 1;
    const ratio = this.options.maxPixelRatio;

    const nextWidth = Math.max(1, Math.round(cssWidth * ratio));
    const nextHeight = Math.max(1, Math.round(cssHeight * ratio));

    if (this.canvas.width !== nextWidth) this.canvas.width = nextWidth;
    if (this.canvas.height !== nextHeight) this.canvas.height = nextHeight;

    this.uniforms.u_resolution = [this.canvas.width, this.canvas.height];
  }

  /** Starts the frame-budgeted (default 60 FPS) render loop. */
  start(): void {
    if (this.running || this.disposed) return;
    this.running = true;
    this.lastFrameTs = performance.now();
    this.frameAccumulator = 0;
    this.rafId = requestAnimationFrame(this.tick);
  }

  /** Stops the render loop, keeping the GPU program alive. */
  stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private tick = (ts: number): void => {
    if (!this.running || this.disposed) return;
    this.rafId = requestAnimationFrame(this.tick);

    const budget = this.options.frameBudgetMs;
    const delta = ts - this.lastFrameTs;
    this.lastFrameAccumulate(delta);

    // Frame budget gate — keeps heavy mobile GPUs pinned near 60 FPS.
    if (this.frameAccumulator < budget) return;
    this.frameAccumulator = this.frameAccumulator % budget;
    this.lastFrameTs = ts;

    this.uniforms.u_time = (ts - this.startTime) * 0.001;
    if (this.resonanceSource) {
      this.uniforms.u_audio_resonance = this.resonanceSource();
    }
    this.render();
  };

  private frameBudgetCarry = 0;

  private lastFrameAccumulate(delta: number): void {
    this.frameBudgetCarry += Math.min(Math.max(delta, 0), 100);
    this.frameAccumulator = this.frameBudgetCarry;
  }

  private render(): void {
    const gl = this.gl;
    const program = this.program;
    if (!gl || !program) return;

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(program);
    this.applyUniforms();
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  private applyUniforms(): void {
    const gl = this.gl;
    if (!gl) return;
    const { u_time, u_resolution, u_audio_resonance, u_portal_center } = this.locations;

    if (u_time) gl.uniform1f(u_time, this.uniforms.u_time);
    if (u_resolution) gl.uniform2f(u_resolution, this.uniforms.u_resolution[0], this.uniforms.u_resolution[1]);
    if (u_audio_resonance) gl.uniform1f(u_audio_resonance, this.uniforms.u_audio_resonance);
    if (u_portal_center) gl.uniform2f(u_portal_center, this.uniforms.u_portal_center[0], this.uniforms.u_portal_center[1]);
  }

  private async resolveFragmentSource(): Promise<string> {
    if (this.options.shaderUrl && typeof fetch === 'function') {
      try {
        const response = await fetch(this.options.shaderUrl);
        if (response.ok) {
          const text = await response.text();
          if (text.trim().length > 0) return text;
        }
      } catch {
        // Offline / file:// — fall through to the embedded minimal portal shader.
      }
    }
    return DEFAULT_FRAGMENT_FALLBACK;
  }

  private compileShader(type: number, source: string): WebGLShader {
    const gl = this.gl;
    if (!gl) throw new Error('[CanvasManager] No WebGL context for shader compilation.');
    const shader = gl.createShader(type);
    if (!shader) throw new Error('[CanvasManager] gl.createShader() returned null.');

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`[CanvasManager] Shader compile failed: ${info ?? 'unknown error'}`);
    }
    return shader;
  }

  /** Releases every GPU resource and stops the loop. Idempotent. */
  dispose(): void {
    if (this.disposed) return;
    this.stop();
    this.disposed = true;

    const gl = this.gl;
    if (gl) {
      if (this.buffer) gl.deleteBuffer(this.buffer);
      if (this.vertexShader) gl.deleteShader(this.vertexShader);
      if (this.fragmentShader) gl.deleteShader(this.fragmentShader);
      if (this.program) gl.deleteProgram(this.program);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.useProgram(null);
    }

    this.buffer = null;
    this.vertexShader = null;
    this.fragmentShader = null;
    this.program = null;
    this.gl = null;
    this.resonanceSource = null;
  }

  get isRunning(): boolean {
    return this.running;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }
}

export default CanvasManager;
