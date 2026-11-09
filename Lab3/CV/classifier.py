"""RecycleSG material classifier (Gemini API).

classify_image(bytes, mime) -> dict with status "ok" | "unsure" | "unavailable".
The app always lets the user confirm or change the material, so this is a suggestion only.
Set CV_MOCK=1 to test the plumbing without an API key (answers come from the filename).
"""
import argparse
import os
import time
from typing import Literal, Optional

from pydantic import BaseModel, Field

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

MATERIALS = ["plastic", "paper", "metal", "e-waste", "batteries", "clothing", "cardboard", "glass", "lighting waste"]
UNCLEAR = "unclear"
DEFAULT_MODEL = os.getenv("GEMINI_MODEL", "gemini-flash-lite-latest")


def threshold() -> float:
    return float(os.getenv("CV_CONFIDENCE_THRESHOLD", "0.6"))


PROMPT = """You help a recycling app in Singapore sort items by material.
Look at the photo and pick the ONE recycling category that best describes the main item.

Categories:
- plastic: bottles, containers, bags, packaging made of plastic
- e-waste: phones, laptops, cables, chargers, small appliances, circuit boards
- batteries: household batteries and battery packs
- clothing: clothes, shoes, fabric, textiles
- cardboard: cardboard boxes and corrugated cardboard packaging (not ordinary paper)
- paper: newspapers, magazines, office paper and paper packaging (not cardboard)
- metal: aluminium or steel cans and metal containers
- glass: glass bottles and jars
- lighting waste: light bulbs, fluorescent tubes, LED lamps
- unclear: no recyclable item visible, several different materials, or the photo is too blurry or dark

Give confidence from 0 to 1 (how sure you are of the category) and a short reason (one sentence)."""


class GeminiResult(BaseModel):
    material: Literal["plastic", "paper", "metal", "e-waste", "batteries", "clothing", "cardboard",
                      "glass", "lighting waste", "unclear"]
    confidence: float = Field(ge=0, le=1, allow_inf_nan=False)
    reason: str


class MissingKeyError(RuntimeError):
    pass


_client = None


def _get_client():
    global _client
    if _client is None:
        key = os.getenv("GEMINI_API_KEY")
        if not key:
            raise MissingKeyError("GEMINI_API_KEY is not set. See README.md.")
        from google import genai
        _client = genai.Client(api_key=key, http_options={"timeout": 15000, "retry_options": {"attempts": 1}})
    return _client


def _call_gemini(image_bytes: bytes, mime_type: str) -> GeminiResult:
    from google.genai import types
    client = _get_client()
    resp = client.models.generate_content(
        model=DEFAULT_MODEL,
        contents=[types.Part.from_bytes(data=image_bytes, mime_type=mime_type), PROMPT],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=GeminiResult,
            temperature=0,
        ),
    )
    parsed = resp.parsed
    if parsed is None:
        raise ValueError("Model returned no structured result")
    return parsed


def _mock(filename: Optional[str]) -> GeminiResult:
    name = (filename or "").lower()
    for m in MATERIALS:
        if m.replace(" ", "").replace("-", "") in name.replace(" ", "").replace("-", "").replace("_", ""):
            return GeminiResult(material=m, confidence=0.9, reason="MOCK: matched filename")
    return GeminiResult(material=UNCLEAR, confidence=0.2, reason="MOCK: no material in filename")


def classify_image(image_bytes: bytes, mime_type: str = "image/jpeg", filename: Optional[str] = None) -> dict:
    start = time.perf_counter()
    result = None
    try:
        if os.getenv("CV_MOCK") == "1":
            result = _mock(filename)
        else:
            result = _call_gemini(image_bytes, mime_type)
    except MissingKeyError:
        raise
    except Exception:  # network, quota, bad response: let the caller retry Pending
        pass
    latency = int((time.perf_counter() - start) * 1000)
    base = {"model": "mock" if os.getenv("CV_MOCK") == "1" else DEFAULT_MODEL, "latency_ms": latency}
    if result is None:
        return {**base, "status": "unavailable", "material": None, "suggestion": None,
                "confidence": 0.0, "reason": "Recognition unavailable, choose manually."}
    conf = max(0.0, min(1.0, float(result.confidence)))
    if result.material in MATERIALS and conf >= threshold():
        status, material = "ok", result.material
    else:
        status, material = "unsure", None
    suggestion = result.material if result.material in MATERIALS else None
    return {**base, "status": status, "material": material, "suggestion": suggestion,
            "confidence": round(conf, 3), "reason": result.reason}


def _list_models():
    client = _get_client()
    for m in client.models.list():
        actions = getattr(m, "supported_actions", None) or []
        if "generateContent" in actions:
            print(m.name.replace("models/", ""))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--list-models", action="store_true", help="print model ids usable with your key")
    ap.add_argument("image", nargs="?", help="classify one image file")
    a = ap.parse_args()
    if a.list_models:
        _list_models()
    elif a.image:
        ext = a.image.lower().rsplit(".", 1)[-1]
        mime = {"png": "image/png", "webp": "image/webp"}.get(ext, "image/jpeg")
        with open(a.image, "rb") as f:
            print(classify_image(f.read(), mime, os.path.basename(a.image)))
    else:
        ap.print_help()
