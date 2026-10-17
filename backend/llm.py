import json, re, time, threading
import config as C, cache
_client = None
_dead = set()           # models that answered 404/NOT_FOUND: never retried (wrong model name)
_lock = threading.Lock()   # compare() calls now run in parallel threads
stats = {"fail": 0}     # LLM calls that ended in the fallback; pipeline.run resets and reads this

def client():
    global _client
    if _client is None and C.GEMINI_KEY:
        from google import genai
        _client = genai.Client(api_key=C.GEMINI_KEY)
    return _client

def parse(t):
    t = re.sub(r"^```(?:json)?|```$", "", t.strip(), flags=re.M).strip()
    try: return json.loads(t)
    except Exception: return json.loads(re.search(r"\{.*\}", t, re.S).group(0))

def gen_json(prompt, fallback=None):
    """Gemini JSON call: disk-cached, repair+retry, model fallback, then `fallback`."""
    k = cache.key("llm", prompt)
    if (c := cache.get(k)) is not None: return c
    cl = client()
    if cl:
        from google.genai import types
        for model in (C.LLM_MODEL, C.LLM_FALLBACK):
            if model in _dead: continue
            for attempt in range(2):
                try:
                    p = prompt if attempt == 0 else prompt + "\nReturn ONLY valid JSON matching the schema."
                    r = cl.models.generate_content(model=model, contents=p, config=types.GenerateContentConfig(
                        response_mime_type="application/json", temperature=0.2))
                    out = parse(r.text)
                    if not isinstance(out, dict): raise ValueError("expected a JSON object")
                    cache.put(k, out); return out
                except Exception as e:
                    msg = str(e); print("LLM error", model, msg[:120])
                    if msg.startswith("404") or "NOT_FOUND" in msg: _dead.add(model); break   # wrong name: skip at once
                    if "429" in msg or "RESOURCE_EXHAUSTED" in msg: time.sleep(4)             # free-tier limit: brief backoff
    with _lock: stats["fail"] += 1
    return fallback
