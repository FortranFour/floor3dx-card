// type3d: image - a picture on a model object (a picture frame, a screen, a wall).
//
// The object's material gets a CanvasTexture. The card draws into that canvas: a still image once,
// an animated GIF frame by frame (decoded with gifuct-js, so it animates in every browser), a video
// file on every animation tick. Camera snapshots and other changing URLs are re-fetched on a timer.
//
// Frames are drawn into a canvas of the source's own size (capped) and letterboxed, cropped or
// stretched into it according to `fit`, so the picture keeps its proportions on the object's UV space.

import * as THREE from 'three';
import { parseGIF, decompressFrames, ParsedFrame } from 'gifuct-js';

export type ImageFit = 'contain' | 'cover' | 'stretch';

export interface ImageFrameOptions {
  fit: ImageFit;
  background: string; // CSS colour behind a letterboxed image; 'transparent' keeps the object's own look there
  maxSize: number; // longest side of the drawing canvas, in pixels
  aspect: number; // object width / height; 0 = use the picture's own proportions
  rotate: 0 | 90 | 180 | 270;
  flipY: boolean; // glb UV convention (the card passes false for .glb)
  // Fetches through Home Assistant's authenticated fetch when available, so /api/ URLs work.
  fetch: (url: string) => Promise<Response>;
}

interface GifFrame {
  image: ImageData;
  delay: number; // ms
  dims: { left: number; top: number; width: number; height: number };
  disposal: number;
}

export class ImageFrame {
  readonly texture: THREE.CanvasTexture;
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private opts: ImageFrameOptions;

  private currentUrl = '';
  private loadSeq = 0;

  // still
  private still: ImageBitmap | HTMLImageElement | null = null;
  // gif
  private gif: GifFrame[] | null = null;
  private gifCanvas: HTMLCanvasElement | null = null; // composited GIF at native size
  private gifCtx: CanvasRenderingContext2D | null = null;
  private gifIndex = 0;
  private gifNext = 0; // performance.now() of the next frame
  private gifDuration = 0; // one loop, ms
  // video
  private video: HTMLVideoElement | null = null;

  constructor(opts: ImageFrameOptions) {
    this.opts = opts;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 2;
    this.canvas.height = 2;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.flipY = opts.flipY;
    this.texture.minFilter = THREE.LinearFilter;
  }

  /** true while the picture needs an animation loop (GIF with more than one frame, or a video) */
  get animated(): boolean {
    return (this.gif !== null && this.gif.length > 1) || this.video !== null;
  }

  /** Load a new URL. Resolves when the first picture is on the texture. Returns false if nothing could be loaded. */
  async load(url: string, force = false): Promise<boolean> {
    if (!force && url === this.currentUrl) {
      return true;
    }
    const seq = ++this.loadSeq;
    const fetchUrl = force && url === this.currentUrl ? bust(url) : url;
    this.currentUrl = url;

    if (!url) {
      this.clear();
      this.paintEmpty();
      return false;
    }

    if (isVideoUrl(url)) {
      return this.loadVideo(fetchUrl, seq);
    }

    let bytes: ArrayBuffer;
    try {
      const response = await this.opts.fetch(fetchUrl);
      if (!response.ok) {
        throw new Error('HTTP ' + response.status);
      }
      bytes = await response.arrayBuffer();
    } catch (error) {
      console.warn('floor3d-card: image <' + url + '> could not be loaded: ' + error);
      if (seq === this.loadSeq) {
        this.clear();
        this.paintEmpty();
      }
      return false;
    }
    if (seq !== this.loadSeq) return false; // superseded by a newer load

    if (isGif(bytes)) {
      return this.loadGif(bytes, url, seq);
    }
    return this.loadStill(bytes, url, seq);
  }

  /** Advance an animation. Returns true when the texture changed and the scene should be drawn. */
  tick(now: number): boolean {
    if (this.video) {
      if (this.video.readyState >= 2 && !this.video.paused) {
        this.draw(this.video, this.video.videoWidth, this.video.videoHeight);
        return true;
      }
      return false;
    }
    if (this.gif && this.gif.length > 1 && now >= this.gifNext) {
      // Catch up after a slow frame or a hidden tab: skip whole loops, then step through the frames
      // in between so disposal is honoured, and end on the frame that is due now.
      const late = now - this.gifNext;
      if (late >= this.gifDuration) {
        this.gifNext += Math.floor(late / this.gifDuration) * this.gifDuration;
      }
      while (now >= this.gifNext) {
        this.gifIndex = (this.gifIndex + 1) % this.gif.length;
        this.compositeGifFrame(this.gifIndex);
        this.gifNext += this.gif[this.gifIndex].delay;
      }
      this.draw(this.gifCanvas, this.gifCanvas.width, this.gifCanvas.height);
      return true;
    }
    return false;
  }

  dispose(): void {
    this.clear();
    this.texture.dispose();
  }

  // ---- loaders ---------------------------------------------------------------------------------

  private async loadStill(bytes: ArrayBuffer, url: string, seq: number): Promise<boolean> {
    let bitmap: ImageBitmap | HTMLImageElement;
    try {
      bitmap = await decodeStill(bytes);
    } catch (error) {
      console.warn('floor3d-card: image <' + url + '> is not a picture the browser can decode: ' + error);
      if (seq === this.loadSeq) {
        this.clear();
        this.paintEmpty();
      }
      return false;
    }
    if (seq !== this.loadSeq) return false;
    this.clear();
    this.still = bitmap;
    this.draw(bitmap, bitmap.width, bitmap.height);
    return true;
  }

  private loadGif(bytes: ArrayBuffer, url: string, seq: number): boolean {
    let frames: ParsedFrame[];
    let width: number;
    let height: number;
    try {
      const parsed = parseGIF(bytes);
      frames = decompressFrames(parsed, true);
      width = parsed.lsd.width;
      height = parsed.lsd.height;
    } catch (error) {
      console.warn('floor3d-card: GIF <' + url + '> could not be decoded: ' + error);
      this.clear();
      this.paintEmpty();
      return false;
    }
    if (seq !== this.loadSeq) return false;
    this.clear();
    this.gif = frames.map((f) => ({
      image: new ImageData(f.patch, f.dims.width, f.dims.height),
      delay: f.delay > 0 ? f.delay : 100, // browsers treat 0 as ~100 ms
      dims: f.dims,
      disposal: f.disposalType,
    }));
    this.gifCanvas = document.createElement('canvas');
    this.gifCanvas.width = width;
    this.gifCanvas.height = height;
    this.gifCtx = this.gifCanvas.getContext('2d');
    this.gifDuration = this.gif.reduce((sum, f) => sum + f.delay, 0);
    this.gifIndex = 0;
    this.compositeGifFrame(0);
    this.gifNext = performance.now() + this.gif[0].delay;
    this.draw(this.gifCanvas, width, height);
    return true;
  }

  private loadVideo(url: string, seq: number): Promise<boolean> {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.muted = true;
      video.loop = true;
      video.autoplay = true;
      video.playsInline = true;
      video.crossOrigin = 'anonymous';
      video.preload = 'auto';
      video.src = url;
      video.addEventListener('loadeddata', () => {
        if (seq !== this.loadSeq) {
          video.pause();
          video.src = '';
          resolve(false);
          return;
        }
        this.clear();
        this.video = video;
        this.draw(video, video.videoWidth, video.videoHeight);
        video.play().catch(() => undefined);
        resolve(true);
      });
      video.addEventListener('error', () => {
        console.warn('floor3d-card: video <' + url + '> could not be loaded');
        if (seq === this.loadSeq) {
          this.clear();
          this.paintEmpty();
        }
        resolve(false);
      });
    });
  }

  // ---- drawing ----------------------------------------------------------------------------------

  private clear(): void {
    if (this.still && 'close' in this.still) (this.still as ImageBitmap).close();
    this.still = null;
    this.gif = null;
    this.gifCanvas = null;
    this.gifCtx = null;
    if (this.video) {
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();
      this.video = null;
    }
  }

  private paintEmpty(): void {
    this.canvas.width = 2;
    this.canvas.height = 2;
    this.ctx.clearRect(0, 0, 2, 2);
    if (this.opts.background !== 'transparent') {
      this.ctx.fillStyle = this.opts.background;
      this.ctx.fillRect(0, 0, 2, 2);
    }
    this.texture.needsUpdate = true;
  }

  // Full GIF disposal handling: restore-to-background clears the frame's rectangle before the next
  // frame, restore-to-previous puts back what was there before this frame was drawn.
  private prevSnapshot: ImageData | null = null;
  private compositeGifFrame(index: number): void {
    const frame = this.gif[index];
    const ctx = this.gifCtx;
    if (index === 0) {
      ctx.clearRect(0, 0, this.gifCanvas.width, this.gifCanvas.height);
    } else {
      const prev = this.gif[index - 1];
      if (prev.disposal === 2) {
        ctx.clearRect(prev.dims.left, prev.dims.top, prev.dims.width, prev.dims.height);
      } else if (prev.disposal === 3 && this.prevSnapshot) {
        ctx.putImageData(this.prevSnapshot, 0, 0);
      }
    }
    this.prevSnapshot =
      frame.disposal === 3 ? ctx.getImageData(0, 0, this.gifCanvas.width, this.gifCanvas.height) : null;
    // putImageData ignores alpha compositing, so draw the patch through a scratch canvas
    const patch = scratch(frame.dims.width, frame.dims.height);
    patch.getContext('2d').putImageData(frame.image, 0, 0);
    ctx.drawImage(patch, frame.dims.left, frame.dims.top);
  }

  private draw(source: CanvasImageSource, srcW: number, srcH: number): void {
    if (!(srcW > 0 && srcH > 0)) return;
    // The canvas is drawn at the object's own proportions (aspect = object width / height in world
    // space), so when the material stretches it over the object's UV square nothing is distorted.
    // The picture is then placed inside it by `fit`. `rotate` turns the picture in 90-degree steps for
    // objects whose UV layout runs the other way.
    const quarter = this.opts.rotate === 90 || this.opts.rotate === 270;
    const aspect = this.opts.aspect > 0 ? this.opts.aspect : srcW / srcH;
    const w = Math.max(2, Math.round(aspect >= 1 ? this.opts.maxSize : this.opts.maxSize * aspect));
    const h = Math.max(2, Math.round(aspect >= 1 ? this.opts.maxSize / aspect : this.opts.maxSize));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (this.opts.background !== 'transparent') {
      ctx.fillStyle = this.opts.background;
      ctx.fillRect(0, 0, w, h);
    }
    // area the picture has to fill, in the picture's own orientation
    const areaW = quarter ? h : w;
    const areaH = quarter ? w : h;
    let dw = areaW;
    let dh = areaH;
    if (this.opts.fit !== 'stretch') {
      const scale =
        this.opts.fit === 'cover' ? Math.max(areaW / srcW, areaH / srcH) : Math.min(areaW / srcW, areaH / srcH);
      dw = srcW * scale;
      dh = srcH * scale;
    }
    ctx.save();
    ctx.translate(w / 2, h / 2);
    if (this.opts.rotate) ctx.rotate((this.opts.rotate * Math.PI) / 180);
    ctx.beginPath();
    ctx.rect(-areaW / 2, -areaH / 2, areaW, areaH);
    ctx.clip();
    ctx.drawImage(source, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
    this.texture.needsUpdate = true;
  }
}

// ---- helpers -------------------------------------------------------------------------------------

function isGif(bytes: ArrayBuffer): boolean {
  const head = new Uint8Array(bytes, 0, Math.min(6, bytes.byteLength));
  return head.length >= 4 && head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x38;
}

function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|ogv|m4v)(\?.*)?$/i.test(url);
}

function bust(url: string): string {
  return url + (url.includes('?') ? '&' : '?') + '_f3d=' + Date.now();
}

async function decodeStill(bytes: ArrayBuffer): Promise<ImageBitmap | HTMLImageElement> {
  const blob = new Blob([bytes]);
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob);
    } catch (e) {
      // fall through to <img>, e.g. for SVG in some browsers
    }
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('decode failed'));
    };
    img.src = objectUrl;
  });
}

let scratchCanvas: HTMLCanvasElement | null = null;
function scratch(w: number, h: number): HTMLCanvasElement {
  if (!scratchCanvas) scratchCanvas = document.createElement('canvas');
  if (scratchCanvas.width !== w || scratchCanvas.height !== h) {
    scratchCanvas.width = w;
    scratchCanvas.height = h;
  } else {
    scratchCanvas.getContext('2d').clearRect(0, 0, w, h);
  }
  return scratchCanvas;
}
