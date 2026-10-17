import json, hashlib
from pathlib import Path
D = Path(__file__).parent / "cache"; D.mkdir(exist_ok=True)
def key(*a): return hashlib.sha1(json.dumps(a, sort_keys=True, default=str).encode()).hexdigest()[:20]
def get(k):
    p = D / f"{k}.json"
    return json.loads(p.read_text()) if p.exists() else None
def put(k, v): (D / f"{k}.json").write_text(json.dumps(v))
