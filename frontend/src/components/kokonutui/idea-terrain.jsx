/**
 * Idea Terrain: the landscape as a 3D terrain you can turn.
 *
 * Rendering engine adapted from KokonutUI "Activity Terrain" (MIT)
 * https://kokonutui.com/docs/cards/activity-terrain  (@author @dorianbaffier)
 * Converted to JSX and re-fed: instead of a contribution calendar, each column
 * is a patch of the 2D idea map. Height = how crowded that patch is (kernel
 * density of the compared projects). Green flat tiles = relatively unexplored
 * ground. The amber column = your proposal.
 *
 * Input is the `landscape` object from the analyze result (points in [-1, 1]).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export const COLS = 14;
export const ROWS = 8;
const GAP = 0.18;
const MAX_HEIGHT = 4.2; // tallest column, in cells
const BEACON = 0.9; // extra height so "you" stands out
const DEG = Math.PI / 180;
const PITCH_TERRAIN = 56 * DEG;
const YAW_TERRAIN = 18 * DEG;
const YAW_LIMIT = 38 * DEG;
const PITCH_LIMIT = 66 * DEG;
const DRAG_YAW = 0.32 * DEG;
const DRAG_PITCH = 0.36 * DEG;
const SPIN_HALF_LIFE = 0.16;
const SPIN_IN = (YAW_TERRAIN * Math.LN2) / SPIN_HALF_LIFE;
const PITCH_STIFFNESS = 140;
const PITCH_DAMPING = 2 * Math.sqrt(PITCH_STIFFNESS);
const EDGE_STIFFNESS = 180;
const BUMP_STIFFNESS = 400;
const BUMP_DAMPING = 2 * Math.sqrt(BUMP_STIFFNESS) * 0.7;
const BUMP = 0.45;
const WAVE = 0.7;
const PADDING = 28;
const REST_EPSILON = 0.0005;

// Density kernel and "nearby" radius, in map units (the map spans -1..1).
const SIGMA = 0.24;
const NEAR = 0.34;

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

function easeOutBack(t) {
  const c = 1.4;
  const u = t - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
}

function rubber(value, min, max) {
  if (value < min) return min - 0.18 * (1 - Math.exp((value - min) / 0.18));
  if (value > max) return max + 0.18 * (1 - Math.exp((max - value) / 0.18));
  return value;
}

/** Turn the landscape into a COLS x ROWS grid of terrain cells. */
export function buildTerrainCells(landscape) {
  const pts = ((landscape && landscape.points) || []).filter(
    (p) => Number.isFinite(p.x) && Number.isFinite(p.y)
  );
  const you = pts.find((p) => p.source === "proposal") || null;
  const others = pts.filter((p) => p !== you);
  // The backend may send a circle (radius) or an ellipse (rx / ry).
  const regions = ((landscape && landscape.unexplored_regions) || []).map((r) => ({
    x: r.x,
    y: r.y,
    rx: r.rx ?? r.radius_x ?? r.radius ?? 0.25,
    ry: r.ry ?? r.radius_y ?? r.radius ?? 0.25,
  }));

  const raw = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cx = ((col + 0.5) / COLS) * 2 - 1;
      const cy = 1 - ((row + 0.5) / ROWS) * 2; // row 0 is the top of the map
      let density = 0;
      const near = [];
      for (const p of others) {
        const d2 = (cx - p.x) ** 2 + (cy - p.y) ** 2;
        density += Math.exp(-d2 / (2 * SIGMA * SIGMA));
        if (d2 < NEAR * NEAR) near.push({ title: p.title, d2 });
      }
      near.sort((a, b) => a.d2 - b.d2);
      const inRegion = regions.some(
        (r) => ((cx - r.x) / (r.rx || 0.25)) ** 2 + ((cy - r.y) / (r.ry || 0.25)) ** 2 <= 1
      );
      raw.push({ col, row, density, near, inRegion });
    }
  }
  const max = Math.max(1e-6, ...raw.map((c) => c.density));
  const youCell = you
    ? {
        col: clamp(Math.floor(((you.x + 1) / 2) * COLS), 0, COLS - 1),
        row: clamp(Math.floor(((1 - you.y) / 2) * ROWS), 0, ROWS - 1),
      }
    : null;

  return raw.map((c, index) => {
    const norm = c.density / max;
    const isYou = !!youCell && c.col === youCell.col && c.row === youCell.row;
    const open = !isYou && c.inRegion && norm < 0.3;
    let height = 0.06 + norm ** 0.85 * MAX_HEIGHT;
    if (open) height = 0.06;
    if (isYou) height += BEACON;
    return {
      index,
      col: c.col,
      row: c.row,
      kind: isYou ? "you" : open ? "open" : "ground",
      level: norm < 0.02 ? 0 : Math.ceil(norm * 4),
      height,
      count: c.near.length,
      titles: c.near.slice(0, 3).map((n) => n.title),
    };
  });
}

function hexToRgb(value) {
  const hex = value.trim().replace("#", "");
  const n = Number.parseInt(hex.length === 3 ? hex.replace(/./g, "$&$&") : hex, 16);
  return [Math.floor(n / 65536) % 256, Math.floor(n / 256) % 256, n % 256];
}

function shade([r, g, b], amount) {
  const k = 1 - amount;
  return `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})`;
}

function readPalette(node) {
  const style = getComputedStyle(node);
  const read = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
  return {
    levels: [0, 1, 2, 3, 4].map((l) => hexToRgb(read(`--terrain-${l}`, "#888888"))),
    accent: hexToRgb(read("--terrain-accent", "#38bdf8")),
    open: hexToRgb(read("--terrain-open", "#34d399")),
    you: hexToRgb(read("--terrain-you", "#fbbf24")),
  };
}

function project(pose, x, y, z) {
  const cos = Math.cos(pose.yaw);
  const sin = Math.sin(pose.yaw);
  const xr = x * cos - z * sin;
  const zr = x * sin + z * cos;
  return [
    pose.cx + xr * pose.scale,
    pose.cy + (zr * Math.cos(pose.pitch) - y * Math.sin(pose.pitch)) * pose.scale,
  ];
}

/** The faces of one column that face the camera, top last. */
function visibleFaces(pose, x0, z0, h) {
  const x1 = x0 + 1 - GAP;
  const z1 = z0 + 1 - GAP;
  const p = (x, y, z) => project(pose, x, y, z);
  const faces = [];
  const sin = Math.sin(pose.yaw);
  const cos = Math.cos(pose.yaw);
  if (h > 0.02 && pose.pitch > 0.01) {
    if (cos > 0) {
      faces.push({ points: [p(x0, 0, z1), p(x1, 0, z1), p(x1, h, z1), p(x0, h, z1)], tone: 0.22 });
    } else {
      faces.push({ points: [p(x0, 0, z0), p(x1, 0, z0), p(x1, h, z0), p(x0, h, z0)], tone: 0.22 });
    }
    if (sin > 0.001) {
      faces.push({ points: [p(x1, 0, z0), p(x1, 0, z1), p(x1, h, z1), p(x1, h, z0)], tone: 0.38 });
    } else if (sin < -0.001) {
      faces.push({ points: [p(x0, 0, z0), p(x0, 0, z1), p(x0, h, z1), p(x0, h, z0)], tone: 0.38 });
    }
  }
  faces.push({ points: [p(x0, h, z0), p(x1, h, z0), p(x1, h, z1), p(x0, h, z1)], tone: 0 });
  return faces;
}

function inside(points, x, y) {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

function polygon(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
}

function describe(cell) {
  if (cell.kind === "you") {
    return cell.count
      ? `You are here. ${cell.count} compared ${cell.count === 1 ? "idea" : "ideas"} nearby, e.g. ${cell.titles.slice(0, 2).join(", ")}`
      : "You are here. Nothing in the compared set sits close by";
  }
  if (cell.kind === "open") {
    return cell.count
      ? `Relatively unexplored. Only ${cell.count} nearby: ${cell.titles.slice(0, 2).join(", ")}`
      : "Relatively unexplored. Not covered in the compared set";
  }
  if (cell.count) {
    return `${cell.count} ${cell.count === 1 ? "idea" : "ideas"} nearby: ${cell.titles.slice(0, 2).join(", ")}`;
  }
  return "Quiet ground in this view";
}

export default function IdeaTerrain({
  landscape,
  title = "Idea terrain",
  defaultFlat = false,
  className,
  canvasClassName,
}) {
  const cells = useMemo(() => buildTerrainCells(landscape), [landscape]);
  const pointCount = ((landscape && landscape.points) || []).length;
  const [flat, setFlat] = useState(defaultFlat);
  const [active, setActive] = useState(null);
  const [dragging, setDragging] = useState(false);

  const canvasRef = useRef(null);
  const paletteRef = useRef(null);
  const sim = useRef({
    yaw: 0,
    yawSpeed: 0,
    pitch: 0,
    pitchSpeed: 0,
    pitchTarget: defaultFlat ? 0 : PITCH_TERRAIN,
    bumps: new Float64Array(cells.length),
    bumpSpeeds: new Float64Array(cells.length),
    hovered: -1,
    origin: { col: 0, row: 3 },
    width: 0,
    height: 0,
    dpr: 1,
    drag: null,
    raf: 0,
    last: 0,
    visible: false,
    started: false,
    reduceMotion: false,
  });
  const cellsRef = useRef(cells);
  cellsRef.current = cells;
  if (sim.current.bumps.length !== cells.length) {
    sim.current.bumps = new Float64Array(cells.length);
    sim.current.bumpSpeeds = new Float64Array(cells.length);
  }

  // The rise travels as a wave out from the origin; each column overshoots a touch.
  const columnHeight = useCallback((cell, lift) => {
    const s = sim.current;
    const span = Math.hypot(COLS, ROWS) || 1;
    const d = Math.hypot(cell.col - s.origin.col, cell.row - s.origin.row) / span;
    const local = clamp(lift * (1 + WAVE) - d * WAVE, 0, 1);
    return cell.height * easeOutBack(local) + s.bumps[cell.index];
  }, []);

  const pose = useCallback(() => {
    const s = sim.current;
    const lift = clamp(s.pitch / PITCH_TERRAIN, 0, 1.2);
    const corners = [[0, 0], [COLS, 0], [0, ROWS], [COLS, ROWS]];
    const probe = { yaw: s.yaw, pitch: s.pitch, scale: 1, cx: 0, cy: 0 };
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const [x, z] of corners) {
      for (const y of [0, (MAX_HEIGHT + BEACON) * Math.min(lift, 1)]) {
        const [px, py] = project(probe, x - COLS / 2, y, z - ROWS / 2);
        minX = Math.min(minX, px);
        maxX = Math.max(maxX, px);
        minY = Math.min(minY, py);
        maxY = Math.max(maxY, py);
      }
    }
    const scale = Math.min(
      (s.width - PADDING * 2) / (maxX - minX),
      (s.height - PADDING * 2) / (maxY - minY)
    );
    return {
      yaw: s.yaw,
      pitch: s.pitch,
      scale,
      cx: s.width / 2 - ((minX + maxX) / 2) * scale,
      cy: s.height / 2 - ((minY + maxY) / 2) * scale + 6,
      lift,
    };
  }, []);

  // Back to front: the further a column's base, the earlier it is drawn.
  const ordered = useCallback((p) => {
    const sin = Math.sin(p.yaw);
    const cos = Math.cos(p.yaw);
    const depth = (c) => (c.col + 0.5 - COLS / 2) * sin + (c.row + 0.5 - ROWS / 2) * cos;
    return [...cellsRef.current].sort((a, b) => depth(a) - depth(b));
  }, []);

  const draw = useCallback(() => {
    const s = sim.current;
    const canvas = canvasRef.current;
    const ctx = canvas ? canvas.getContext("2d") : null;
    if (!(canvas && ctx && s.width)) return;
    if (!paletteRef.current) paletteRef.current = readPalette(canvas);
    const palette = paletteRef.current;
    const p = pose();
    ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
    ctx.clearRect(0, 0, s.width, s.height);
    ctx.lineJoin = "round";
    for (const cell of ordered(p)) {
      const h = columnHeight(cell, p.lift);
      let color = palette.levels[cell.level];
      if (cell.kind === "open") color = palette.open;
      if (cell.kind === "you") color = palette.you;
      if (cell.index === s.hovered) color = palette.accent;
      for (const face of visibleFaces(p, cell.col - COLS / 2, cell.row - ROWS / 2, h)) {
        polygon(ctx, face.points);
        const fill = shade(color, face.tone);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = fill; // hairline closes seams between faces
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
    }
  }, [columnHeight, ordered, pose]);

  const hitTest = useCallback(
    (x, y) => {
      const p = pose();
      const list = ordered(p);
      for (let i = list.length - 1; i >= 0; i--) {
        const cell = list[i];
        const h = columnHeight(cell, p.lift);
        for (const face of visibleFaces(p, cell.col - COLS / 2, cell.row - ROWS / 2, h)) {
          if (inside(face.points, x, y)) return cell;
        }
      }
      return null;
    },
    [columnHeight, ordered, pose]
  );

  const stepSprings = useCallback((dt) => {
    const s = sim.current;
    let energy = 0;
    if (!s.drag) {
      s.yawSpeed *= 0.5 ** (dt / SPIN_HALF_LIFE);
      let target = s.yaw;
      if (s.pitchTarget === 0) target = 0;
      else if (s.yaw > YAW_LIMIT) target = YAW_LIMIT;
      else if (s.yaw < -YAW_LIMIT) target = -YAW_LIMIT;
      if (target !== s.yaw) {
        s.yawSpeed += ((target - s.yaw) * EDGE_STIFFNESS - s.yawSpeed * 2 * Math.sqrt(EDGE_STIFFNESS)) * dt;
      }
      s.yaw += s.yawSpeed * dt;
      energy = Math.max(energy, Math.abs(s.yawSpeed), Math.abs(target - s.yaw));

      const force = (s.pitchTarget - s.pitch) * PITCH_STIFFNESS - s.pitchSpeed * PITCH_DAMPING;
      s.pitchSpeed += force * dt;
      s.pitch += s.pitchSpeed * dt;
      energy = Math.max(energy, Math.abs(s.pitchSpeed), Math.abs(s.pitchTarget - s.pitch));
    }
    for (let i = 0; i < s.bumps.length; i++) {
      const target = i === s.hovered && s.pitch > 0.1 ? BUMP : 0;
      s.bumpSpeeds[i] += ((target - s.bumps[i]) * BUMP_STIFFNESS - s.bumpSpeeds[i] * BUMP_DAMPING) * dt;
      s.bumps[i] += s.bumpSpeeds[i] * dt;
      energy = Math.max(energy, Math.abs(s.bumpSpeeds[i]) * 0.1, Math.abs(target - s.bumps[i]));
    }
    return energy;
  }, []);

  const tick = useCallback(
    (now) => {
      const s = sim.current;
      s.raf = 0;
      const dt = s.last ? Math.min((now - s.last) / 1000, 1 / 30) : 1 / 60;
      s.last = now;
      const energy = stepSprings(dt);
      draw();
      if ((s.drag || energy > REST_EPSILON) && s.visible) {
        s.raf = requestAnimationFrame(tick);
      } else {
        s.last = 0;
      }
    },
    [draw, stepSprings]
  );

  const turnIn = useCallback(() => {
    const s = sim.current;
    if (Math.abs(s.yaw) > 2 * DEG) return;
    if (s.reduceMotion) s.yaw = YAW_TERRAIN;
    else s.yawSpeed = SPIN_IN;
  }, []);

  const wake = useCallback(() => {
    const s = sim.current;
    if (s.reduceMotion) {
      s.pitch = s.pitchTarget;
      s.yaw = clamp(s.yaw, -YAW_LIMIT, YAW_LIMIT);
      s.pitchSpeed = 0;
      s.yawSpeed = 0;
      s.bumps.fill(0);
      draw();
      return;
    }
    if (!s.raf && s.visible) s.raf = requestAnimationFrame(tick);
  }, [draw, tick]);

  useEffect(() => {
    const s = sim.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    s.reduceMotion = motion.matches;
    const resize = new ResizeObserver(([entry]) => {
      s.width = entry.contentRect.width;
      s.height = entry.contentRect.height;
      s.dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(s.width * s.dpr);
      canvas.height = Math.round(s.height * s.dpr);
      draw();
    });
    resize.observe(canvas);

    let onScreen = false;
    const update = () => {
      s.visible = onScreen && !document.hidden;
      if (s.visible) {
        if (!s.started) {
          s.started = true;
          if (s.pitchTarget > 0) turnIn();
        }
        wake();
      } else if (s.raf) {
        cancelAnimationFrame(s.raf);
        s.raf = 0;
        s.last = 0;
      }
    };
    const intersection = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      update();
    });
    intersection.observe(canvas);
    document.addEventListener("visibilitychange", update);

    // Repaint when the theme flips, since the canvas reads its colours from CSS.
    const repaint = () => {
      paletteRef.current = null;
      draw();
    };
    const theme = new MutationObserver(repaint);
    theme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style", "data-theme"],
    });

    return () => {
      resize.disconnect();
      intersection.disconnect();
      theme.disconnect();
      document.removeEventListener("visibilitychange", update);
      cancelAnimationFrame(s.raf);
      s.raf = 0;
    };
  }, [draw, turnIn, wake]);

  // New landscape (a new analysis): redraw straight away.
  useEffect(() => {
    sim.current.hovered = -1;
    setActive(null);
    draw();
  }, [cells, draw]);

  const setView = (nextFlat) => {
    const s = sim.current;
    setFlat(nextFlat);
    s.origin = { col: nextFlat ? COLS : 0, row: 3 };
    s.pitchTarget = nextFlat ? 0 : PITCH_TERRAIN;
    s.yawSpeed = 0;
    if (!nextFlat) turnIn();
    wake();
  };

  const localPoint = (event) => {
    const rect = canvasRef.current ? canvasRef.current.getBoundingClientRect() : null;
    return rect ? { x: event.clientX - rect.left, y: event.clientY - rect.top } : { x: 0, y: 0 };
  };

  const hover = (cell) => {
    const s = sim.current;
    const index = cell ? cell.index : -1;
    if (index !== s.hovered) {
      s.hovered = index;
      setActive(cell);
      if (s.reduceMotion) draw();
      else wake();
    }
  };

  const handlePointerDown = (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const s = sim.current;
    const { x, y } = localPoint(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    const cell = hitTest(x, y);
    if (cell) s.origin = { col: cell.col, row: cell.row };
    s.drag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      yaw: s.yaw,
      pitch: s.pitch,
      moved: false,
      samples: [{ t: event.timeStamp, x: event.clientX, y: event.clientY }],
    };
    s.yawSpeed = 0;
    s.pitchSpeed = 0;
    setDragging(true);
    hover(cell);
    wake();
  };

  const handlePointerMove = (event) => {
    const s = sim.current;
    const drag = s.drag;
    if (!drag || drag.id !== event.pointerId) {
      if (event.pointerType === "mouse") {
        const { x, y } = localPoint(event);
        hover(hitTest(x, y));
      }
      return;
    }
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) > 4) drag.moved = true;
    if (!drag.moved) return;
    s.yaw = rubber(drag.yaw + dx * DRAG_YAW, -YAW_LIMIT, YAW_LIMIT);
    s.pitch = rubber(drag.pitch + dy * DRAG_PITCH, 0, PITCH_LIMIT);
    drag.samples.push({ t: event.timeStamp, x: event.clientX, y: event.clientY });
    if (drag.samples.length > 5) drag.samples.shift();
    if (s.reduceMotion) draw();
    else wake();
  };

  const handlePointerUp = (event) => {
    const s = sim.current;
    const drag = s.drag;
    if (!drag || drag.id !== event.pointerId) return;
    s.drag = null;
    setDragging(false);
    if (!drag.moved) {
      wake();
      return;
    }
    const first = drag.samples[0];
    const lastSample = drag.samples[drag.samples.length - 1] || first;
    const dt = Math.max((lastSample.t - first.t) / 1000, 0.016);
    const vx = (lastSample.x - first.x) / dt;
    const vy = (lastSample.y - first.y) / dt;
    const recent = event.timeStamp - lastSample.t < 80;
    s.yawSpeed = recent ? vx * DRAG_YAW : 0;
    s.pitchSpeed = recent ? vy * DRAG_PITCH : 0;
    const projected = s.pitch + s.pitchSpeed * 0.15;
    const nextFlat = projected < PITCH_TERRAIN / 2;
    setFlat(nextFlat);
    s.pitchTarget = nextFlat ? 0 : PITCH_TERRAIN;
    wake();
  };

  const handlePointerLeave = (event) => {
    if (!sim.current.drag && event.pointerType === "mouse") hover(null);
  };

  const handleKeyDown = (event) => {
    const moves = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    const list = cellsRef.current;
    const current = list[sim.current.hovered] || list.find((c) => c.kind === "you") || list[0];
    if (!current) return;
    const next = list.find((c) => c.col === current.col + move[0] && c.row === current.row + move[1]);
    hover(next || current);
  };

  const readout = active
    ? describe(active)
    : `${pointCount} ideas compared. Taller = more crowded, green = relatively unexplored. Drag to turn.`;

  return (
    <div
      className={cn(
        "terrain-theme w-full select-none overflow-hidden rounded-3xl border border-zinc-200 bg-white text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100",
        className
      )}
    >
      <div className="flex items-start justify-between gap-4 p-5 pb-0">
        <div className="min-w-0">
          <p className="text-sm font-medium">{title}</p>
          <p aria-live="polite" className="mt-0.5 truncate text-sm text-zinc-500 dark:text-zinc-400">
            {readout}
          </p>
        </div>
        <div className="flex shrink-0 rounded-full bg-zinc-100 p-0.5 text-xs dark:bg-zinc-900">
          {[
            ["Flat", true],
            ["Terrain", false],
          ].map(([name, value]) => (
            <button
              aria-pressed={flat === value}
              className={cn(
                "rounded-full px-3 py-1 font-medium outline-none transition-colors duration-200 ease-out focus-visible:ring-2 focus-visible:ring-zinc-400",
                flat === value
                  ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-50"
                  : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              )}
              key={name}
              onClick={() => flat !== value && setView(value)}
              type="button"
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      <canvas
        aria-label={`${title}: ${pointCount} ideas on a ${COLS} by ${ROWS} grid. Use the arrow keys to read each patch.`}
        className={cn(
          "block h-[26rem] w-full touch-pan-y rounded-b-3xl outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-inset",
          dragging ? "cursor-grabbing" : "cursor-grab",
          canvasClassName
        )}
        onKeyDown={handleKeyDown}
        onLostPointerCapture={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerDown={handlePointerDown}
        onPointerLeave={handlePointerLeave}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        ref={canvasRef}
        role="img"
        tabIndex={0}
      />

      <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 px-5 pb-4 text-xs text-zinc-500 dark:text-zinc-400">
        <span className="flex items-center gap-1.5">
          <i className="inline-block size-2.5 rounded-[3px]" style={{ background: "var(--terrain-open)" }} />
          Relatively unexplored
        </span>
        <span className="flex items-center gap-1.5">
          <i className="inline-block size-2.5 rounded-[3px]" style={{ background: "var(--terrain-you)" }} />
          Your idea
        </span>
        <span className="flex items-center gap-1">
          Quiet
          {[0, 1, 2, 3, 4].map((level) => (
            <i className="inline-block size-2.5 rounded-[3px]" key={level} style={{ background: `var(--terrain-${level})` }} />
          ))}
          Crowded
        </span>
      </div>
    </div>
  );
}
