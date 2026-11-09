# RecycleSG CV: material suggestion from a photo

Sends a photo to the Gemini API and returns a suggested material (plastic, paper, metal, e-waste, batteries,
clothing, cardboard, glass, lighting waste). It is only a suggestion: the app must let the user
confirm or change it, and manual selection must always work (see SRS REQ 4.2 and the AI Tech Stack Report).

Result fields: `status` is `ok` (confident, pre-select it), `unsure` (ask the user), or `unavailable`
(API down or quota hit, ask the user). `material` is set only when `ok`; `suggestion` is the model's best guess.

Backend integration contract, current test evidence and API-only demo seed/reset commands:
[Backend integration handoff](../../docs/demo/BACKEND_INTEGRATION.md).
Gemini confidence must be finite and within [0,1]. Calls use one attempt with a 15-second timeout;
raw provider errors are not returned to clients. `/verify` adds the saved activity's illustrative
`activity_impact` estimate; aggregate totals remain in the existing Supabase impact RPC.

## Setup (Mac / Linux)
```bash
cd Lab3/CV
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # then paste your key into .env
```
Get a free key at https://aistudio.google.com/apikey . Never commit `.env`.

## Check it works
1. No key needed: install `requirements-test.txt`, then `python -m unittest discover tests -v` (classifier, HTTP and verification tests use mocked inference).
2. Plumbing with no key: `CV_MOCK=1 uvicorn app:app --port 8000`, open http://localhost:8000
   (mock mode guesses from the file name, so it proves the server works, not the model)
3. Real model: `python classifier.py --list-models` and put a listed model id in `.env` as GEMINI_MODEL,
   then `uvicorn app:app --port 8000` and try photos at http://localhost:8000
4. Accuracy: put photos in `test_images/<material>/`, run `python evaluate.py`;
   see `results/summary.md` for accuracy, confusion matrix and latency.

## Notes
- Free tier has rate limits, so evaluate.py waits 4 s between images (`--delay`).
- Do not send photos containing people or personal data.

## App verification connection

The log screen sends the selected photo to `POST /classify` immediately, using
the same `EXPO_PUBLIC_VERIFICATION_URL` as verification. It shows an analysing
state and preselects a confident material only if the point accepts it and it
has not already been logged at this check-in. The user can change the selection.
Uncertain/unavailable results keep manual selection available, with a retry.
Retakes cancel the previous request; late results never overwrite a manual
choice. Suggestions time out after 20 seconds and do not create activities or
award points. Submission still performs a separate trusted verification.

`POST /verify` takes `{ "activity_id": 123 }` and `Authorization: Bearer <user access token>`.
Configure server-only `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, and the allowed browser origins in `FRONTEND_ORIGINS`.
Apply migration `20261025010000_finalize_recycling.sql` before use. Set the frontend's `EXPO_PUBLIC_VERIFICATION_URL` to this service's reachable URL.

The adapter authenticates the user, loads only their activity, downloads its stored photo and compares the confident classification with the selected material. Matching material finalizes Verified; confident mismatch finalizes Rejected. Uncertain/unavailable recognition leaves Pending for an explicit retry. Terminal retries do not award twice. The UI bounds waiting to 25 seconds; a late server completion is reconciled by refresh/retry.

This is a prototype material-match policy, not proof of physical disposal. Manual material selection still works, but it does not bypass verification to earn points. A rejected activity is terminal; starting another activity requires the existing check-in/material rules to allow it.

`CV_MOCK=1` guesses from filenames and is only suitable for standalone classifier plumbing. Generated app storage filenames do not contain material names. For the complete credential-free browser test use `Lab3/integration/tests`, which injects deterministic fake inference into the real adapter explicitly.
