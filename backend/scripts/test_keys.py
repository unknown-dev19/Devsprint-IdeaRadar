# Run from backend/:  python scripts/test_keys.py
import sys, os; sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import config as C, httpx, llm
cl = llm.client()
if cl:
    print("Models:", [m.name for m in cl.models.list()][:60])
    print("LLM:", cl.models.generate_content(model=C.LLM_MODEL, contents="Reply OK").text)
    from google.genai import types
    e = cl.models.embed_content(model=C.EMBED_MODEL, contents="hi", config=types.EmbedContentConfig(task_type="SEMANTIC_SIMILARITY"))
    print("Embedding dims:", len(e.embeddings[0].values))
else: print(f"No usable GEMINI_API_KEY in {C.ENV_PATH} (missing file, empty value or PLACEHOLDER)")
h = {"Authorization": f"Bearer {C.GITHUB_TOKEN}"} if C.GITHUB_TOKEN else {}
print("GitHub:", httpx.get("https://api.github.com/rate_limit", headers=h).json()["resources"]["search"])
