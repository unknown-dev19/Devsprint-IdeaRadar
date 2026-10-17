import threading, traceback, uuid
from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import config as C, pipeline

app = FastAPI(title="IdeaRadar")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

DEMOS = {
 "attendance": {"title": "Smart Attendance System", "description": "A web app that marks classroom attendance automatically using face recognition from a webcam, with reports for teachers.",
                "features": ["Face recognition check-in", "Teacher dashboard", "Attendance reports", "Email alerts for absentees"], "tech_stack": ["Python", "OpenCV", "React"]},
 "expense": {"title": "Student Expense Tracker", "description": "Tracks daily student spending, categorises expenses automatically and shows monthly budget insights.",
             "features": ["Auto-categorisation", "Monthly budget alerts", "Charts and insights", "Receipt scanning"], "tech_stack": ["React", "Node.js"]},
 "resume": {"title": "AI Resume Analyzer", "description": "Upload a resume and a job description to get an ATS match score and suggestions to improve the resume.",
            "features": ["ATS score", "Keyword gap analysis", "Improvement suggestions", "Job description matching"], "tech_stack": ["Python", "NLP"]},
}
JOBS = {}
SECTIONS = {"advice": pipeline.advice, "landscape": pipeline.landscape_section}   # built on demand, after the quick result

class Req(BaseModel):
    title: str = ""
    description: str = ""
    features: list[str] = []
    tech_stack: list[str] = []
    demo_id: str | None = None

def work(jid, p):
    try: JOBS[jid]["result"] = pipeline.run(p, JOBS[jid]); JOBS[jid]["status"] = "done"
    except Exception as e: traceback.print_exc(); JOBS[jid].update(status="error", error=str(e))

@app.get("/api/health")
def health(): return {"ok": True, "gemini": bool(C.GEMINI_KEY), "github": bool(C.GITHUB_TOKEN)}

@app.get("/api/demos")
def demos(): return [{"id": k, "title": v["title"]} for k, v in DEMOS.items()]

@app.post("/api/analyze")
def analyze(req: Req, bg: BackgroundTasks):
    if req.demo_id and req.demo_id not in DEMOS: raise HTTPException(404, "Unknown example project.")
    if not req.demo_id and not req.title.strip(): raise HTTPException(400, "Please enter a project title.")
    p = DEMOS.get(req.demo_id) or req.model_dump(exclude={"demo_id"})
    if len(JOBS) > 50: JOBS.pop(next(iter(JOBS)))           # keep memory bounded
    jid = uuid.uuid4().hex[:8]
    JOBS[jid] = {"status": "running", "stage": "Starting", "p": p, "sections": {}, "locks": {k: threading.Lock() for k in SECTIONS}}
    bg.add_task(work, jid, p); return {"job_id": jid}

@app.get("/api/jobs/{jid}")
def job(jid: str):
    j = JOBS.get(jid)
    if not j: return {"status": "error", "error": "Job not found: the server may have restarted. Please run the analysis again."}
    return {k: j[k] for k in ("status", "stage", "result", "error") if k in j}      # never send ctx / locks to the browser

@app.post("/api/jobs/{jid}/{section}")
def section(jid: str, section: str):
    """Build 'advice' or 'landscape' for a finished job. Cached per job; two quick clicks share one computation."""
    if section not in SECTIONS: raise HTTPException(404, "Unknown section.")
    j = JOBS.get(jid)
    if not j or j.get("status") != "done": raise HTTPException(404, "This analysis is no longer on the server (it may have restarted). Please run it again.")
    with j["locks"][section]:
        if section in j["sections"]: return j["sections"][section]
        try: out = SECTIONS[section](j)
        except Exception as e: traceback.print_exc(); raise HTTPException(500, f"Could not build the {section}: {e}")
        if not out.get("warnings"): j["sections"][section] = out        # a degraded section is not kept, so clicking again retries it
        return out
