import { useCallback, useEffect, useRef, useState } from "react";
import TopoBackground from "@/components/kokonutui/topo-background";
import Stepper from "@/components/Stepper";
import { Chip, Icon, Logo, Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";
import Results from "./Results";

const POLL_MS = 1000;
const GIVE_UP_MS = 180000; // stop polling after 3 minutes
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One place for all backend calls: real error text instead of "failed".
async function api(path, options) {
  let res;
  try {
    res = await fetch(`/api${path}`, options);
  } catch {
    throw new Error("Cannot reach the backend. Is `uvicorn main:app --reload` running on port 8000?");
  }
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      const d = body.detail ?? body.error;
      if (d) msg = typeof d === "string" ? d : JSON.stringify(d);
    } catch {
      /* keep the generic message */
    }
    throw new Error(msg);
  }
  return res.json();
}

const splitLines = (s) => s.split(/\n|;/).map((x) => x.trim()).filter(Boolean);
const splitCommas = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);

const FIELD =
  "w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-400/30 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-600";

function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const flip = () => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("idearadar-theme", next ? "dark" : "light");
    } catch {
      /* private mode: fine */
    }
    setDark(next);
  };
  return (
    <button
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="flex size-9 items-center justify-center rounded-full border border-zinc-200 text-zinc-600 outline-none transition-colors hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-violet-400/60 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-white/10"
      onClick={flip}
      type="button"
    >
      <Icon name={dark ? "sun" : "moon"} />
    </button>
  );
}

function Health({ health }) {
  if (!health) return null;
  if (health.offline) return <Chip tone="red">Backend offline</Chip>;
  return (
    <div className="hidden items-center gap-1.5 sm:flex">
      <Chip tone="green">Backend online</Chip>
      <Chip tone={health.gemini ? "green" : "amber"}>{health.gemini ? "Gemini on" : "Gemini off (approximate mode)"}</Chip>
      <Chip tone={health.github ? "green" : "amber"}>{health.github ? "GitHub token" : "GitHub: no token"}</Chip>
    </div>
  );
}

const HOW = [
  { icon: "target", title: "Find the overlap", text: "Real GitHub repos plus past college projects, ranked by meaning, not keywords." },
  { icon: "spark", title: "Explain it", text: "Feature-by-feature table and an originality score where every point is accounted for." },
  { icon: "map", title: "Show where to differ", text: "The idea landscape: a terrain of crowded and relatively unexplored ground." },
];

export default function App() {
  const [health, setHealth] = useState(null);
  const [demos, setDemos] = useState([]);
  const [form, setForm] = useState({ title: "", description: "", features: "", tech: "" });
  const [status, setStatus] = useState("idle"); // idle | running | done | error
  const [stage, setStage] = useState("");
  const [label, setLabel] = useState("");
  const [startedAt, setStartedAt] = useState(Date.now());
  const [result, setResult] = useState(null);
  const [jobId, setJobId] = useState("");
  const [error, setError] = useState("");
  const token = useRef(0);
  const resultsRef = useRef(null);

  useEffect(() => {
    api("/health").then(setHealth).catch(() => setHealth({ offline: true }));
    api("/demos").then((d) => setDemos(Array.isArray(d) ? d : [])).catch(() => setDemos([]));
    return () => {
      token.current += 1; // stop any polling loop on unmount
    };
  }, []);

  const start = useCallback(async (payload, name) => {
    const mine = ++token.current;
    setStatus("running");
    setResult(null);
    setError("");
    setStage("Sending to the analyzer");
    setLabel(name);
    setStartedAt(Date.now());
    try {
      const { job_id } = await api("/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setJobId(job_id);
      const t0 = Date.now();
      while (token.current === mine) {
        await sleep(POLL_MS);
        if (token.current !== mine) return;
        if (Date.now() - t0 > GIVE_UP_MS) {
          throw new Error("This is taking over 3 minutes. Check the backend terminal for errors, then try again.");
        }
        const job = await api(`/jobs/${job_id}`);
        if (token.current !== mine) return;
        if (job.stage) setStage(job.stage);
        if (job.status === "done") {
          setResult(job.result);
          setStatus("done");
          return;
        }
        if (job.status === "error") throw new Error(job.error || "The analysis failed on the server.");
      }
    } catch (e) {
      if (token.current !== mine) return;
      setError(e.message || String(e));
      setStatus("error");
    }
  }, []);

  // After a result arrives, bring it into view.
  useEffect(() => {
    if (status === "done" && resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [status]);

  const submit = (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setError("Give your project a title first.");
      setStatus("error");
      return;
    }
    start(
      {
        title: form.title.trim(),
        description: form.description.trim(),
        features: splitLines(form.features),
        tech_stack: splitCommas(form.tech),
      },
      form.title.trim()
    );
  };

  const runDemo = (d) => start({ demo_id: d.id, title: d.title }, d.title);
  const reset = () => {
    token.current += 1;
    setStatus("idle");
    setError("");
    setResult(null);
  };

  const running = status === "running";
  const showForm = status === "idle" || status === "error";
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2.5">
          <Logo className="text-violet-500 dark:text-violet-300" />
          <span className="font-display text-lg font-semibold tracking-tight">IdeaRadar</span>
        </div>
        <div className="flex items-center gap-3">
          <Health health={health} />
          <ThemeToggle />
        </div>
      </header>

      <TopoBackground
        className={cn(
          "text-violet-700/80 dark:text-violet-300 transition-[min-height] duration-500",
          showForm ? "min-h-[680px] py-10" : "min-h-[340px] py-8"
        )}
      >
        <div className="relative z-10 w-full max-w-3xl px-6">
          {showForm ? (
            <div className="rise">
              <div className="mb-8 text-center">
                <Chip className="mb-4" tone="violet">GDG DevSprint · PS-5</Chip>
                <h1 className="font-display text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
                  Is your idea already out there?
                </h1>
                <p className="mx-auto mt-3 max-w-xl text-balance text-base text-zinc-600 dark:text-zinc-400">
                  Paste a project proposal. IdeaRadar finds similar repos and past projects, explains the overlap,
                  and shows where you can be different.
                </p>
              </div>

              <form
                className="space-y-3 rounded-3xl border border-zinc-200 bg-white/85 p-5 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80"
                onSubmit={submit}
              >
                <input
                  aria-label="Project title"
                  className={FIELD}
                  onChange={set("title")}
                  placeholder="Project title, e.g. Face-recognition attendance app"
                  value={form.title}
                />
                <textarea
                  aria-label="Description"
                  className={cn(FIELD, "min-h-24 resize-y")}
                  onChange={set("description")}
                  placeholder="What problem does it solve, and for whom?"
                  value={form.description}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <textarea
                    aria-label="Features"
                    className={cn(FIELD, "min-h-20 resize-y")}
                    onChange={set("features")}
                    placeholder={"Key features (one per line)\nQR check-in\nMonthly report"}
                    value={form.features}
                  />
                  <textarea
                    aria-label="Tech stack"
                    className={cn(FIELD, "min-h-20 resize-y")}
                    onChange={set("tech")}
                    placeholder="Tech stack, comma separated: React, FastAPI, SQLite"
                    value={form.tech}
                  />
                </div>

                {status === "error" && error ? (
                  <div className="flex items-start gap-2 rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300" role="alert">
                    <Icon className="mt-0.5" name="alert" />
                    <span>{error}</span>
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {demos.length ? <span className="text-xs text-zinc-500">Try a demo:</span> : null}
                    {demos.map((d) => (
                      <button
                        className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-700 outline-none transition-colors hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-violet-400/60 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-white/10"
                        key={d.id}
                        onClick={() => runDemo(d)}
                        type="button"
                      >
                        {d.title}
                      </button>
                    ))}
                  </div>
                  <button
                    className="group inline-flex h-10 items-center gap-2 rounded-full bg-zinc-900 px-5 text-sm font-medium text-white outline-none transition-colors hover:bg-zinc-700 focus-visible:ring-2 focus-visible:ring-violet-400/60 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
                    type="submit"
                  >
                    Analyze idea
                    <Icon className="transition-transform duration-200 group-hover:translate-x-0.5" name="arrow" />
                  </button>
                </div>
              </form>
            </div>
          ) : running ? (
            <div className="rise">
              <p className="mb-4 text-center font-display text-2xl font-semibold tracking-tight">
                Scanning for <span className="text-violet-600 dark:text-violet-300">{label}</span>
              </p>
              <Stepper key={startedAt} stage={stage} startedAt={startedAt} />
              <div className="mt-4 text-center">
                <button className="text-xs text-zinc-500 underline-offset-4 hover:underline" onClick={reset} type="button">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="rise flex flex-col items-center gap-4 text-center">
              <Chip tone="green">Analysis ready</Chip>
              <p className="font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{label}</p>
              <button
                className="inline-flex h-9 items-center gap-2 rounded-full border border-zinc-300 bg-white/80 px-4 text-sm font-medium outline-none transition-colors hover:bg-white focus-visible:ring-2 focus-visible:ring-violet-400/60 dark:border-zinc-700 dark:bg-zinc-900/80 dark:hover:bg-zinc-900"
                onClick={reset}
                type="button"
              >
                New analysis
              </button>
            </div>
          )}
        </div>
      </TopoBackground>

      {status === "idle" ? (
        <section className="mx-auto grid max-w-5xl gap-4 px-6 pb-16 sm:grid-cols-3">
          {HOW.map((h) => (
            <div className="rounded-3xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950" key={h.title}>
              <span className="mb-3 flex size-9 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-300">
                <Icon className="size-4.5" name={h.icon} />
              </span>
              <p className="font-medium">{h.title}</p>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{h.text}</p>
            </div>
          ))}
        </section>
      ) : null}

      {status === "done" && result ? (
        <main className="mx-auto max-w-6xl px-6 pb-20 pt-4" ref={resultsRef}>
          <Results title={label} onLoadSection={(name) => api(`/jobs/${jobId}/${name}`, { method: "POST" })} result={result} />
        </main>
      ) : null}

      {running ? (
        <p className="flex items-center justify-center gap-2 pb-16 text-xs text-zinc-500">
          <Spinner className="size-3" /> Results appear here when the analysis finishes.
        </p>
      ) : null}
    </div>
  );
}
