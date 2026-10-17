# IdeaRadar

Paste a project proposal. IdeaRadar finds similar GitHub repos and past college projects, scores originality,
explains the overlap feature by feature, and maps where you can be different.

It runs with **no keys** (offline fallbacks, approximate results). Add your own keys for the real thing.

**You need:** Python 3.10+ and Node 20+.

## 1. Get your keys (both optional)
- `GEMINI_API_KEY`: free at https://aistudio.google.com/apikey
- `GITHUB_TOKEN`: https://github.com/settings/tokens (a classic token with no scopes is enough)

## 2. Backend
**Windows (PowerShell)**
```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env          # then open backend\.env and paste your keys
python scripts/test_keys.py     # optional: checks your keys and lists real model names
uvicorn main:app --reload       # http://127.0.0.1:8000/docs
```
**macOS / Linux**
```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # then edit backend/.env and paste your keys
python scripts/test_keys.py
uvicorn main:app --reload
```

## 3. Frontend (second terminal)
```bash
cd frontend
npm install
npm run dev                     # http://localhost:5173
```
Open http://localhost:5173 (not `index.html` directly). The top-right chips show whether the backend, Gemini and the GitHub token were detected.

**Windows shortcut:** run `.\start.cmd` (or double-click it) from the project root. It creates `backend\.env` if missing, then starts both servers. It bypasses PowerShell's script policy for that run only, so no admin rights or policy changes are needed.

## Where the keys are read from
`backend/config.py` uses the first of these that exists: the file named in the `IDEARADAR_ENV_PATH` environment variable, then `backend/.env`, then `.env` in the project root. `.env` is in `.gitignore`: never commit it.

## Troubleshooting
- Chip says "Gemini off": `backend/.env` is missing, or the value is empty / `PLACEHOLDER`. Restart uvicorn after editing it.
- "Backend offline" chip: start uvicorn from inside `backend/`.
- "start.ps1 is not digitally signed": use `.\start.cmd` instead, or run `Unblock-File .\start.ps1` (files from a downloaded zip are marked as untrusted).
- Gemini model names change over time. If the AI steps fail, run `python scripts/test_keys.py` and update the names in `backend/config.py` (the only place they live).

## Demo safety
Run each example once with internet. Results, GitHub responses, LLM output and embeddings are cached in `backend/cache/`
(git-ignored), so the demos replay instantly and offline. Delete that folder to force fresh results.

More detail: `BACKEND.md`, `FRONTEND.md`.
