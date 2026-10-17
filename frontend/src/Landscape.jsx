import { useMemo, useState } from "react";
import IdeaTerrain from "@/components/kokonutui/idea-terrain";
import { Card, Chip, Icon, Meter, Segmented, SectionTitle } from "@/components/ui";
import { cn } from "@/lib/utils";

const arr = (v) => (Array.isArray(v) ? v : []);
const CLUSTER_COLORS = ["#8b5cf6", "#38bdf8", "#f472b6", "#34d399", "#fbbf24", "#fb923c"];
const W = 680;
const H = 420;
const PAD = 34;
const sx = (x) => PAD + ((Math.max(-1, Math.min(1, x)) + 1) / 2) * (W - PAD * 2);
const sy = (y) => PAD + ((1 - Math.max(-1, Math.min(1, y))) / 2) * (H - PAD * 2);
const starPath = (cx, cy, R, r) => {
  let d = "";
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? R : r;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    d += `${i === 0 ? "M" : "L"}${(cx + rad * Math.cos(a)).toFixed(1)} ${(cy + rad * Math.sin(a)).toFixed(1)}`;
  }
  return `${d}Z`;
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const colorOf = (c) => CLUSTER_COLORS[Math.abs(Number(c) || 0) % CLUSTER_COLORS.length];
const NEIGHBOURS = 5; // how many closest projects get a number on the map and a row in the side list
const sourceName = (p) => (p.source === "internal" ? "College archive" : "GitHub");
const pct = (p) => Math.round((Number(p.similarity) || 0) * 100);

/** Closest compared projects, best first (the proposal itself is excluded). */
const closest = (points, n) =>
  points.filter((p) => p.source !== "proposal").sort((a, b) => (Number(b.similarity) || 0) - (Number(a.similarity) || 0)).slice(0, n);

// ---- cluster label placement: wrapped, halo-backed, and kept off the dots, the star and each other ----
const CH = 6.3; // approx. width of one bold 11px character
const LH = 13; // line height
function wrapLabel(text) {
  const lines = [""];
  for (const w of String(text || "").split(/\s+/).filter(Boolean)) {
    const cur = lines[lines.length - 1];
    if (!cur) lines[lines.length - 1] = w;
    else if (`${cur} ${w}`.length <= 18 || lines.length >= 2) lines[lines.length - 1] = `${cur} ${w}`;
    else lines.push(w);
  }
  return lines.map((l) => (l.length > 24 ? `${l.slice(0, 23)}…` : l));
}
const overlap = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

function placeLabels(clusters, dots, circles) {
  const frame = { x0: PAD + 4, x1: W - PAD - 4, y0: PAD + 4, y1: H - PAD - 4 };
  const spots = [[0, 0]];
  for (const rad of [24, 40, 58, 80, 106, 136]) {
    for (let k = 0; k < 16; k++) {
      const ang = (k / 16) * 2 * Math.PI;
      spots.push([Math.cos(ang) * rad * 1.5, Math.sin(ang) * rad]); // wider than tall: labels are wide
    }
  }
  const placed = [];
  const out = {};
  for (const c of [...clusters].sort((a, b) => (b.size || 0) - (a.size || 0))) {
    const lines = wrapLabel(c.label);
    const w = Math.max(...lines.map((l) => l.length)) * CH + 22;
    const h = lines.length * LH + 6;
    const cx = sx(c.centroid?.x ?? 0);
    const cy = sy(c.centroid?.y ?? 0);
    let best = null;
    for (const [dx, dy] of spots) {
      const x0 = clamp(cx + dx - w / 2, frame.x0, frame.x1 - w);
      const y0 = clamp(cy + dy - h / 2, frame.y0, frame.y1 - h);
      const box = { x0, y0, x1: x0 + w, y1: y0 + h };
      let cost = Math.hypot(dx, dy) * 0.4; // prefer staying near the cluster
      for (const d of dots) cost += overlap(box, { x0: d.x - d.r, y0: d.y - d.r, x1: d.x + d.r, y1: d.y + d.r }) * 3;
      for (const p of placed) cost += overlap(box, p) * 6;
      for (const u of circles) cost += overlap(box, { x0: u.x - u.rx, y0: u.y - u.ry, x1: u.x + u.rx, y1: u.y + u.ry }) * 0.6;
      if (!best || cost < best.cost) best = { cost, box, lines };
    }
    placed.push(best.box);
    out[c.id] = best;
  }
  return out;
}

function PointsMap({ landscape, hoverId, setHoverId }) {
  const points = arr(landscape.points);
  const clusters = arr(landscape.clusters);
  const you = points.find((p) => p.source === "proposal");
  const halfW = (W - PAD * 2) / 2;
  const halfH = (H - PAD * 2) / 2;
  const hover = hoverId ? points.find((p) => p.id === hoverId) : null;
  const rankOf = useMemo(() => new Map(closest(points, NEIGHBOURS).map((p, i) => [p.id, i + 1])), [points]);

  // Unexplored regions: always fully inside the frame (shrunk if a backend ever sends one that would overshoot).
  const circles = useMemo(
    () =>
      arr(landscape.unexplored_regions).map((r) => {
        const cx = sx(r.x);
        const cy = sy(r.y);
        const rx = (r.rx ?? r.radius_x ?? r.radius ?? 0.2) * halfW;
        const ry = (r.ry ?? r.radius_y ?? (r.radius ? r.radius / 0.57 : 0.35)) * halfH;
        return { x: cx, y: cy, rx: Math.min(rx, cx - PAD, W - PAD - cx), ry: Math.min(ry, cy - PAD, H - PAD - cy) };
      }).filter((c) => c.rx > 12 && c.ry > 12),
    [landscape, halfW, halfH]
  );

  const labels = useMemo(() => {
    const dots = points.map((p) => ({ x: sx(p.x), y: sy(p.y), r: p.source === "proposal" ? 26 : rankOf.has(p.id) ? 11 : 8 }));
    return placeLabels(clusters, dots, circles);
  }, [points, clusters, circles, rankOf]);

  return (
    <Card className="relative overflow-hidden p-3">
      <svg aria-label="Idea landscape map" className="block h-auto w-full" role="img" viewBox={`0 0 ${W} ${H}`}>
        <defs>
          <clipPath id="ir-frame">
            <rect height={H - PAD * 2} rx="14" width={W - PAD * 2} x={PAD} y={PAD} />
          </clipPath>
        </defs>

        {/* faint grid */}
        {[0.25, 0.5, 0.75].map((t) => (
          <g className="stroke-zinc-200 dark:stroke-zinc-800" key={t} strokeDasharray="2 6">
            <line x1={PAD + t * (W - PAD * 2)} x2={PAD + t * (W - PAD * 2)} y1={PAD} y2={H - PAD} />
            <line x1={PAD} x2={W - PAD} y1={PAD + t * (H - PAD * 2)} y2={PAD + t * (H - PAD * 2)} />
          </g>
        ))}
        <rect className="fill-none stroke-zinc-200 dark:stroke-zinc-800" height={H - PAD * 2} rx="14" width={W - PAD * 2} x={PAD} y={PAD} />

        {/* relatively unexplored regions: round on screen, clipped to the frame */}
        <g clipPath="url(#ir-frame)">
          {circles.map((c, i) => (
            <g key={i}>
              <ellipse cx={c.x} cy={c.y} fill="#10b981" fillOpacity="0.1" rx={c.rx} ry={c.ry} stroke="#10b981" strokeDasharray="5 5" strokeOpacity="0.7" />
              <text className="fill-emerald-600 dark:fill-emerald-300" fontSize="10" fontWeight="600" textAnchor="middle" x={c.x} y={c.y - 1}>
                relatively
              </text>
              <text className="fill-emerald-600 dark:fill-emerald-300" fontSize="10" fontWeight="600" textAnchor="middle" x={c.x} y={c.y + 11}>
                unexplored
              </text>
            </g>
          ))}
        </g>

        {/* points (the closest few are bigger and numbered, matching the list on the right) */}
        {points
          .filter((p) => p.source !== "proposal")
          .map((p) => {
            const x = sx(p.x);
            const y = sy(p.y);
            const rank = rankOf.get(p.id);
            const active = hoverId === p.id;
            const common = {
              fill: colorOf(p.cluster),
              fillOpacity: active ? 1 : 0.85,
              onClick: () => p.url && window.open(p.url, "_blank", "noopener"),
              onMouseEnter: () => setHoverId(p.id),
              onMouseLeave: () => setHoverId(null),
              stroke: active || rank ? "currentColor" : "none",
              strokeWidth: active ? 2 : 1,
              strokeOpacity: active ? 1 : 0.35,
              style: { cursor: p.url ? "pointer" : "default" },
            };
            const r = (rank ? 8 : 5.5) + (active ? 1.5 : 0);
            return (
              <g key={p.id}>
                {p.source === "internal" ? (
                  <rect height={r * 2} rx="3" width={r * 2} x={x - r} y={y - r} {...common} />
                ) : (
                  <circle cx={x} cy={y} r={r} {...common} />
                )}
                {rank ? (
                  <text className="pointer-events-none" dominantBaseline="central" fill="#fff" fontSize="9" fontWeight="700" textAnchor="middle" x={x} y={y + 0.5}>
                    {rank}
                  </text>
                ) : null}
              </g>
            );
          })}

        {/* cluster labels: after the dots so the halo keeps them readable */}
        {clusters.map((c) => {
          const l = labels[c.id];
          if (!l) return null;
          const top = l.box.y0 + 3;
          return (
            <g className="pointer-events-none" key={c.id}>
              <circle cx={l.box.x0 + 7} cy={l.box.y0 + l.lines.length * (LH / 2) + 3} fill={colorOf(c.id)} r="3.5" />
              <text
                className="fill-zinc-600 stroke-white dark:fill-zinc-300 dark:stroke-zinc-950"
                fontSize="11"
                fontWeight="600"
                paintOrder="stroke"
                strokeLinejoin="round"
                strokeWidth="4"
              >
                {l.lines.map((line, i) => (
                  <tspan key={i} x={l.box.x0 + 15} y={top + LH * (i + 1) - 3}>
                    {line}
                  </tspan>
                ))}
              </text>
            </g>
          );
        })}

        {/* you */}
        {you ? (
          <g className="pointer-events-none">
            <circle cx={sx(you.x)} cy={sy(you.y)} fill="#f59e0b" fillOpacity="0.18" r="20" />
            <path d={starPath(sx(you.x), sy(you.y), 11, 4.6)} fill="#f59e0b" stroke="#fff" strokeWidth="1.5" />
            <text className="fill-amber-600 stroke-white dark:fill-amber-300 dark:stroke-zinc-950" fontSize="11" fontWeight="700" paintOrder="stroke" strokeWidth="4" textAnchor="middle" x={sx(you.x)} y={sy(you.y) - 17}>
              You
            </text>
          </g>
        ) : null}
      </svg>

      {hover && hover.source !== "proposal" ? (
        <div
          className="pointer-events-none absolute z-10 max-w-64 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
          style={{
            left: `${clamp((sx(hover.x) / W) * 100, 18, 82)}%`,
            top: `${(sy(hover.y) / H) * 100}%`,
            transform: "translate(-50%, calc(-100% - 12px))",
          }}
        >
          <p className="font-semibold">{hover.title}</p>
          <p className="mt-0.5 text-zinc-500">
            {sourceName(hover)} · {pct(hover)}% similar to your idea
          </p>
          {hover.description ? <p className="mt-1 text-zinc-600 dark:text-zinc-400">{hover.description}</p> : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 pb-2 pt-1 text-xs text-zinc-500 dark:text-zinc-400">
        <span className="flex items-center gap-1.5"><i className="inline-block size-2.5 rounded-full bg-zinc-400" /> GitHub repo</span>
        <span className="flex items-center gap-1.5"><i className="inline-block size-2.5 rounded-[3px] bg-zinc-400" /> College archive</span>
        <span className="flex items-center gap-1.5"><i className="inline-block size-2.5 rounded-full border border-dashed border-emerald-500 bg-emerald-500/20" /> Relatively unexplored</span>
        <span>Colour = topic cluster. Numbers = your {NEIGHBOURS} closest matches. Click a repo to open it.</span>
      </div>
    </Card>
  );
}

function Side({ landscape, hoverId, setHoverId, part }) {   // part: 0 = who is crowding you, 1 = white space, 2 = topic clusters
  const points = arr(landscape.points);
  const clusters = arr(landscape.clusters);
  const ws = landscape.white_space || {};
  const opps = arr(ws.opportunities);
  const clusterLabel = (id) => (clusters.find((c) => c.id === id) || {}).label;
  const fidelity = Number(landscape.map_fidelity);
  const others = points.filter((p) => p.source !== "proposal");
  const near = closest(points, NEIGHBOURS);
  const highly = others.filter((p) => (Number(p.similarity) || 0) >= 0.7).length;
  const examples = (id) =>
    others.filter((p) => p.cluster === id).sort((a, b) => (Number(b.similarity) || 0) - (Number(a.similarity) || 0)).slice(0, 3).map((p) => p.title);

  const parts = [
      <Card className="p-5" key="neighbours">
        <SectionTitle eyebrow="Your neighbourhood">Who is crowding you</SectionTitle>
        <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
          {highly} of {others.length} compared projects are highly similar to your idea. The closest {near.length}, numbered on the map:
        </p>
        <ol className="space-y-1">
          {near.map((p, i) => {
            const body = (
              <>
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: colorOf(p.cluster) }}>
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 text-sm font-medium">
                    <span className="break-all">{p.title}</span>
                    <Chip tone={p.source === "internal" ? "violet" : "zinc"}>{sourceName(p)}</Chip>
                    <span className="text-xs font-normal tabular-nums text-zinc-400">{pct(p)}% similar</span>
                  </span>
                  {p.description ? <span className="mt-0.5 line-clamp-2 block text-xs text-zinc-500 dark:text-zinc-400">{p.description}</span> : null}
                </span>
              </>
            );
            const row = cn("flex gap-2.5 rounded-xl px-2 py-1.5 transition-colors", hoverId === p.id && "bg-zinc-100 dark:bg-zinc-800/70");
            return (
              <li key={p.id} onMouseEnter={() => setHoverId(p.id)} onMouseLeave={() => setHoverId(null)}>
                {p.url ? (
                  <a className={cn(row, "outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60")} href={p.url} rel="noopener noreferrer" target="_blank">
                    {body}
                  </a>
                ) : (
                  <div className={row}>{body}</div>
                )}
              </li>
            );
          })}
        </ol>
      </Card>,

      <Card className="p-5" key="white-space">
        <SectionTitle eyebrow="White space">Where you could be different</SectionTitle>
        {ws.summary ? <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{ws.summary}</p> : null}
        <div className="mt-3 space-y-2.5">
          {opps.length ? (
            opps.map((o, i) => (
              <div className="rounded-2xl bg-emerald-500/[0.07] p-3.5" key={`${o.title}-${i}`}>
                <p className="flex items-start gap-2 text-sm font-medium">
                  <Icon className="mt-0.5 size-3.5 text-emerald-600 dark:text-emerald-300" name="spark" />
                  {o.title}
                </p>
                {o.reasoning ? <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{o.reasoning}</p> : null}
                {clusterLabel(o.nearest_cluster) ? (
                  <Chip className="mt-2" tone="zinc">Near: {clusterLabel(o.nearest_cluster)}</Chip>
                ) : null}
              </div>
            ))
          ) : (
            <p className="text-sm text-zinc-500">No white-space suggestions were generated for this run.</p>
          )}
        </div>
        <p className="mt-4 text-xs italic text-zinc-500">
          {ws.caveat || "Relatively unexplored means not covered in the compared set, not that nobody has built it."}
        </p>
      </Card>,

      <Card className="p-5" key="clusters">
        <SectionTitle eyebrow="Neighbourhoods">Topic clusters</SectionTitle>
        <ul className="space-y-3">
          {clusters.map((c) => (
            <li className="flex gap-3" key={c.id}>
              <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: colorOf(c.id) }} />
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {c.label}
                  <span className="text-xs font-normal text-zinc-400">{c.size} projects</span>
                  {c.contains_proposal ? <Chip tone="amber">you are here</Chip> : null}
                </p>
                {c.description ? <p className="text-xs text-zinc-500 dark:text-zinc-400">{c.description}</p> : null}
                {examples(c.id).length ? <p className="mt-0.5 text-xs text-zinc-400">e.g. {examples(c.id).join(", ")}</p> : null}
              </div>
            </li>
          ))}
        </ul>
        {Number.isFinite(fidelity) ? (
          <div className="mt-5 border-t border-zinc-100 pt-4 dark:border-white/10">
            <div className="mb-1.5 flex items-center justify-between text-xs text-zinc-500">
              <span>Map fidelity</span>
              <span className="tabular-nums">{Math.round(fidelity * 100)}%</span>
            </div>
            <Meter tone={fidelity > 0.6 ? "green" : "amber"} value={fidelity} />
            <p className="mt-1.5 text-xs text-zinc-400">A 2D map squeezes a lot of meaning flat. Lower fidelity means distances are rougher.</p>
          </div>
        ) : null}
      </Card>,
  ];
  return parts[part];
}

export default function Landscape({ landscape }) {
  const [view, setView] = useState("terrain");
  const [hoverId, setHoverId] = useState(null); // shared by the map and the "who is crowding you" list
  const ok = useMemo(() => landscape && arr(landscape.points).length >= 3, [landscape]);

  if (!ok) {
    return (
      <Card className="p-10 text-center">
        <p className="font-display text-xl font-semibold">Not enough neighbours to draw a landscape</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500">
          The map needs at least three compared projects. Try again with GitHub available, or add more description to your proposal.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-zinc-500 dark:text-zinc-400">
          Every project is a point placed by meaning. Close together = similar idea. The terrain shows how crowded each patch of the map is.
        </p>
        <Segmented
          label="Landscape view"
          onChange={setView}
          options={[
            { id: "terrain", label: "Terrain", icon: "map" },
            { id: "points", label: "Points", icon: "target" },
          ]}
          value={view}
        />
      </div>
      {/* Two independent columns: the map + white space on the left, neighbours + clusters on the right,
          so whichever column is shorter never leaves a gap (on small screens everything stacks in reading order). */}
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <div className="contents lg:flex lg:flex-col lg:gap-5">
          <div className="order-1 min-w-0">
            {view === "terrain" ? <IdeaTerrain landscape={landscape} title="Idea terrain" /> : <PointsMap hoverId={hoverId} landscape={landscape} setHoverId={setHoverId} />}
          </div>
          <div className="order-3 min-w-0"><Side hoverId={hoverId} landscape={landscape} part={1} setHoverId={setHoverId} /></div>
        </div>
        <div className="contents lg:flex lg:flex-col lg:gap-5">
          <div className="order-2 min-w-0"><Side hoverId={hoverId} landscape={landscape} part={0} setHoverId={setHoverId} /></div>
          <div className="order-4 min-w-0"><Side hoverId={hoverId} landscape={landscape} part={2} setHoverId={setHoverId} /></div>
        </div>
      </div>
    </div>
  );
}
