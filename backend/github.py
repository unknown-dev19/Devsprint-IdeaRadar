import httpx
import config as C, cache
H = {"Accept": "application/vnd.github+json"}
if C.GITHUB_TOKEN: H["Authorization"] = f"Bearer {C.GITHUB_TOKEN}"

def search(q):
    """-> list of repos, or None if GitHub failed (caller falls back)."""
    k = cache.key("gh", q)
    if (c := cache.get(k)) is not None: return c
    try:
        r = httpx.get("https://api.github.com/search/repositories", headers=H, timeout=15,
                      params={"q": q, "per_page": C.PER_QUERY}); r.raise_for_status()
        out = [{"id": f"gh_{i['id']}", "title": i["full_name"], "source": "github", "url": i["html_url"],
                "stars": i["stargazers_count"], "description": i["description"] or "",
                "topics": i.get("topics", [])} for i in r.json()["items"]]
        cache.put(k, out); return out
    except Exception as e:
        print("GitHub error", str(e)[:120]); return None

def readme(full_name):
    k = cache.key("rd", full_name)
    if (c := cache.get(k)) is not None: return c
    try:
        r = httpx.get(f"https://api.github.com/repos/{full_name}/readme", timeout=15,
                      headers={**H, "Accept": "application/vnd.github.raw"}); r.raise_for_status()
        t = r.text[:C.README_CHARS]; cache.put(k, t); return t
    except Exception: return ""
