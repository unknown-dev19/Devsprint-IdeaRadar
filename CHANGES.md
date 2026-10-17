# Changes in this fixed build (tested)

Tested here: backend install + run, frontend install + build, headless-browser run of all 3 demos and a typed form (no JS errors),
and mocked-Gemini scenarios (wrong model name, task_type rejected, malformed JSON, every AI call failing).
NOT testable here: the real Gemini API (no network access to Google). See "Still unverified" at the bottom.

## Bugs fixed
1. **Offline similarity was always ~100%.** Local hashing embedding now ignores stop words and uses 1024 dims; local thresholds recalibrated (0.10, 0.45) on the 3 demos. True matches rank first, unrelated ones score near 0.
2. **Degraded results were cached as "live".** If Gemini calls failed (wrong model name, rate limit) with a key present, no warning was shown and the fallback text was cached forever. Now `llm.stats` counts failures: a warning appears and the result is not cached.
3. **Wrong model name caused ~30 slow failing calls.** A 404/NOT_FOUND now marks that model dead for the session and moves straight to the fallback model; 429 gets a short backoff.
4. **Embedding task_type rejection** now retries without `task_type` before falling back to local embeddings.
5. **A malformed LLM reply could crash the whole job** (missing `label`, list instead of object, junk feature rows, odd status strings). All LLM output is now validated/normalised; landscape errors become a warning instead of a failed job.
6. **Stale cache after edits.** Final-result cache key now includes `CACHE_VERSION` and both model names (bump `CACHE_VERSION` in config.py to flush).
7. **Offline GitHub queries were junk** ("A web app that marks"). Fallback keywords now come from title, features and description words, in a stable order.
8. **Landscape map:** "unexplored" regions were circles on a non-square scale (could cover points, got clipped at the edge, overlapped each other). Now ellipses matching the data scale, kept inside the frame, with non-overlapping selection; the proposal's cluster label no longer collides with the star.
9. **API/UI errors:** empty title and unknown demo id return clear 400/404 messages; the UI shows real error text, "cannot reach backend", and gives up after 3 minutes instead of polling forever; job store is capped at 50.

## Still unverified (needs your real keys)
- Run `python scripts/test_keys.py`; `gemini-3.8-flash` is documented by Google, `gemini-embedding-2` and the fallback `gemini-3.1-flash-lite` should be checked in the printed model list.
- Calibrate `THRESH["gemini"]` in config.py with 5 known pairs (duplicate / related / unrelated).
- If outputs look odd with `temperature=0.2` on Gemini 3.x models, try removing it in llm.py.

## Merged map improvements (on top of the fixes above)
- `landscape.geometry`: each axis is scaled separately so the map fills the frame, plus a deterministic repulsion step (dots closer than 18px are pushed apart). Pixel scale (350, 200) must match `px/py` in `Landscape.jsx`.
- `landscape.unexplored`: distance uses the real aspect (y x 0.57), regions are picked greedily so they never overlap, max 3, radius 0.22.
- `Landscape.jsx`: `placeLabels()` keeps ALL cluster labels clear of the star, the "Your idea" tag and each other (replaces the proposal-only offset).
- Restored `backend/.env.example` (the README copies it).

## Added: Export report (frontend only)
- `frontend/src/lib/report.js` (new): builds a Markdown report from the result; `Download .md` and `Copy` buttons added above the result tabs.
- Includes score + breakdown, how the idea was read, every match with its feature table, and the Advice / Landscape sections if they were opened.
- Touched: `Results.jsx` (ExportBar + optional `title` prop), `ui.jsx` (two icons), `App.jsx` (passes `title`). No backend or API changes.
