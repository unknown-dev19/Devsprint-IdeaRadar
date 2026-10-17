// Small shared UI pieces in the KokonutUI look (zinc palette, big radii, soft rings).
// Icons are inline SVG on purpose: no icon package to install or break.
import { cn } from "@/lib/utils";

const PATHS = {
  check: "M20 6 9 17l-5-5",
  x: "M18 6 6 18M6 6l12 12",
  minus: "M5 12h14",
  chevron: "m6 9 6 6 6-6",
  external: "M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",
  star: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z",
  sun: "M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  moon: "M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z",
  arrow: "M5 12h14m-7-7 7 7-7 7",
  alert: "M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01",
  branch: "M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a9 9 0 0 1-9 9",
  archive: "M21 8v13H3V8M1 3h22v5H1zM10 12h4",
  spark: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z",
  target: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  map: "M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4zM8 2v16M16 6v16",
  download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
  copy: "M9 9h11v11H9zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1",
};

export function Icon({ name, className }) {
  return (
    <svg
      aria-hidden="true"
      className={cn("size-4 shrink-0", className)}
      fill={name === "star" ? "currentColor" : "none"}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d={PATHS[name] || ""} />
    </svg>
  );
}

export function Logo({ className }) {
  return (
    <svg aria-hidden="true" className={cn("size-6", className)} fill="none" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity=".35" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="6" stroke="currentColor" strokeOpacity=".6" strokeWidth="1.5" />
      <path d="M12 12 19 5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" />
      <circle cx="16.5" cy="14.5" r="1.4" fill="currentColor" />
    </svg>
  );
}

export function Spinner({ className }) {
  return (
    <svg aria-hidden="true" className={cn("size-4 animate-spin", className)} fill="none" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeLinecap="round" strokeWidth="3" />
    </svg>
  );
}

export function Card({ className, children, ...rest }) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-zinc-200 bg-white/85 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/75",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

const TONES = {
  zinc: "bg-zinc-100 text-zinc-700 dark:bg-white/10 dark:text-zinc-300",
  green: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  amber: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  red: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  sky: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  violet: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
};

export function Chip({ tone = "zinc", className, children }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        TONES[tone] || TONES.zinc,
        className
      )}
    >
      {children}
    </span>
  );
}

export function Meter({ value = 0, tone = "violet", className }) {
  const fills = {
    violet: "bg-violet-500",
    green: "bg-emerald-500",
    amber: "bg-amber-500",
    red: "bg-rose-500",
    sky: "bg-sky-500",
  };
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-white/10", className)}>
      <div
        className={cn("h-full rounded-full transition-[width] duration-700 ease-[cubic-bezier(0.23,1,0.32,1)]", fills[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** Pill switch with one sliding thumb (KokonutUI "mode switch" style). */
export function Segmented({ options, value, onChange, label = "View" }) {
  const index = Math.max(0, options.findIndex((o) => o.id === value));
  const n = options.length;
  return (
    <div
      aria-label={label}
      className="relative grid rounded-full bg-zinc-100 p-0.5 dark:bg-white/[0.06]"
      role="tablist"
      style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0.5 left-0.5 rounded-full bg-white shadow-sm ring-1 ring-black/5 transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] dark:bg-zinc-700 dark:ring-white/10"
        style={{ width: `calc((100% - 4px) / ${n})`, transform: `translateX(${index * 100}%)` }}
      />
      {options.map((o) => (
        <button
          aria-selected={o.id === value}
          className={cn(
            "relative z-10 flex h-8 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-violet-400/60",
            o.id === value
              ? "text-zinc-900 dark:text-white"
              : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
          )}
          key={o.id}
          onClick={() => onChange(o.id)}
          role="tab"
          type="button"
        >
          {o.icon ? <Icon className="size-3.5" name={o.icon} /> : null}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SectionTitle({ eyebrow, children, aside }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">{eyebrow}</p>
        ) : null}
        <h3 className="font-display text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{children}</h3>
      </div>
      {aside}
    </div>
  );
}
