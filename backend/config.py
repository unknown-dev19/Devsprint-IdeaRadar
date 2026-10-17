import os
from pathlib import Path
from dotenv import load_dotenv

# API keys come from a .env file that is NEVER committed (it is in .gitignore).
# Looked up in this order, first one that exists wins:
#   1. the path in the IDEARADAR_ENV_PATH environment variable (optional)
#   2. backend/.env
#   3. .env in the project root
_HERE = Path(__file__).resolve().parent
_CANDIDATES = [os.getenv("IDEARADAR_ENV_PATH"), _HERE / ".env", _HERE.parent / ".env"]
ENV_PATH = next((Path(c) for c in _CANDIDATES if c and Path(c).is_file()), None)
if ENV_PATH: load_dotenv(ENV_PATH, override=True)     # the file wins over stray system variables
else: print("[config] WARNING: no .env file found (copy backend/.env.example to backend/.env). Running without keys (offline mode).")

def _key(name):  # placeholder or empty values count as "no key", so the app degrades cleanly
    v = os.getenv(name, "").strip().strip("\"'")
    return "" if v.upper() in {"", "PLACEHOLDER", "YOUR_KEY_HERE"} else v

GEMINI_KEY = _key("GEMINI_API_KEY")
GITHUB_TOKEN = _key("GITHUB_TOKEN")
print(f"[config] env file: {ENV_PATH or 'none'} | Gemini key: {'set' if GEMINI_KEY else 'MISSING'} | GitHub token: {'set' if GITHUB_TOKEN else 'MISSING'}")
# Model names live ONLY here. Verify with: python scripts/test_keys.py
LLM_MODEL = "gemini-3.8-flash"
LLM_FALLBACK = "gemini-3.1-flash-lite"
EMBED_MODEL = "gemini-embedding-2"
README_CHARS = 1500
TOP_K = 4                      # repos sent to the LLM comparison
QUERIES = 4                    # GitHub queries per analysis
PER_QUERY = 8                  # repos per query
W_SIM, W_FEAT, W_CROWD = 0.45, 0.40, 0.15   # originality weights
THRESH = {"gemini": (0.55, 0.90), "local": (0.10, 0.45)}  # cosine -> 0..1 (local calibrated on the 3 demos; gemini still needs calibrating)
CACHE_VERSION = 3              # bump to invalidate every cached final result (3: result split into quick phase + on-demand sections)
