import { useEffect, useRef, useState } from "react";
import { Card, Chip, Icon, Meter, Segmented, SectionTitle, Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";
import Landscape from "./Landscape";
import { buildReport, copyText, downloadText, reportFileName } from "@/lib/report";

const arr = (v) => (Array.isArray(v) ? v : []);
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

const BANDS = {
  distinctive: { tone: "green", text: "Distinctive", ring: "#10b981", blurb: "Few close matches. Your angle looks fairly open." },
  crowded: { tone: "amber", text: "Crowded", ring: "#f59e0b", blurb: "Real overlap exists. Differentiation will matter." },
  saturated: { tone: "red", text: "Saturated", ring: "#f43f5e", blurb: "Very close matches found. Consider a pivot or a sharper niche." },
};

const MODES = {
  live: { tone: "green", text: "Live analysis" },
  cached: { tone: "sky", text: "Replayed from cache" },
  degraded: { tone: "amber", text: "Approximate: some services were unavailable" },
};

function ScoreRing({ score, color }) {
  // Start empty, then fill, so the ring animates in once.
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(score));
    return () => cancelAnimationFrame(id);
  }, [score]);
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative mx-auto size-40">
      <svg className="size-full -rotate-90" viewBox="0 0 120 120">
        <circle className="stroke-zinc-100 dark:stroke-white/10" cx="60" cy="60" fill="none" r={r} strokeWidth="9" />
        <circle
          cx="60"
          cy="60"
          fill="none"
          r={r}
          stroke={color}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0, Math.min(100, shown)) / 100)}
          strokeLinecap="round"
          strokeWidth="9"
          style={{ transition: "stroke-dashoffset 1100ms cubic-bezier(0.23, 1, 0.32, 1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-5xl font-semibold tabular-nums tracking-tight">{Math.round(score)}</span>
        <span className="text-[11px] uppercase tracking-[0.14em] text-zinc-400">originality</span>
      </div>
    </div>
  );
}

function ScoreCard({ originality }) {
  const score = num(originality.score);
  const band = BANDS[originality.band] || BANDS[score >= 70 ? "distinctive" : score >= 40 ? "crowded" : "saturated"];
  const rows = arr(originality.breakdown);
  return (
    <Card className="p-6">
      <ScoreRing color={band.ring} score={score} />
      <div className="mt-4 text-center">
        <Chip tone={band.tone}>{band.text}</Chip>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">{band.blurb}</p>
      </div>
      {rows.length ? (
        <div className="mt-6 space-y-4 border-t border-zinc-100 pt-5 dark:border-white/10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Where the points went</p>
          {rows.map((b, i) => (
            <div key={`${b.factor}-${i}`}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium">{b.factor}</span>
                <span className="shrink-0 tabular-nums text-rose-600 dark:text-rose-300">−{Math.round(num(b.penalty))}</span>
              </div>
              <Meter className="mt-1.5" tone={num(b.value) > 0.66 ? "red" : num(b.value) > 0.33 ? "amber" : "green"} value={num(b.value)} />
              {b.note ? <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{b.note}</p> : null}
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function Understanding({ proposal }) {
  const tags = (list, tone) => arr(list).map((t, i) => <Chip key={`${t}-${i}`} tone={tone}>{String(t)}</Chip>);
  return (
    <Card className="p-6">
      <SectionTitle eyebrow="How we read it">Your idea, in one breath</SectionTitle>
      {proposal.core_problem ? <p className="text-lg leading-relaxed text-zinc-800 dark:text-zinc-200">{proposal.core_problem}</p> : null}
      <dl className="mt-5 space-y-4 text-sm">
        {arr(proposal.target_users).length ? (
          <div>
            <dt className="mb-1.5 text-xs font-medium text-zinc-400">Who it is for</dt>
            <dd className="flex flex-wrap gap-1.5">{tags(proposal.target_users, "sky")}</dd>
          </div>
        ) : null}
        {arr(proposal.features).length ? (
          <div>
            <dt className="mb-1.5 text-xs font-medium text-zinc-400">Features we extracted</dt>
            <dd className="flex flex-wrap gap-1.5">{tags(proposal.features, "zinc")}</dd>
          </div>
        ) : null}
        {arr(proposal.tech).length ? (
          <div>
            <dt className="mb-1.5 text-xs font-medium text-zinc-400">Tech</dt>
            <dd className="flex flex-wrap gap-1.5">{tags(proposal.tech, "violet")}</dd>
          </div>
        ) : null}
        {arr(proposal.keywords).length ? (
          <div>
            <dt className="mb-1.5 text-xs font-medium text-zinc-400">Search keywords</dt>
            <dd className="flex flex-wrap gap-1.5">{tags(proposal.keywords, "amber")}</dd>
          </div>
        ) : null}
      </dl>
    </Card>
  );
}

const LEVELS = {
  high: { tone: "red", bar: "red", text: "High overlap" },
  medium: { tone: "amber", bar: "amber", text: "Some overlap" },
  low: { tone: "green", bar: "green", text: "Low overlap" },
};

const STATUS = {
  yes: { icon: "check", cls: "bg-rose-500/10 text-rose-600 dark:text-rose-300", text: "Already built" },
  partial: { icon: "minus", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-300", text: "Partly" },
  no: { icon: "x", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300", text: "Not in this repo" },
};

function MatchCard({ p, rank, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const lvl = LEVELS[p.level] || LEVELS.low;
  const pct = Math.round(num(p.similarity_pct));
  const rows = arr(p.feature_overlap);
  const why = p.why_similar || {};
  const isRepo = p.source === "github";
  const Title = p.url ? "a" : "span";
  return (
    <Card className="rise overflow-hidden" style={{ animationDelay: `${Math.min(rank, 6) * 60}ms` }}>
      <div className="p-5">
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone={isRepo ? "zinc" : "violet"}>
                <Icon className="size-3" name={isRepo ? "branch" : "archive"} />
                {isRepo ? "GitHub" : "College archive"}
              </Chip>
              {isRepo && num(p.stars) > 0 ? (
                <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
                  <Icon className="size-3 text-amber-500" name="star" />
                  {num(p.stars).toLocaleString()}
                </span>
              ) : null}
            </div>
            <Title
              className={cn("mt-2 flex items-center gap-1.5 text-lg font-semibold tracking-tight", p.url && "hover:underline")}
              {...(p.url ? { href: p.url, target: "_blank", rel: "noreferrer noopener" } : {})}
            >
              {p.name || "Untitled"}
              {p.url ? <Icon className="size-3.5 text-zinc-400" name="external" /> : null}
            </Title>
            {p.description ? <p className="mt-1 line-clamp-2 text-sm text-zinc-500 dark:text-zinc-400">{p.description}</p> : null}
          </div>
          <div className="shrink-0 text-right">
            <div className="font-display text-3xl font-semibold tabular-nums leading-none">
              {pct}
              <span className="text-lg text-zinc-400">%</span>
            </div>
            <Chip className="mt-2" tone={lvl.tone}>{lvl.text}</Chip>
          </div>
        </div>
        <Meter className="mt-4" tone={lvl.bar} value={pct / 100} />

        {why.summary ? <p className="mt-4 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{why.summary}</p> : null}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {why.same_problem != null ? (
            <Chip tone={why.same_problem ? "red" : "green"}>{why.same_problem ? "Same problem" : "Different problem"}</Chip>
          ) : null}
          {why.same_approach != null ? (
            <Chip tone={why.same_approach ? "red" : "green"}>{why.same_approach ? "Same approach" : "Different approach"}</Chip>
          ) : null}
          {p.coverage_pct != null ? <Chip tone="zinc">Covers {Math.round(num(p.coverage_pct))}% of your features</Chip> : null}
        </div>
      </div>

      {rows.length || arr(p.repo_extra_features).length ? (
        <>
          <button
            aria-expanded={open}
            className="flex w-full items-center justify-between border-t border-zinc-100 px-5 py-3 text-left text-sm font-medium text-zinc-600 outline-none transition-colors hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400/50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
            onClick={() => setOpen((o) => !o)}
            type="button"
          >
            Feature-by-feature overlap
            <Icon className={cn("transition-transform duration-200", open && "rotate-180")} name="chevron" />
          </button>
          {open ? (
            <div className="border-t border-zinc-100 px-5 pb-5 pt-2 dark:border-white/10">
              {rows.length ? (
                <ul className="divide-y divide-zinc-100 dark:divide-white/10">
                  {rows.map((r, i) => {
                    const st = STATUS[r.status] || STATUS.no;
                    return (
                      <li className="flex items-start gap-3 py-2.5 text-sm" key={`${r.feature}-${i}`}>
                        <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full", st.cls)} title={st.text}>
                          <Icon className="size-3" name={st.icon} />
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium">{r.feature}</p>
                          {r.note ? <p className="text-xs text-zinc-500 dark:text-zinc-400">{r.note}</p> : null}
                        </div>
                        <span className="ml-auto shrink-0 text-xs text-zinc-400">{st.text}</span>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              {arr(p.repo_extra_features).length ? (
                <div className="mt-3">
                  <p className="mb-1.5 text-xs font-medium text-zinc-400">Things it does that you don't (yet)</p>
                  <div className="flex flex-wrap gap-1.5">
                    {arr(p.repo_extra_features).map((f, i) => (
                      <Chip key={`${f}-${i}`} tone="sky">{String(f)}</Chip>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}

const EFFORT = { low: "green", med: "amber", high: "red" };

function Advice({ rec }) {
  const gaps = arr(rec.gaps);
  const sugg = arr(rec.suggestions);
  return (
    <div className="space-y-6">
      {rec.positioning_statement ? (
        <Card className="relative overflow-hidden p-7">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-500 dark:text-violet-300">Your positioning statement</p>
          <p className="mt-3 font-display text-2xl leading-snug tracking-tight text-balance sm:text-3xl">{rec.positioning_statement}</p>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <SectionTitle eyebrow="Gaps">What the compared projects leave open</SectionTitle>
          <div className="space-y-3">
            {gaps.length ? (
              gaps.map((g, i) => (
                <Card className="p-4" key={`${g.gap}-${i}`}>
                  <p className="font-medium">{g.gap}</p>
                  {g.why_it_matters ? <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{g.why_it_matters}</p> : null}
                </Card>
              ))
            ) : (
              <p className="text-sm text-zinc-500">No gaps were identified for this run.</p>
            )}
          </div>
        </div>
        <div>
          <SectionTitle eyebrow="Make it distinctive">Ways to stand out</SectionTitle>
          <div className="space-y-3">
            {sugg.length ? (
              sugg.map((s, i) => (
                <Card className="p-4" key={`${s.title}-${i}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip tone={s.type === "pivot" ? "violet" : "green"}>{s.type === "pivot" ? "Pivot" : "Add"}</Chip>
                    {s.effort ? <Chip tone={EFFORT[s.effort] || "zinc"}>{s.effort} effort</Chip> : null}
                  </div>
                  <p className="mt-2 font-medium">{s.title}</p>
                  {s.detail ? <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{s.detail}</p> : null}
                </Card>
              ))
            ) : (
              <p className="text-sm text-zinc-500">No suggestions were generated for this run.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Advice and Landscape are built on demand: the quick result (score + matches) arrives first.
const SECTIONS = {
  advice: { label: "Advice", icon: "spark", busy: "Writing your differentiation advice. Usually 3 to 6 seconds.", cta: "Get differentiation advice",
            blurb: "Gaps the compared projects leave open, ways to stand out, and a positioning statement." },
  landscape: { label: "Landscape", icon: "map", busy: "Drawing the idea landscape and looking for white space. Usually 6 to 12 seconds.", cta: "Draw the idea landscape",
               blurb: "A map of your idea among its neighbours, who is crowding you, and the relatively unexplored areas." },
};

function SectionStatus({ name, state, onRetry }) {
  const s = SECTIONS[name];
  if (state.status === "loading") {
    return (
      <Card className="flex items-center justify-center gap-3 p-10 text-sm text-zinc-500" role="status">
        <Spinner className="size-4" /> {s.busy}
      </Card>
    );
  }
  return (
    <Card className="p-8 text-center">
      {state.status === "error" ? (
        <p className="mx-auto mb-4 flex max-w-md items-start justify-center gap-2 text-sm text-rose-700 dark:text-rose-300" role="alert">
          <Icon className="mt-0.5" name="alert" /> <span>{state.error}</span>
        </p>
      ) : (
        <p className="mx-auto mb-4 max-w-md text-sm text-zinc-500">{s.blurb}</p>
      )}
      <button
        className="inline-flex h-10 items-center gap-2 rounded-full bg-zinc-900 px-5 text-sm font-medium text-white outline-none transition-colors hover:bg-zinc-700 focus-visible:ring-2 focus-visible:ring-violet-400/60 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        onClick={onRetry}
        type="button"
      >
        <Icon name={s.icon} /> {state.status === "error" ? "Try again" : s.cta}
      </button>
    </Card>
  );
}

function SectionWarnings({ warnings, onRetry }) {
  if (!warnings.length) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      {warnings.map((w, i) => (
        <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 px-3 py-1.5 text-sm text-amber-800 dark:text-amber-200" key={`${w}-${i}`}>
          <Icon className="mt-0.5 size-3.5" name="alert" />
          <span>{w}</span>
        </div>
      ))}
      <button className="text-xs text-zinc-500 underline-offset-4 hover:underline" onClick={onRetry} type="button">Try again</button>
    </div>
  );
}

const BTN =
  "inline-flex h-9 items-center gap-2 rounded-full border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-800 outline-none transition-colors hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-violet-400/60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800";

// Download or copy the whole analysis as Markdown. Includes Advice / Landscape once they have been built.
function ExportBar({ getReport, fileName }) {
  const [note, setNote] = useState("");
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const say = (m) => {
    setNote(m);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setNote(""), 2500);
  };
  const safe = () => {
    try {
      return getReport();
    } catch {
      return null;
    }
  };
  const onDownload = () => {
    const md = safe();
    say(md && downloadText(fileName, md) ? "Report downloaded" : "Could not build the report");
  };
  const onCopy = async () => {
    const md = safe();
    say(md && (await copyText(md)) ? "Copied to clipboard" : "Copy failed. Try Download instead");
  };
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <span aria-live="polite" className="mr-1 text-xs text-zinc-500">
        {note || "Report includes Advice and Landscape once you've opened them"}
      </span>
      <button className={BTN} onClick={onCopy} type="button">
        <Icon name="copy" /> Copy
      </button>
      <button className={BTN} onClick={onDownload} type="button">
        <Icon name="download" /> Download .md
      </button>
    </div>
  );
}

export default function Results({ result, onLoadSection, title }) {
  const [tab, setTab] = useState("matches");
  const r = result || {};
  // If a result ever arrives with a section already inside, show it without asking the backend.
  const [sec, setSec] = useState({
    advice: r.recommendations ? { status: "done", data: { recommendations: r.recommendations, warnings: [] } } : { status: "idle" },
    landscape: r.landscape ? { status: "done", data: { landscape: r.landscape, warnings: [] } } : { status: "idle" },
  });
  const warnings = arr(r.warnings);
  const matches = arr(r.similar_projects);
  const mode = MODES[r.mode] || null;

  const load = async (name) => {
    setSec((s) => ({ ...s, [name]: { status: "loading" } }));
    try {
      const data = await onLoadSection(name);
      setSec((s) => ({ ...s, [name]: { status: "done", data } }));
    } catch (e) {
      setSec((s) => ({ ...s, [name]: { status: "error", error: e.message || String(e) } }));
    }
  };
  const open = (name) => {
    setTab(name);
    if (name !== "matches" && sec[name].status === "idle") load(name); // clicking a section builds it on the spot
  };

  const section = (name, render) => {
    const st = sec[name];
    if (st.status !== "done") return <SectionStatus name={name} onRetry={() => load(name)} state={st} />;
    return (
      <>
        <SectionWarnings onRetry={() => load(name)} warnings={arr(st.data.warnings)} />
        {render(st.data)}
      </>
    );
  };

  return (
    <div className="space-y-6">
      {mode || warnings.length ? (
        <div className="flex flex-wrap items-start gap-3">
          {mode ? <Chip tone={mode.tone}>{mode.text}</Chip> : null}
          {warnings.map((w, i) => (
            <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 px-3 py-1.5 text-sm text-amber-800 dark:text-amber-200" key={`${w}-${i}`}>
              <Icon className="mt-0.5 size-3.5" name="alert" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <ScoreCard originality={r.originality || {}} />
        <Understanding proposal={r.proposal || {}} />
      </div>

      <ExportBar
        fileName={reportFileName(title)}
        getReport={() =>
          buildReport({
            result: r,
            title,
            advice: sec.advice.status === "done" ? sec.advice.data?.recommendations : null,
            landscape: sec.landscape.status === "done" ? sec.landscape.data?.landscape : null,
          })
        }
      />

      <div className="flex justify-center pt-2">
        <Segmented
          label="Result sections"
          onChange={open}
          options={[
            { id: "matches", label: `Matches (${matches.length})`, icon: "target" },
            { id: "advice", label: "Advice", icon: "spark" },
            { id: "landscape", label: "Landscape", icon: "map" },
          ]}
          value={tab}
        />
      </div>

      {tab === "matches" ? (
        <div className="space-y-4">
          {matches.length ? (
            matches.map((p, i) => <MatchCard defaultOpen={i === 0} key={p.id || i} p={p} rank={i} />)
          ) : (
            <Card className="p-8 text-center text-sm text-zinc-500">No similar projects were found in the compared set.</Card>
          )}
          <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Want to know how to stand out? These are built on demand.</p>
            <div className="flex flex-wrap gap-2">
              {["advice", "landscape"].map((name) => (
                <button
                  className="inline-flex h-9 items-center gap-2 rounded-full border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-800 outline-none transition-colors hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-violet-400/60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                  key={name}
                  onClick={() => open(name)}
                  type="button"
                >
                  <Icon name={SECTIONS[name].icon} /> {SECTIONS[name].cta}
                </button>
              ))}
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "advice" ? section("advice", (d) => <Advice rec={d.recommendations || {}} />) : null}

      {tab === "landscape" ? section("landscape", (d) => <Landscape landscape={d.landscape} />) : null}
    </div>
  );
}
