import json, re, time
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from pathlib import Path
import config as C, cache, llm, github, landscape
from embed import embed, local as local_embed

SEED = json.loads((Path(__file__).parent / "data" / "seed_projects.json").read_text())
words = lambda s: set(re.findall(r"[a-z]{4,}", s.lower()))
QSTOP = set("that with from this using uses based application platform which web app system".split())

def fallback_keywords(p):
    """Offline search queries (ordered, so cache keys stay stable between runs)."""
    kw = [p["title"]] + [" ".join(f.split()[:3]) for f in p["features"][:2]]
    d = [w for w in re.findall(r"[a-z]{4,}", p["description"].lower()) if w not in QSTOP][:4]
    if d: kw.append(" ".join(d))
    return [k for k in kw if k.strip()]

def extract(p):
    prompt = ("Extract a structured summary from this project proposal. JSON only:\n"
              '{"core_problem":"1 sentence","target_users":["..."],"features":["max 10 short noun phrases"],"tech":["..."],"keywords":["..."]}\n'
              '"keywords" = exactly 4 GitHub search queries, 2-4 words each: one broad (the problem), one about the approach, '
              "one niche/unusual angle, one domain+tech. No quotes or operators.\n"
              f"Title: {p['title']}\nDescription: {p['description']}\nFeatures: {p['features']}\nTech: {p['tech_stack']}")
    fb = {"core_problem": p["description"][:160], "target_users": [], "features": p["features"], "tech": p["tech_stack"],
          "keywords": fallback_keywords(p)}
    out = llm.gen_json(prompt, fb) or fb
    for k, v in fb.items(): out.setdefault(k, v)
    for k in ("target_users", "features", "tech", "keywords"):      # the LLM may return odd shapes: keep lists of strings
        v = out[k] if isinstance(out[k], list) else [out[k]]
        out[k] = [str(x) for x in v if isinstance(x, (str, int, float)) and str(x).strip()]
    if not out["keywords"]: out["keywords"] = fb["keywords"]
    return out

def compare(ex, it, sim):
    prompt = ('Compare the PROPOSAL with the REPO using ONLY the repo text given; if a feature is not mentioned, mark "no". JSON only:\n'
              '{"feature_overlap":[{"feature":"<each proposal feature>","status":"yes|no|partial","note":"<=12 words"}],'
              '"same_problem":true,"same_approach":true,"summary":"2 plain-language sentences on why it is similar or different",'
              '"repo_extra_features":["max 4"]}\n'
              f"PROPOSAL: {json.dumps(ex)}\nREPO: {it['title']}. {it['text']}")
    w = words(it["text"])
    fb = {"feature_overlap": [{"feature": f, "status": "partial" if words(f) & w else "no", "note": "word match (offline)"} for f in ex["features"]],
          "same_problem": sim >= .7, "same_approach": sim >= .7,
          "summary": "AI comparison unavailable; this match is based on text-embedding similarity.", "repo_extra_features": []}
    return llm.gen_json(prompt, fb) or fb

def recommend(ex, comps):
    seen = [{"repo": c["name"], "covers": [r["feature"] for r in c["feature_overlap"] if r.get("status") != "no"], "extra": c["repo_extra_features"]} for c in comps]
    prompt = ("Given the proposal and its closest existing projects, find what NONE of them cover. JSON only:\n"
              '{"gaps":[{"gap":"specific","why_it_matters":"..."}],"suggestions":[{"type":"add|pivot","title":"...","detail":"1-2 sentences","effort":"low|med|high"}],'
              '"positioning_statement":"one sentence for the judges"}\n'
              "3-4 gaps (e.g. offline mode, regional languages, unusual user group, privacy angle) and exactly 3-5 suggestions. "
              "Never suggest a feature already covered. Keep it feasible for a 6-hour team.\n"
              f"PROPOSAL: {json.dumps(ex)}\nCLOSEST PROJECTS: {json.dumps(seen)}")
    fb = {"gaps": [{"gap": "Offline / low-connectivity mode", "why_it_matters": "Most student projects assume good internet."},
                   {"gap": "Regional-language support", "why_it_matters": "Widens the user base beyond English speakers."},
                   {"gap": "Accessibility for under-served users", "why_it_matters": "Few compared projects target them."}],
          "suggestions": [{"type": "add", "title": "Offline-first mode", "detail": "Cache data locally and sync when online.", "effort": "med"},
                          {"type": "add", "title": "Multilingual input", "detail": "Accept Hindi/Gujarati text or voice.", "effort": "low"},
                          {"type": "pivot", "title": "Target an under-served user group", "detail": "Narrow the idea to one group the compared set ignores.", "effort": "med"}],
          "positioning_statement": "(Generic fallback: AI recommendations were unavailable.)"}
    return llm.gen_json(prompt, fb) or fb

def _ck(p): return cache.key("result", C.CACHE_VERSION, C.LLM_MODEL, C.EMBED_MODEL, p)
def _texts(p, items):
    return [f"{p['title']}. {p['description']} Features: {', '.join(p['features'])}"] + [f"{it['title']}. {it['text']}" for it in items]

def prepare(p, stage=lambda s: None):
    """Stages 1-4: extract, retrieve, embed, rank. Returns a ctx dict. Everything here is disk-cached,
    so the landscape section can rebuild it after a server restart or a cache replay without any network."""
    warns = []
    if not llm.client(): warns.append("No Gemini key: running in offline mode with approximate text matching.")

    stage("Understanding your idea"); ex = extract(p)

    stage("Searching GitHub"); cands, seen = [], set()
    qs = ex["keywords"][:C.QUERIES]
    with ThreadPoolExecutor(max_workers=max(1, len(qs))) as pool: found = list(pool.map(github.search, qs))   # queries run in parallel
    failed = False
    for res in found:                      # merged in query order, so the result is the same as the old sequential loop
        if res is None: failed = True; continue
        for it in res:
            if it["id"] not in seen: seen.add(it["id"]); cands.append(it)
    if failed: warns.append("Some GitHub searches failed: results may be incomplete." if cands else "GitHub unavailable: using the college project archive only.")
    items = cands + [{**sd, "source": "internal", "url": None} for sd in SEED]
    for it in items: it["text"] = f"{it['description']} {' '.join(it.get('topics', []))}".strip()

    stage("Embedding and ranking")
    texts = _texts(p, items)
    X, mode = embed(texts)
    if mode == "local": warns.append("Gemini embeddings unavailable: similarity scores are approximate.")
    if len(X) != len(items) + 1:     # safety net: never let a bad embedding response crash the job
        print(f"EMBED shape mismatch ({len(X)} vectors for {len(items)+1} texts): using local embeddings")
        X, mode = np.array([local_embed(t) for t in texts]), "local"
        warns.append("Gemini embeddings unavailable: similarity scores are approximate.")
    Xn = X / (np.linalg.norm(X, axis=1, keepdims=True) + 1e-9)
    lo, hi = C.THRESH[mode]
    norm = np.clip((Xn[1:] @ Xn[0] - lo) / (hi - lo), 0, 1)
    return {"p": p, "ex": ex, "items": items, "X": X, "mode": mode, "norm": norm, "order": np.argsort(-norm), "warns": warns}

def _compare_one(ex, it, s):
    """README fetch + LLM comparison for one match. Runs in a worker thread."""
    if it["source"] == "github": it["text"] += " README: " + github.readme(it["title"])
    c = compare(ex, it, s)
    fo = [{"feature": str(r.get("feature", "")), "note": str(r.get("note", "")),
           "status": r.get("status", "no").lower() if r.get("status", "no").lower() in ("yes", "partial", "no") else "no"}
          for r in c.get("feature_overlap", []) if isinstance(r, dict) and isinstance(r.get("status", "no"), str)]
    cov = sum({"yes": 1, "partial": .5}.get(r.get("status"), 0) for r in fo) / max(1, len(fo))
    return {"id": it["id"], "source": it["source"], "name": it["title"], "url": it.get("url"), "stars": it.get("stars"),
            "description": it["description"], "similarity_pct": round(s * 100),
            "level": "high" if s >= .7 else "medium" if s >= .4 else "low",
            "why_similar": {"same_problem": c.get("same_problem"), "same_approach": c.get("same_approach"), "summary": c.get("summary", "")},
            "feature_overlap": fo, "coverage_pct": round(cov * 100), "repo_extra_features": c.get("repo_extra_features", [])}

def run(p, job):
    """QUICK phase: score + matches. Advice and landscape are built on demand (advice() / landscape_section())."""
    t0 = time.time()
    def stage(s): job.update(stage=s); print(f"[timing {time.time() - t0:5.1f}s] {s}")
    ck = _ck(p)
    llm.stats["fail"] = 0
    if (r := cache.get(ck)): return {**r, "mode": "cached"}

    ctx = prepare(p, stage); ex, items, norm, order, warns = ctx["ex"], ctx["items"], ctx["norm"], ctx["order"], ctx["warns"]

    stage("Comparing with the closest projects")
    top = [(items[i], float(norm[i])) for i in order[:C.TOP_K]]
    with ThreadPoolExecutor(max_workers=max(1, len(top))) as pool: comps = list(pool.map(lambda a: _compare_one(ex, *a), top))   # parallel, order kept

    stage("Scoring the originality")
    S, F = float(norm[order[0]]), max((c["coverage_pct"] for c in comps), default=0) / 100
    Cr = min(1, int((norm >= .7).sum()) / 5)
    rows = [("Idea similarity", C.W_SIM, S, f"closest match is {S*100:.0f}% similar"),
            ("Feature overlap", C.W_FEAT, F, f"best match already covers {F*100:.0f}% of your features"),
            ("Crowdedness", C.W_CROWD, Cr, f"{int((norm >= .7).sum())} highly similar projects found")]
    breakdown = [{"factor": f, "weight": w, "value": round(v, 2), "penalty": round(100 * w * v), "note": n} for f, w, v, n in rows]
    score = max(0, 100 - sum(b["penalty"] for b in breakdown))
    band = "distinctive" if score >= 70 else "crowded" if score >= 40 else "saturated"
    if llm.client() and llm.stats["fail"]:
        warns.append("Some AI steps failed (wrong model name or rate limit), so parts of this result use fallback text. Run scripts/test_keys.py.")

    res = {"mode": "degraded" if warns else "live", "warnings": warns, "proposal": ex,
           "originality": {"score": score, "band": band, "breakdown": breakdown}, "similar_projects": comps}
    job["ctx"] = ctx          # kept in memory so the landscape section does not redo retrieval and embedding
    if not warns: cache.put(ck, res)
    print(f"[timing {time.time() - t0:5.1f}s] quick result ready")
    return res

def _failed_since(f0): return bool(llm.client() and llm.stats["fail"] > f0)

def advice(job):
    """On-demand section 1: gaps, suggestions, positioning. Needs only the quick result."""
    res, f0 = job["result"], llm.stats["fail"]
    rec = recommend(res["proposal"], res["similar_projects"])
    warns = ["AI advice was unavailable (wrong model name or rate limit), so generic fallback advice is shown. Try again."] if _failed_since(f0) else []
    return {"recommendations": rec, "warnings": warns}

def landscape_section(job):
    """On-demand section 2: the idea landscape. Rebuilds the cached embeddings/GitHub results if the server lost them."""
    f0, warns = llm.stats["fail"], []
    ctx = job.get("ctx")
    if not ctx: ctx = job["ctx"] = prepare(job["p"])          # all disk-cached: near-instant, no network when it was a live run before
    sims_all = np.concatenate([[1.0], ctx["norm"]])
    me = {"id": "proposal", "title": ctx["p"]["title"], "source": "proposal", "url": None}
    try: land = landscape.build([me] + ctx["items"], ctx["X"], sims_all, ctx["ex"])
    except Exception as e: print("Landscape error", repr(e)); land = None; warns.append("The idea landscape could not be drawn for this run.")
    if land and _failed_since(f0): warns.append("AI labels were unavailable, so cluster names and white-space ideas use fallback text. Try again.")
    return {"landscape": land, "warnings": warns}
