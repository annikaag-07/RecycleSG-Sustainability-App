# RecycleSG CV: material suggestion from a photo

Sends a photo to the Gemini API and returns a suggested material (plastic, e-waste, batteries,
clothing, cardboard, glass, lighting waste). It is only a suggestion: the app must let the user
confirm or change it, and manual selection must always work (see SRS REQ 4.2 and the AI Tech Stack Report).

Result fields: `status` is `ok` (confident, pre-select it), `unsure` (ask the user), or `unavailable`
(API down or quota hit, ask the user). `material` is set only when `ok`; `suggestion` is the model's best guess.

## Setup (Mac / Linux)
```bash
cd Lab3_CV
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # then paste your key into .env
```
Get a free key at https://aistudio.google.com/apikey . Never commit `.env`.

## Check it works
1. No key needed: `python -m unittest discover tests -v`  (7 tests should pass)
2. Plumbing with no key: `CV_MOCK=1 uvicorn app:app --port 8000`, open http://localhost:8000
   (mock mode guesses from the file name, so it proves the server works, not the model)
3. Real model: `python classifier.py --list-models` and put a listed model id in `.env` as GEMINI_MODEL,
   then `uvicorn app:app --port 8000` and try photos at http://localhost:8000
4. Accuracy: put photos in `test_images/<material>/`, run `python evaluate.py`;
   see `results/summary.md` for accuracy, confusion matrix and latency.

## Notes
- Free tier has rate limits, so evaluate.py waits 4 s between images (`--delay`).
- Do not send photos containing people or personal data.
