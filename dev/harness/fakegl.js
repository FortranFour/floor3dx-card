// ?fakegl=1: a stand-in for WebGL2 that does nothing but count. three.js runs its whole pipeline
// against it (programs "link", textures "upload", draw calls are issued), so a test can read draw
// calls, textures, programs and texture create/delete counts in a few hundred milliseconds with no
// GPU and no SwiftShader. There are no pixels: a shader that renders garbage still passes here, so
// this complements the real rendering tests rather than replacing them.
// After the idea in giosci1994/floor3d-card's test page.
(function () {
  if (!new URLSearchParams(location.search).get('fakegl')) return;
  const C = WebGL2RenderingContext;
  let nextId = 1;
  const obj = () => ({ __id: nextId++ });
  const stats = { draws: 0, createTexture: 0, deleteTexture: 0, createProgram: 0, texImage: 0, texStorage: 0, texSubImage: 0 };
  window.__fakegl = stats;
  const params = (p) => {
    switch (p) {
      case C.VERSION: return 'WebGL 2.0 (fake)';
      case C.SHADING_LANGUAGE_VERSION: return 'WebGL GLSL ES 3.00 (fake)';
      case C.VENDOR: case C.RENDERER: return 'fake';
      case C.SCISSOR_BOX: case C.VIEWPORT: return new Int32Array([0, 0, 800, 500]);
      case C.ALIASED_LINE_WIDTH_RANGE: case C.ALIASED_POINT_SIZE_RANGE: return new Float32Array([1, 64]);
      case C.MAX_TEXTURE_SIZE: case C.MAX_CUBE_MAP_TEXTURE_SIZE: case C.MAX_RENDERBUFFER_SIZE: case C.MAX_3D_TEXTURE_SIZE: case C.MAX_ARRAY_TEXTURE_LAYERS: return 4096;
      case C.MAX_VIEWPORT_DIMS: return new Int32Array([4096, 4096]);
      case C.MAX_SAMPLES: return 4;
      // every sampler of a shader's source counts here, compiled out or not, so give them room
      case C.MAX_TEXTURE_IMAGE_UNITS: case C.MAX_COMBINED_TEXTURE_IMAGE_UNITS: case C.MAX_VERTEX_TEXTURE_IMAGE_UNITS: return 64;
      default: return 16;
    }
  };
  // three.js binds a texture only for the sampler uniforms the program reports as active, so the
  // samplers are read off the shader sources handed in (structs and plain uniforms are not reported:
  // three.js skips what is not active, and nothing here needs them).
  const SAMPLER_TYPES = { sampler2D: 0x8b5e, sampler3D: 0x8b5f, samplerCube: 0x8b60, sampler2DShadow: 0x8b62, sampler2DArray: 0x8dc1, samplerCubeShadow: 0x8dc5, sampler2DArrayShadow: 0x8dc4 };
  const shaderSources = new Map(); // shader -> source
  const programShaders = new Map(); // program -> [shader]
  const activeUniforms = (program) => {
    const seen = new Map();
    (programShaders.get(program) || []).forEach((sh) => {
      const src = shaderSources.get(sh) || '';
      const re = /uniform\s+(highp\s+|mediump\s+|lowp\s+)?(sampler\w+)\s+(\w+)(\[\s*(\d+)\s*\])?\s*;/g;
      let m;
      while ((m = re.exec(src))) if (!seen.has(m[3])) seen.set(m[3], { name: m[3] + (m[4] ? '[0]' : ''), type: SAMPLER_TYPES[m[2]] || 0x8b5e, size: m[5] ? +m[5] : 1 });
    });
    return Array.from(seen.values());
  };
  const methods = {
    shaderSource: (sh, src) => { shaderSources.set(sh, src); },
    attachShader: (prog, sh) => { const l = programShaders.get(prog) || []; l.push(sh); programShaders.set(prog, l); },
    getParameter: params,
    getExtension: () => null,
    getSupportedExtensions: () => [],
    getContextAttributes: () => ({ alpha: true, antialias: true, depth: true, stencil: true, premultipliedAlpha: true, preserveDrawingBuffer: false }),
    getShaderPrecisionFormat: () => ({ rangeMin: 127, rangeMax: 127, precision: 23 }),
    getShaderParameter: () => true,
    getProgramParameter: (prog, p) => (p === C.LINK_STATUS || p === C.VALIDATE_STATUS ? true : p === C.ACTIVE_UNIFORMS ? activeUniforms(prog).length : 0),
    getShaderInfoLog: () => '',
    getProgramInfoLog: () => '',
    getShaderSource: () => '',
    getActiveUniform: (prog, i) => activeUniforms(prog)[i] || null,
    getActiveAttrib: () => null,
    checkFramebufferStatus: () => C.FRAMEBUFFER_COMPLETE,
    isContextLost: () => false,
    getError: () => 0,
    getUniformLocation: () => obj(),
    getUniformBlockIndex: () => 0,
    getAttribLocation: () => -1,
    createTexture: () => { stats.createTexture++; return obj(); },
    deleteTexture: () => { stats.deleteTexture++; },
    createProgram: () => { stats.createProgram++; return obj(); },
    createBuffer: obj, createFramebuffer: obj, createRenderbuffer: obj, createShader: obj, createVertexArray: obj, createQuery: obj, createSampler: obj, createTransformFeedback: obj, fenceSync: obj,
    drawElements: () => { stats.draws++; }, drawArrays: () => { stats.draws++; },
    drawElementsInstanced: () => { stats.draws++; }, drawArraysInstanced: () => { stats.draws++; },
    multiDrawElementsWEBGL: () => { stats.draws++; }, multiDrawArraysWEBGL: () => { stats.draws++; },
    texImage2D: () => { stats.texImage++; }, texStorage2D: () => { stats.texStorage++; }, texSubImage2D: () => { stats.texSubImage++; },
  };
  // A plain object, not a Proxy: three.js makes dozens of gl calls per draw call, and a Proxy trap
  // on each made a 3,000-mesh frame take seconds. Every method of the real context is a no-op unless
  // listed above; every constant is copied.
  const noop = () => undefined;
  const make = (canvas) => {
    const gl = { canvas, drawingBufferWidth: 800, drawingBufferHeight: 500, drawingBufferColorSpace: 'srgb', __fake: stats };
    for (const k of Object.getOwnPropertyNames(C)) if (/^[A-Z0-9_]+$/.test(k)) gl[k] = C[k];
    for (const k of Object.getOwnPropertyNames(C.prototype)) if (k !== 'constructor' && typeof Object.getOwnPropertyDescriptor(C.prototype, k).value === 'function') gl[k] = noop;
    Object.assign(gl, methods);
    return gl;
  };
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attrs) {
    if (/webgl/.test(type)) return this.__fakegl || (this.__fakegl = make(this));
    return orig.call(this, type, attrs);
  };
})();
