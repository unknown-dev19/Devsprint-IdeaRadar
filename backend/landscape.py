"""Idea Landscape Map: PCA (2D coords) + KMeans (clusters) + LLM labels / white-space."""
import json, re
import numpy as np
from collections import Counter
from sklearn.decomposition import PCA
from sklearn.cluster import KMeans
import llm

STOP = set("with that this from your their using based system project application which projects platform "
           "github about into have will more make users user data".split())

def geometry(X):
    n = len(X); rng = np.random.RandomState(42)
    X = X / (np.linalg.norm(X, axis=1, keepdims=True) + 1e-9)       # match cosine geometry
    pca = PCA(n_components=2, random_state=42)
    co = pca.fit_transform(X + rng.normal(0, 1e-6, X.shape))         # jitter avoids degenerate PCA
    co = co / (np.abs(co).max(0) + 1e-9) * 0.92 + rng.normal(0, .01, co.shape)  # each axis fills the frame
    S = np.array([350., 200.])           # pixels per unit in Landscape.jsx (x, y): keep in sync
    P = co * S
    for _ in range(80):                  # gentle repulsion: un-pile dots closer than 18px
        d = P[:, None, :] - P[None, :, :]; dist = np.linalg.norm(d, axis=2) + np.eye(n)
        P = P + 0.5 * ((d / dist[..., None]) * np.clip(18 - dist, 0, None)[..., None]).sum(1)
    co = np.clip(P / S, -1, 1)
    k = 1 if n < 4 else max(2, min(4, n // 6, n - 1))
    lab = KMeans(n_clusters=k, n_init=10, random_state=42).fit_predict(X) if k > 1 else np.zeros(n, int)
    return co, lab, float(pca.explained_variance_ratio_.sum())      # cluster in FULL space, not 2D

def unexplored(co, r=.2):
    """Empty circles (in drawn pixels) that fit ENTIRELY inside the map frame and stay clear of every dot.
    y is scaled .57 (= 200/350) to match the drawing, so a circle on screen is an ellipse in map units: rx = r, ry = r / .57.
    Greedy pick, so regions never overlap; max 3."""
    ry = r / .57
    xs = np.linspace(-1 + r, 1 - r, 17); ys = np.linspace(-1 + ry, 1 - ry, 13); cand = []
    for x in xs:
        for y in ys:
            d = np.min(np.hypot(co[:, 0] - x, (co[:, 1] - y) * .57))
            if d > r + .04: cand.append((d, x, y))        # +.04 keeps dots off the dashed edge
    out = []
    for d, x, y in sorted(cand, reverse=True):
        if all(np.hypot(x - a, (y - b) * .57) > 2 * r + .02 for _, a, b in out): out.append((d, x, y))
    return [{"x": round(float(x), 3), "y": round(float(y), 3), "radius": r, "rx": r, "ry": round(ry, 3)} for _, x, y in out[:3]]

def labels(groups):
    """groups: {cluster_id: [member strings]} -> {id: (label, description)}"""
    prompt = ("You label groups of similar software projects. For each cluster give a specific 2-5 word label "
              "(e.g. \"Face-recognition attendance\", never \"Miscellaneous\") and a one-sentence description of what they share.\n"
              f"Clusters: {json.dumps([{'id': c, 'titles': m[:8]} for c, m in groups.items()])}\n"
              'Return ONLY JSON: {"clusters":[{"id":0,"label":"...","description":"..."}]}')
    fb = {"clusters": []}
    for c, m in groups.items():
        w = Counter(x for s in m for x in re.findall(r"[a-z]{5,}", s.lower()) if x not in STOP).most_common(2)
        fb["clusters"].append({"id": c, "label": " ".join(a.title() for a, _ in w) or f"Cluster {chr(65 + c)}",
                               "description": "Auto-labelled (AI labelling unavailable)."})
    out = llm.gen_json(prompt, fb) or fb
    res = {}
    for x in out.get("clusters") or []:             # tolerate missing/odd fields from the LLM
        try:
            if isinstance(x, dict) and x.get("label"): res[int(x["id"])] = (str(x["label"]), str(x.get("description", "")))
        except (KeyError, ValueError, TypeError): pass
    return res

def white_space(title, ex, clusters, mine):
    prompt = (f"A student proposed this project:\nTitle: {title}\nProblem: {ex['core_problem']}\n"
              f"Target users: {ex['target_users']}\nPlanned features: {ex['features']}\n\n"
              f"Existing projects fall into these clusters:\n{json.dumps([{k: c[k] for k in ('id','label','description')} for c in clusters])}\n"
              f"The student's idea sits in cluster \"{mine}\".\n\n"
              "Identify 3-5 concrete opportunities that appear in NONE of the clusters: feature combinations, underserved user groups, "
              "unusual constraints (offline, low-bandwidth, multilingual, accessibility) or different technical approaches.\n"
              "Rules: base every opportunity ONLY on the cluster summaries; say 'not covered in the compared set', never 'no project in the world'; "
              "realistic for a student team; do not flatter the idea.\n"
              'Return ONLY JSON: {"summary":"one sentence","opportunities":[{"title":"...","reasoning":"...","nearest_cluster":0}]}')
    out = llm.gen_json(prompt, {"summary": "AI white-space analysis unavailable right now.", "opportunities": []})
    opps = [o for o in (out.get("opportunities") or []) if isinstance(o, dict)][:5]
    return {"summary": str(out.get("summary", "")), "opportunities": opps,
            "caveat": "Empty areas are relatively unexplored, not guaranteed opportunities."}

def build(items, X, sims, ex):
    """items[0] is the proposal. sims[i] = 0..1 similarity to the proposal. -> landscape dict or None."""
    if len(items) < 3: return None
    co, lab, fid = geometry(X)
    groups = {}
    for i, c in enumerate(lab): groups.setdefault(int(c), []).append(i)
    names = labels({c: [f"{items[i]['title']}: {items[i].get('description', '')[:80]}" for i in m if i] or ["(only your idea)"]
                    for c, m in groups.items()})
    clusters = []
    for c, m in groups.items():
        l, d = names.get(c, (f"Cluster {chr(65 + c)}", ""))
        clusters.append({"id": c, "label": l, "description": d, "size": len(m), "contains_proposal": 0 in m,
                         "centroid": {"x": round(float(co[m, 0].mean()), 3), "y": round(float(co[m, 1].mean()), 3)}})
    mine = next(c["label"] for c in clusters if c["contains_proposal"])
    pts = [{"id": it["id"], "title": it["title"], "source": it["source"], "url": it.get("url"),
            "description": (it.get("description") or "")[:140],
            "x": round(float(co[i, 0]), 3), "y": round(float(co[i, 1]), 3), "cluster": int(lab[i]),
            "similarity": 1.0 if i == 0 else round(float(sims[i]), 2)} for i, it in enumerate(items)]
    return {"points": pts, "clusters": clusters, "unexplored_regions": unexplored(co),
            "white_space": white_space(items[0]["title"], ex, clusters, mine), "map_fidelity": round(fid, 2)}
