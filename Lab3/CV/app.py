"""Local API for the RecycleSG CV classifier.

Run:  uvicorn app:app --reload --port 8000
Then open http://localhost:8000 to try it in the browser, or POST an image to /classify.
"""
import os
from fastapi import FastAPI, File, HTTPException, UploadFile, Header
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from classifier import MATERIALS, MissingKeyError, classify_image
from verification import verify_activity

app = FastAPI(title="RecycleSG CV")
app.add_middleware(CORSMiddleware,
    allow_origins=[s.strip() for s in os.getenv('FRONTEND_ORIGINS', 'http://localhost:8081,http://127.0.0.1:8081').split(',') if s.strip()],
    allow_methods=['POST', 'GET'], allow_headers=['Authorization', 'Content-Type'])


class VerificationRequest(BaseModel):
    activity_id: int = Field(gt=0)


@app.post('/verify')
def verify(request: VerificationRequest, authorization: str = Header(default='')):
    if not authorization.startswith('Bearer ') or not authorization[7:].strip():
        raise HTTPException(401, 'Log in to verify recycling.')
    return verify_activity(request.activity_id, authorization[7:])
MAX_BYTES = 8 * 1024 * 1024
ALLOWED = {"image/jpeg", "image/png", "image/webp"}

PAGE = """<!doctype html><html><head><meta charset="utf-8"><title>RecycleSG CV test</title>
<style>body{font-family:system-ui;max-width:560px;margin:40px auto;padding:0 16px}
pre{background:#f4f4f4;padding:12px;border-radius:8px;white-space:pre-wrap}</style></head><body>
<h2>RecycleSG material classifier</h2>
<p>Choose a photo of an item. Supported: __MATERIALS__.</p>
<input type="file" id="f" accept="image/*"> <button onclick="go()">Classify</button>
<p><img id="p" style="max-width:100%;max-height:260px"></p><pre id="out">No result yet.</pre>
<script>
document.getElementById('f').onchange=e=>{const f=e.target.files[0];if(f)document.getElementById('p').src=URL.createObjectURL(f)};
async function go(){const f=document.getElementById('f').files[0];if(!f)return;
const fd=new FormData();fd.append('file',f);document.getElementById('out').textContent='Working...';
const r=await fetch('/classify',{method:'POST',body:fd});document.getElementById('out').textContent=JSON.stringify(await r.json(),null,2)}
</script></body></html>"""


@app.get("/", response_class=HTMLResponse)
def home():
    return PAGE.replace("__MATERIALS__", ", ".join(MATERIALS))


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/classify")
async def classify(file: UploadFile = File(...)):
    if file.content_type not in ALLOWED:
        raise HTTPException(415, "Upload a JPEG, PNG or WebP image.")
    data = await file.read()
    if not data:
        raise HTTPException(400, "Upload a non-empty image.")
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "Image larger than 8 MB.")
    try:
        return classify_image(data, file.content_type, file.filename)
    except MissingKeyError as e:
        raise HTTPException(503, str(e))
