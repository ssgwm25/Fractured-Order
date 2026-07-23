# Publish / maintain ssgwm25/petrihos-lever-index

Remote: https://github.com/ssgwm25/petrihos-lever-index

Local working copy (this machine):

```powershell
cd "C:\Users\Owner\Desktop\PLI Master Repot"
```

## Push updates

```powershell
git status
git push origin main
```

## GitHub Actions secrets

In **Settings → Secrets and variables → Actions**, keep:

| Secret | Purpose |
|--------|---------|
| `SUPABASE_URL` | Plenum Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server-side only) |
| `CURSOR_API_KEY` | Cursor agent API key |

Live `run_pli.py` adjudication still requires those secrets. Unit tests run without them.

## Verify locally

```powershell
pip install -r requirements.txt
python -m pytest test_engine.py test_tracks.py -q
python compose_master_codebook.py
python generate_master_codebook_pdf.py
python generate_annotated_bibliography_pdf.py
```

Expected: **46 passed** (engine + tracks). PDFs write to Desktop and `deliverables/`.

## Optional — Fractured-Order submodule

```powershell
cd <path-to-Fractured-Order>
git submodule add https://github.com/ssgwm25/petrihos-lever-index.git pli
```

See `plenum/INTEGRATION.md` for White Cell / Supabase wiring notes (macro live path today; multi-track offline-ready).
