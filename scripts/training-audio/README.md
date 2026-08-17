# Training narration generation and approval

This workflow creates local, pre-rendered narration. The application never
calls Kokoro, a paid API, or another network TTS service at runtime. Model
weights and raw generation output are deliberately outside the product
artifact boundary.

## Pinned provenance

- Engine: `kokoro==0.9.4` (Apache-2.0)
- Model: `hexgrad/Kokoro-82M`, v1.0, revision
  `8542409da2986c0ab5d41b3cf0411f7a58caab38` (Apache-2.0)
- Model file SHA-256:
  `496dba118d1a58f5f3db2efc88dbdc216e0483fc89fe6e47ee1f2c53f18ad1e4`
- Candidate voice: `af_heart`, American English, from the same Apache-2.0
  model repository
- English phonemizer model: `en-core-web-sm==3.8.0`, wheel SHA-256
  `1932429db727d4bff3deed6b34cfc05df17794f4a52eeb26cf8928f7c1a0fb85`
- Synthesis: speed `1.0`, mono 24 kHz model output
- Delivery master: mono 48 kHz MP3, 64 kbps, -18 LUFS integrated, -2 dBTP,
  LRA 7 LU

Upstream references:

- Model card and revision:
  <https://huggingface.co/hexgrad/Kokoro-82M/blob/8542409da2986c0ab5d41b3cf0411f7a58caab38/README.md>
- Voice files at the pinned revision:
  <https://huggingface.co/hexgrad/Kokoro-82M/tree/8542409da2986c0ab5d41b3cf0411f7a58caab38/voices>
- Engine package: <https://pypi.org/project/kokoro/0.9.4/>
- Engine license: <https://github.com/hexgrad/kokoro/blob/main/LICENSE>

The model repository identifies the weights and repository voice files as
Apache-2.0. This permits project distribution of generated audio. Preserve the
provenance record with every published batch.

## Local prerequisites

Use Python 3.10–3.12, `ffmpeg`, `ffprobe`, and a local checkout of the pinned
model revision. Keep the model directory outside this repository. It must
contain:

```text
config.json
kokoro-v1_0.pth
voices/af_heart.pt
```

Create a dedicated virtual environment and install the pinned direct
dependencies before running `generate.py`:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r scripts/training-audio/requirements.txt
```

Use that environment's Python for generation and retain its `pip freeze` with
local review evidence. The generator reports the exact install command if a
required package such as `soundfile` is missing. Do not commit the environment,
model, raw WAVs, review MP3s, or review evidence.

The requirements file also installs the pinned English phonemizer model.
`generate.py` checks its installed version before Kokoro starts, preventing
Misaki from downloading that model during an otherwise offline generation
run. Dependency and model acquisition may use the network; synthesis may not.

Download only the required model artifacts at the pinned revision to a real
directory outside this repository. This is a one-time generation setup step;
the application does not download or call the model at runtime.

```powershell
$kokoroModelDir = 'C:\Users\ssnguna\Models\Kokoro-82M'
New-Item -ItemType Directory -Force -Path $kokoroModelDir | Out-Null
.\.venv\Scripts\hf.exe download hexgrad/Kokoro-82M config.json kokoro-v1_0.pth voices/af_heart.pt `
  --revision 8542409da2986c0ab5d41b3cf0411f7a58caab38 `
  --local-dir $kokoroModelDir
Get-FileHash "$kokoroModelDir\kokoro-v1_0.pth" -Algorithm SHA256
```

The reported model hash must be
`496DBA118D1A58F5F3DB2EFC88DBDC216E0483FC89FE6E47EE1F2C53F18AD1E4`.
Stop if it differs. You may choose another external directory, but use that
same absolute path for `--model-dir` below.

## 1. Export the exact scripts

```powershell
node scripts/training-audio/export-scripts.mjs --out scripts/training-audio/work/scripts.json
```

The export contains the common intro, each of the 12 module introductions, and
all 84 curriculum steps. Each record includes a SHA-256 checksum of the exact
spoken text. Re-export after any curriculum narration change.

## 2. Generate only the approval samples

```powershell
.\.venv\Scripts\python.exe scripts/training-audio/generate.py samples --model-dir $kokoroModelDir --scripts scripts/training-audio/work/scripts.json
```

If you start a new PowerShell session, set `$kokoroModelDir` again or replace
it with the real absolute model path.

This command is offline and fails if Hugging Face or Transformers offline mode
is not active. It writes review files only under the ignored
`scripts/training-audio/work/review/` directory. It does not publish product
audio or alter `public/training/audio/provenance.json`. Review
`scripts/training-audio/work/review-index.json` for the measured sample sizes,
projected upper bound, voice checksum, and script-bundle checksum.

## Owner approval checklist — required before bulk generation

Listen on both headphones and ordinary laptop speakers to these four clips:

- [ ] `training.intro` — common introduction
- [ ] `training.v1.scribe.blue.orient` — representative Scribe
- [ ] `training.v1.facilitator.blue.show` — representative Facilitator
- [ ] `training.v1.notetaker.blue.guide` — representative Notetaker

For every sample, confirm:

- [ ] The `af_heart` voice sounds friendly, confident, youthful, and neutral,
  like a capable peer coach rather than an announcer or command voice.
- [ ] Role names, White Cell, Strategic Orientation, RFI, and team names are
  pronounced correctly.
- [ ] Pacing is natural; unfamiliar concepts have useful pauses.
- [ ] There is no clipping, pumping, excessive noise, awkward pause, or robotic
  prosody.
- [ ] The transcript matches every spoken word.
- [ ] Caption changes follow speech within 0.5 seconds.
- [ ] The measured per-file size supports the proposed 256 KiB ceiling and the
  projected batch supports the proposed 12 MiB total ceiling. Adjust and
  document the budgets in `audioManifest.js` before approval if they do not.

If the voice is rejected, stop. Select and document another voice from the
pinned, clearly licensed model repository, regenerate only these four samples,
and repeat the review. Never publish an unapproved sample.

After approval, copy `owner-approval.example.json` to the ignored work
directory, complete it, confirm the recorded sample measurements support the
named per-file and total budgets, and preserve the signed review in the
approved release evidence system rather than Git.

## 3. Generate the approved batch

```powershell
.\.venv\Scripts\python.exe scripts/training-audio/generate.py all --model-dir $kokoroModelDir --scripts scripts/training-audio/work/scripts.json --approval scripts/training-audio/work/owner-approval.json
```

Bulk mode fails closed unless the approval file names the exact voice, model
revision, script-bundle checksum, reviewer, and review timestamp. It writes
only mastered MP3 files, WebVTT captions, and the finalized provenance JSON to
`public/training/audio/`. Raw WAV and measurement data remain ignored.

Review the generated diff. Do not hand-edit durations or checksums. Then run
the Prompt 06 human verification commands and perform a complete listen-through
for pronunciation, pacing, clipping, awkward pauses, and robotic prosody.

The generated provenance remains scoped to the four-sample approval until that
listen-through is complete. Record the owner's final outcome in both provenance
copies with `scope: "full-batch"`, `fullListenThrough: true`, `clipCount: 97`,
the final review timestamp, and affirmative pronunciation, pacing, clipping,
pause, and prosody checks. The manifest fails closed if only sample approval is
present. Keep `src/features/training/audioProvenance.json` byte-for-byte aligned
with `public/training/audio/provenance.json`; do not alter generated media
measurements or checksums.

## Runtime fallback

Approved files are the primary path. If one cannot load, the controller labels
the degraded mode before using the browser's default Web Speech voice. The
visible transcript remains available even when both audio paths fail. A voice
change is never silent.
