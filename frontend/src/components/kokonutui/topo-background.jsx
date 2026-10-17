/**
 * Topo Background: a living contour map that drifts, rises under the cursor
 * and ripples on click.
 *
 * Source: KokonutUI (MIT) https://kokonutui.com/docs/backgrounds/topo-background
 * @author @dorianbaffier
 * Converted from TSX to JSX for IdeaRadar. The elevation-number labels were
 * removed to keep the file small; everything else is the original logic.
 *
 * Contour colour = the CSS `color` of the root, so use a text-* class.
 */
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const CELL = 12; // px between field samples
const TERRAIN_SCALE = 360; // width of a hill, px
const INDEX_EVERY = 5; // every 5th line is drawn heavier
const HILL_HEIGHT = 0.5;
const HILL_SPREAD = 120;
const HILL_FOLLOW = 9;
const HILL_RISE = 5;
const RIPPLE_MS = 1800;
const RIPPLE_SPEED = 0.24; // px per ms
const RIPPLE_WIDTH = 42;
const RIPPLE_HEIGHT = 0.2;
const RIPPLE_WAVELENGTH = 96;
const IDLE_FRAME_MS = 33;

/** Seeded 3D gradient noise (Ken Perlin's improved noise), about -1 to 1. */
function createNoise(seed) {
  const p = Array.from({ length: 256 }, (_, i) => i);
  let state = seed >>> 0 || 1;
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + (b - a) * t;
  const grad = (hash, x, y, z) => {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    let v = z;
    if (h < 4) v = y;
    else if (h === 12 || h === 14) v = x;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  };
  return (x, y, z) => {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;
    const fx = x - Math.floor(x);
    const fy = y - Math.floor(y);
    const fz = z - Math.floor(z);
    const u = fade(fx);
    const v = fade(fy);
    const w = fade(fz);
    const A = perm[X] + Y;
    const AA = perm[A] + Z;
    const AB = perm[A + 1] + Z;
    const B = perm[X + 1] + Y;
    const BA = perm[B] + Z;
    const BB = perm[B + 1] + Z;
    return lerp(
      lerp(
        lerp(grad(perm[AA], fx, fy, fz), grad(perm[BA], fx - 1, fy, fz), u),
        lerp(grad(perm[AB], fx, fy - 1, fz), grad(perm[BB], fx - 1, fy - 1, fz), u),
        v
      ),
      lerp(
        lerp(grad(perm[AA + 1], fx, fy, fz - 1), grad(perm[BA + 1], fx - 1, fy, fz - 1), u),
        lerp(grad(perm[AB + 1], fx, fy - 1, fz - 1), grad(perm[BB + 1], fx - 1, fy - 1, fz - 1), u),
        v
      ),
      w
    );
  };
}

/** The segment a contour draws through one grid cell (marching squares). */
function cellSegments(path, index, box, cross) {
  const { x0, y0, x1, y1 } = box;
  const { top, right, bottom, left } = cross;
  const line = (ax, ay, bx, by) => {
    path.moveTo(ax, ay);
    path.lineTo(bx, by);
  };
  switch (index) {
    case 1:
    case 14:
      line(x0, left, bottom, y1);
      break;
    case 2:
    case 13:
      line(bottom, y1, x1, right);
      break;
    case 3:
    case 12:
      line(x0, left, x1, right);
      break;
    case 4:
    case 11:
      line(top, y0, x1, right);
      break;
    case 6:
    case 9:
      line(top, y0, bottom, y1);
      break;
    case 7:
    case 8:
      line(x0, left, top, y0);
      break;
    case 5: // saddle
      line(x0, left, top, y0);
      line(bottom, y1, x1, right);
      break;
    case 10: // saddle
      line(top, y0, x1, right);
      line(x0, left, bottom, y1);
      break;
    default:
      break;
  }
}

function traceCell(field, cols, i, j, interval, paths) {
  const a = field[j * cols + i];
  const b = field[j * cols + i + 1];
  const c = field[(j + 1) * cols + i + 1];
  const d = field[(j + 1) * cols + i];
  const x0 = i * CELL;
  const y0 = j * CELL;
  const first = Math.ceil(Math.min(a, b, c, d) / interval);
  const last = Math.floor(Math.max(a, b, c, d) / interval);
  if (first > last) return;
  const box = { x0, y0, x1: x0 + CELL, y1: y0 + CELL };
  for (let level = first; level <= last; level++) {
    const t = level * interval;
    const index = (a > t ? 8 : 0) | (b > t ? 4 : 0) | (c > t ? 2 : 0) | (d > t ? 1 : 0);
    if (index === 0 || index === 15) continue;
    const isIndex = level % INDEX_EVERY === 0;
    cellSegments(isIndex ? paths.major : paths.minor, index, box, {
      top: x0 + CELL * ((t - a) / (b - a)),
      right: y0 + CELL * ((t - b) / (c - b)),
      bottom: x0 + CELL * ((t - d) / (c - d)),
      left: y0 + CELL * ((t - a) / (d - a)),
    });
  }
}

function traceContours(field, cols, rows, interval, minor, major) {
  const paths = { minor, major };
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols - 1; i++) traceCell(field, cols, i, j, interval, paths);
  }
}

/** Ease the hill towards the cursor and up or down. True while it moves. */
function stepHill(hill, dt) {
  const follow = 1 - Math.exp(-HILL_FOLLOW * dt);
  hill.x += (hill.targetX - hill.x) * follow;
  hill.y += (hill.targetY - hill.y) * follow;
  const goal = hill.on ? 1 : 0;
  hill.amount += (goal - hill.amount) * (1 - Math.exp(-HILL_RISE * dt));
  return (
    Math.abs(hill.targetX - hill.x) > 0.5 ||
    Math.abs(hill.targetY - hill.y) > 0.5 ||
    Math.abs(goal - hill.amount) > 0.002
  );
}

export default function TopoBackground({
  className,
  children,
  interval = 0.07, // height difference between two contour lines
  speed = 1, // drift speed; 0 holds still
  interactive = true, // hill under the cursor + ripple on click
  seed = 26,
}) {
  const rootRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas ? canvas.getContext("2d") : null;
    if (!(root && canvas && ctx)) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const noise = createNoise(seed);

    let width = 0;
    let height = 0;
    let cols = 0;
    let rows = 0;
    let field = new Float32Array(0);
    let color = "";

    const hill = { x: 0, y: 0, targetX: 0, targetY: 0, amount: 0, on: false };
    const ripples = [];
    let time = 0;
    let last = 0;
    let lastPaint = 0;
    let raf = 0;
    let visible = true;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(width / CELL) + 1;
      rows = Math.ceil(height / CELL) + 1;
      field = new Float32Array(cols * rows);
      color = getComputedStyle(canvas).color;
    };

    const sample = (now) => {
      const z = time * 0.05;
      const drift = time * 6;
      const hillOn = hill.amount > 0.001;
      const spread = 2 * HILL_SPREAD * HILL_SPREAD;
      const ringWidth = 2 * RIPPLE_WIDTH * RIPPLE_WIDTH;
      for (let j = 0; j < rows; j++) {
        const y = j * CELL;
        for (let i = 0; i < cols; i++) {
          const x = i * CELL;
          const nx = (x + drift) / TERRAIN_SCALE;
          const ny = y / TERRAIN_SCALE;
          let v =
            noise(nx, ny, z) * 0.78 +
            noise(nx * 2.3 + 17.1, ny * 2.3 + 4.7, z * 1.4) * 0.22;
          if (hillOn) {
            const dx = x - hill.x;
            const dy = y - hill.y;
            v += HILL_HEIGHT * hill.amount * Math.exp(-(dx * dx + dy * dy) / spread);
          }
          for (const ripple of ripples) {
            const age = now - ripple.start;
            const reach = age * RIPPLE_SPEED;
            const d = Math.hypot(x - ripple.x, y - ripple.y) - reach;
            const fadeOut = 1 - age / RIPPLE_MS;
            v +=
              RIPPLE_HEIGHT *
              fadeOut *
              fadeOut *
              Math.exp(-(d * d) / ringWidth) *
              Math.cos((d / RIPPLE_WAVELENGTH) * Math.PI * 2);
          }
          field[j * cols + i] = v;
        }
      }
    };

    const paint = (now) => {
      if (!width || !height) return;
      sample(now);
      const minor = new Path2D();
      const major = new Path2D();
      traceContours(field, cols, rows, interval, minor, major);
      ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = color;
      ctx.lineCap = "round";
      ctx.globalAlpha = 0.16;
      ctx.lineWidth = 0.75;
      ctx.stroke(minor);
      ctx.globalAlpha = 0.34;
      ctx.lineWidth = 1.1;
      ctx.stroke(major);
      ctx.globalAlpha = 1;
    };

    const frame = (now) => {
      raf = 0;
      if (!visible) return;
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
      last = now;
      const hillMoving = stepHill(hill, dt);
      while (ripples.length > 0 && now - ripples[0].start > RIPPLE_MS) ripples.shift();
      const settling = hillMoving || ripples.length > 0;
      time += dt * speed;
      // The slow drift looks the same at half the frame rate.
      if (settling || now - lastPaint >= IDLE_FRAME_MS) {
        paint(now);
        lastPaint = now;
      }
      if (speed > 0 || settling) raf = requestAnimationFrame(frame);
    };

    const start = () => {
      if (!raf && visible && !reduceMotion) {
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    };

    // Follow the light/dark switch (the canvas colour comes from CSS).
    let colorTimer = 0;
    const checkColor = () => {
      const next = getComputedStyle(canvas).color;
      if (next !== color) {
        color = next;
        if (reduceMotion || !raf) paint(performance.now());
      }
    };
    const watchColor = () => {
      if (visible && !colorTimer) {
        checkColor();
        colorTimer = window.setInterval(checkColor, 500);
      } else if (!visible && colorTimer) {
        window.clearInterval(colorTimer);
        colorTimer = 0;
      }
    };

    resize();
    paint(performance.now());
    canvas.style.opacity = "1";
    start();

    const resizeObserver = new ResizeObserver(() => {
      resize();
      paint(performance.now());
    });
    resizeObserver.observe(canvas);

    // Stop drawing while scrolled away or in a background tab.
    let onScreen = true;
    const updateVisible = () => {
      visible = onScreen && document.visibilityState === "visible";
      watchColor();
      if (visible) start();
    };
    const intersection = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      updateVisible();
    });
    intersection.observe(root);
    document.addEventListener("visibilitychange", updateVisible);
    watchColor();

    const local = (event) => {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    const onMove = (event) => {
      if (event.pointerType !== "mouse") return;
      const point = local(event);
      if (!hill.on) {
        hill.x = point.x;
        hill.y = point.y;
      }
      hill.targetX = point.x;
      hill.targetY = point.y;
      hill.on = true;
      start();
    };
    const onLeave = () => {
      hill.on = false;
      start();
    };
    const onDown = (event) => {
      // Clicks on form controls are not meant for the map.
      if (event.target.closest && event.target.closest("a, button, input, textarea, select, label")) return;
      ripples.push({ ...local(event), start: performance.now() });
      if (ripples.length > 4) ripples.shift();
      start();
    };
    if (interactive && !reduceMotion) {
      root.addEventListener("pointermove", onMove);
      root.addEventListener("pointerleave", onLeave);
      root.addEventListener("pointerdown", onDown);
    }

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", updateVisible);
      window.clearInterval(colorTimer);
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerleave", onLeave);
      root.removeEventListener("pointerdown", onDown);
    };
  }, [interval, speed, interactive, seed]);

  return (
    <div
      className={cn(
        "relative flex min-h-[560px] w-full items-center justify-center overflow-hidden text-zinc-900 dark:text-zinc-100",
        className
      )}
      ref={rootRef}
    >
      {/* Faded out top and bottom so the map sits into the page around it. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <canvas
          className="h-full w-full opacity-0 transition-opacity duration-500 ease-out"
          ref={canvasRef}
          style={{
            maskImage: "linear-gradient(to bottom, transparent, #000 18%, #000 82%, transparent)",
            WebkitMaskImage: "linear-gradient(to bottom, transparent, #000 18%, #000 82%, transparent)",
          }}
        />
      </div>
      {children}
    </div>
  );
}
