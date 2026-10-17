import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon, Spinner } from "@/components/ui";

// The backend only sends free-text stage names, so each step matches on keywords.
// If nothing matches, the rail advances with elapsed time so it never looks frozen.
const STEPS = [
  { label: "Understand the idea", match: /extract|understand|pars|read/ },
  { label: "Search GitHub + archive", match: /search|retriev|github|fetch|candidate/ },
  { label: "Map meaning", match: /embed|rank|similar/ },
  { label: "Compare features", match: /compar|overlap|feature/ },
  { label: "Score the originality", match: /scor|originality/ },
];

export default function Stepper({ stage, startedAt }) {
  const [now, setNow] = useState(Date.now());
  const furthest = useRef(0);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const elapsed = Math.max(0, (now - startedAt) / 1000);
  const text = (stage || "").toLowerCase();
  let idx = -1;
  STEPS.forEach((s, i) => {
    if (s.match.test(text)) idx = i;
  });
  if (idx < 0) idx = Math.min(STEPS.length - 1, Math.floor(elapsed / 7));
  furthest.current = Math.max(furthest.current, idx);
  const active = furthest.current;

  return (
    <div className="mx-auto w-full max-w-2xl rounded-3xl border border-zinc-200 bg-white/85 p-6 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/75">
      <ol className="space-y-2.5">
        {STEPS.map((s, i) => {
          const done = i < active;
          const current = i === active;
          return (
            <li className="flex items-center gap-3 text-sm" key={s.label}>
              <span
                className={cn(
                  "flex size-5 items-center justify-center rounded-full transition-colors duration-300",
                  done && "bg-emerald-500 text-white",
                  current && "text-violet-500 dark:text-violet-300",
                  !done && !current && "bg-zinc-100 dark:bg-white/10"
                )}
              >
                {done ? <Icon className="size-3" name="check" /> : current ? <Spinner /> : null}
              </span>
              <span
                className={cn(
                  "transition-colors duration-300",
                  done && "text-zinc-500 dark:text-zinc-400",
                  current && "font-medium text-zinc-900 dark:text-white",
                  !done && !current && "text-zinc-400 dark:text-zinc-600"
                )}
              >
                {s.label}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="mt-5 flex items-center justify-between gap-3 rounded-xl bg-zinc-100 px-3 py-2 font-mono text-xs text-zinc-600 dark:bg-white/5 dark:text-zinc-300">
        <span className="min-w-0 truncate">
          <span className="text-violet-500 dark:text-violet-300">&gt;</span> {stage || "Starting"}
          <span className="caret ml-0.5">_</span>
        </span>
        <span className="shrink-0 tabular-nums text-zinc-400">{elapsed.toFixed(0)}s</span>
      </div>
    </div>
  );
}
