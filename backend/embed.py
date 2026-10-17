import re, time, zlib, numpy as np
from concurrent.futures import ThreadPoolExecutor
import config as C, cache, llm

STOP = set("with that this from your their using uses based system project application which projects platform "
           "about into have will more make users user data app web for and the".split())

def local(t, dim=1024):  # offline hashing embedding: keeps the app alive without Gemini
    v = np.zeros(dim)
    for w in re.findall(r"[a-z]{3,}", t.lower()):
        if w not in STOP: v[zlib.crc32(w.encode()) % dim] += 1
    return v

def _one(cl, text, kw):
    """Embed a single text (retries once on rate limit)."""
    for attempt in range(2):
        try: return cl.models.embed_content(model=C.EMBED_MODEL, contents=text, **kw).embeddings[0].values
        except Exception as e:
            if attempt == 0 and ("429" in str(e) or "RESOURCE_EXHAUSTED" in str(e)): time.sleep(3); continue
            raise

_batch_ok = True   # flips to False for this session if the model merges a batch into one vector (saves one wasted call per run)

def _gemini(cl, texts, with_task):
    global _batch_ok
    from google.genai import types
    kw = {"config": types.EmbedContentConfig(task_type="SEMANTIC_SIMILARITY")} if with_task else {}
    vecs = []
    if _batch_ok:
        try:    # fast path: one batched call per 90 texts
            for i in range(0, len(texts), 90):
                r = cl.models.embed_content(model=C.EMBED_MODEL, contents=texts[i:i+90], **kw)
                vecs += [e.values for e in r.embeddings]
        except Exception as e:
            if "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e) or "API key" in str(e): raise
            print("EMBED batch error:", str(e)[:120]); vecs = []
        if len(vecs) != len(texts) and len(texts) > 1 and vecs: _batch_ok = False
    if len(vecs) != len(texts):
        # gemini-embedding-2 merges a list into ONE vector: embed each text separately instead
        print(f"EMBED batch returned {len(vecs)} vectors for {len(texts)} texts: switching to one call per text")
        with ThreadPoolExecutor(max_workers=6) as ex: vecs = list(ex.map(lambda t: _one(cl, t, kw), texts))
    if len(vecs) != len(texts): raise ValueError(f"expected {len(texts)} embeddings, got {len(vecs)}")
    return vecs

def embed(texts):
    """-> (matrix, mode) where mode is 'gemini' or 'local'."""
    k = cache.key("emb", C.EMBED_MODEL, texts)
    c = cache.get(k)
    if c and len(c) == len(texts): return np.array(c), "gemini"      # ignore bad cache entries from older runs
    cl = llm.client()
    if cl:
        for with_task in (True, False):   # some embedding models reject task_type: retry without it
            try:
                vecs = _gemini(cl, texts, with_task); cache.put(k, vecs); return np.array(vecs), "gemini"
            except Exception as e: print(f"EMBED error (task_type={with_task})", str(e)[:120])
    return np.array([local(t) for t in texts]), "local"
