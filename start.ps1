# Starts backend (port 8000) and frontend (port 5173) in two windows. Works on any Windows machine.
# Needs: Python 3.10+ and Node 20+. The FIRST run installs everything (a few minutes); later runs start in seconds.
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not (Test-Path "$root\backend\.env")) {
  Copy-Item "$root\backend\.env.example" "$root\backend\.env"
  Write-Host "Created backend\.env. Open it and paste your GEMINI_API_KEY and GITHUB_TOKEN (optional: the app also runs without keys)."
}

# Backend: create the venv once; run pip only when requirements.txt has changed (hash stored in the venv).
$backend = "cd '$root\backend'; if (-not (Test-Path .venv)) { python -m venv .venv }; & .\.venv\Scripts\Activate.ps1; " +
  "`$h = (Get-FileHash requirements.txt).Hash; " +
  "if (-not (Test-Path .venv\.req-hash) -or ((Get-Content .venv\.req-hash) -ne `$h)) { pip install -q -r requirements.txt; if (`$?) { Set-Content .venv\.req-hash `$h } }; " +
  "uvicorn main:app --reload"

# Frontend: npm install only when node_modules is missing (after changing package.json, run npm install yourself).
$frontend = "cd '$root\frontend'; if (-not (Test-Path node_modules)) { npm install --no-audit --no-fund }; npm run dev"

Start-Process powershell -ArgumentList "-NoExit","-Command",$backend
Start-Process powershell -ArgumentList "-NoExit","-Command",$frontend
