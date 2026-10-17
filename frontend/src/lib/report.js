// Builds a Markdown report from an IdeaRadar result. Pure functions only:
// no network, no DOM, never throws on odd input (every field is read defensively).

const arr = (v) => (Array.isArray(v) ? v : []);
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const str = (v) => (v == null ? "" : String(v).trim());

// Keep table cells on one line and stop "|" from breaking the table.
const cell = (v) => str(v).replace(/\r?\n+/g, " ").replace(/\|/g, "\\|") || " ";

const BAND = { distinctive: "Distinctive", crowded: "Crowded", saturated: "Saturated" };
const LEVEL = { high: "High overlap", medium: "Some overlap", low: "Low overlap" };
const STATUS = { yes: "Already built", partial: "Partly", no: "Not in this repo" };

export function reportFileName(title) {
  const slug = str(title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);
  return `ideaRadar-${slug || "report"}.md`;
}

/**
 * @param {object} o
 * @param {object} o.result       the finished job result
 * @param {string} [o.title]      project title typed by the user
 * @param {object} [o.advice]     recommendations object, if the Advice tab was built
 * @param {object} [o.landscape]  landscape object, if the Landscape tab was built
 */
export function buildReport({ result, title, advice, landscape } = {}) {
  const r = result || {};
  const p = r.proposal || {};
  const o = r.originality || {};
  const score = Math.round(num(o.score));
  const band = BAND[o.band] || (score >= 70 ? "Distinctive" : score >= 40 ? "Crowded" : "Saturated");
  const out = [];

  out.push(`# IdeaRadar report: ${str(title) || "Untitled project"}`);
  out.push(`_Generated ${new Date().toLocaleString()}_`);

  const warnings = arr(r.warnings);
  if (r.mode === "degraded" || warnings.length) {
    out.push(
      `> **Note:** some services were unavailable, so scores are approximate.` +
        (warnings.length ? "\n" + warnings.map((w) => `> - ${str(w)}`).join("\n") : "")
    );
  }

  out.push(`## Originality score: ${score}/100 (${band})`);
  const rows = arr(o.breakdown);
  if (rows.length) {
    out.push(
      ["| Factor | Points lost | Note |", "|---|---|---|"]
        .concat(rows.map((b) => `| ${cell(b.factor)} | -${Math.round(num(b.penalty))} | ${cell(b.note)} |`))
        .join("\n")
    );
  }

  out.push("## How we read the idea");
  const read = [];
  if (str(p.core_problem)) read.push(`**Core problem:** ${str(p.core_problem)}`);
  if (arr(p.target_users).length) read.push(`**Who it is for:** ${arr(p.target_users).map(str).join(", ")}`);
  if (arr(p.features).length) read.push(`**Features:** ${arr(p.features).map(str).join("; ")}`);
  if (arr(p.tech).length) read.push(`**Tech:** ${arr(p.tech).map(str).join(", ")}`);
  out.push(read.join("\n\n") || "_Nothing was extracted._");

  const matches = arr(r.similar_projects);
  out.push(`## Closest existing projects (${matches.length})`);
  if (!matches.length) out.push("_No similar projects were found in the compared set._");
  matches.forEach((m, i) => {
    const name = str(m.name) || "Untitled";
    const heading = m.url ? `[${name}](${m.url})` : name;
    const src = m.source === "github" ? "GitHub" : "College archive";
    const lines = [`### ${i + 1}. ${heading}`];
    lines.push(`${src} · **${Math.round(num(m.similarity_pct))}% similar** (${LEVEL[m.level] || "Low overlap"})` +
      (m.coverage_pct != null ? ` · covers ${Math.round(num(m.coverage_pct))}% of your features` : ""));
    const why = m.why_similar || {};
    if (str(why.summary)) lines.push(str(why.summary));
    const fo = arr(m.feature_overlap);
    if (fo.length) {
      lines.push(
        ["| Your feature | Status | Note |", "|---|---|---|"]
          .concat(fo.map((f) => `| ${cell(f.feature)} | ${STATUS[f.status] || STATUS.no} | ${cell(f.note)} |`))
          .join("\n")
      );
    }
    out.push(lines.join("\n\n"));
  });

  if (advice) {
    out.push("## How to stand out");
    if (str(advice.positioning_statement)) out.push(`> **Positioning:** ${str(advice.positioning_statement)}`);
    const gaps = arr(advice.gaps);
    if (gaps.length) {
      out.push("### Gaps the compared projects leave open");
      out.push(gaps.map((g) => `- **${str(g.gap)}**${str(g.why_it_matters) ? `: ${str(g.why_it_matters)}` : ""}`).join("\n"));
    }
    const sugg = arr(advice.suggestions);
    if (sugg.length) {
      out.push("### Suggestions");
      out.push(
        sugg
          .map((s) => `- **[${s.type === "pivot" ? "Pivot" : "Add"}${s.effort ? `, ${str(s.effort)} effort` : ""}] ${str(s.title)}**${str(s.detail) ? `: ${str(s.detail)}` : ""}`)
          .join("\n")
      );
    }
  }

  if (landscape) {
    const ws = landscape.white_space || {};
    const opps = arr(ws.opportunities);
    out.push("## Relatively unexplored areas");
    if (str(ws.summary)) out.push(str(ws.summary));
    if (opps.length) out.push(opps.map((x) => `- **${str(x.title)}**${str(x.reasoning) ? `: ${str(x.reasoning)}` : ""}`).join("\n"));
    out.push(`_${str(ws.caveat) || "These areas are relatively unexplored in the compared set only, not a guarantee of opportunity."}_`);
  }

  out.push("---\n_Compared against a limited set of GitHub repositories and a seeded college archive. Treat results as guidance, not proof of novelty._");
  return out.join("\n\n") + "\n";
}

/** Saves text as a file in the browser. Returns true if the download was triggered. */
export function downloadText(filename, text) {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}

/** Copies text to the clipboard, with an old-browser fallback. Returns true on success. */
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
