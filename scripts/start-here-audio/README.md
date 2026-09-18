# Start Here narration generation and approval

Start Here narration is an onboarding media product. Candidate batches use the
pinned offline Kokoro model and `af_heart` voice, with independent scripts,
checksums, review evidence, and approval scope.

The exporter derives narration from the exact visible role-focus and role-step
copy in the six role controllers. Orientation remains video-only. Identical
scripts share a content-addressed clip; a copy change creates a new filename so
stale narration cannot silently play.

The exporter supplies the controllers' `seatStorageKey` dependency with an
explicit absent seat. Exported profile keys remain reusable `followalong:...`
catalog keys even if the calling process has a confirmed regional seat; the
export never changes that seat. Browser onboarding continues to scope its
progress keys to the authenticated seat. This GC-04 tooling dependency neither
adds role profiles nor generates or approves new audio.

The current source contract contains 24 role profiles, 257 slide references,
and 125 unique narration clips. The White Cell SME-efficacy walkthrough and
the TSJ/Verba Approved PLI handoffs invalidate any earlier 122-clip review
batch; generate and review a fresh batch before promotion.

Narration is not a verbatim modal readout. Role-focus clips establish ownership,
workflow sequence, and authority boundaries. Surface clips add what to inspect,
how to use the surface during play, what to verify before continuing, and how
to reach the native control. The visible slide remains the factual source and
accessible text equivalent; narration adds sequencing and connective guidance
without introducing hidden decision rules.

## Generate the local review batch

```powershell
node scripts/start-here-audio/export-scripts.mjs --out scripts/start-here-audio/work/scripts.json
$kokoroModelDir = 'C:\Users\ssnguna\Models\Kokoro-82M'
.\.venv\Scripts\python.exe scripts/start-here-audio/generate.py --model-dir $kokoroModelDir --scripts scripts/start-here-audio/work/scripts.json
```

The generator is offline-only. It verifies the pinned model checksum, produces
48 kHz mono MP3 files and English WebVTT timing sidecars under the ignored
`scripts/start-here-audio/work/review/` directory, and writes
`review-index.json` with scripts, mappings, checksums, generation settings, and
an explicit pending-approval state.

## Listen in the local application

Restart `npm run dev` after generating the batch. In development only, Vite
serves the ignored review MP3/VTT files at the same content-addressed URLs used
by the approved runtime. Open Start Here and move to Role focus or any later
slide; Play, Pause, and Stop will be enabled. Orientation remains video-only.

The development server accepts only exact 16-character content-hash filenames,
prevents path traversal, sends `nosniff` and `no-store` headers, and supports
byte-range requests. Runtime clip URLs include Vite's configured application
base path, so approved narration remains under the deployed app directory
rather than resolving from the host root. The route and pending manifest are
excluded from production playback, so local review does not imply release
approval.

## Required owner review before publication

Listen to every unique clip while reading its mapped slide copy. Confirm:

- names, acronyms, role labels, and team labels are pronounced correctly;
- pacing and pauses sound natural and no sentence is clipped;
- volume is consistent and playback is free of distortion;
- every profile/slide mapping in `review-index.json` is represented;
- play, pause, and stop work with keyboard and pointer input;
- audio stops on slide change, minimize, page hide, and teardown;
- the visible slide copy remains the complete transcript; and
- the UI discloses that the voice is AI-generated with Kokoro.

Do not copy the batch into `public/onboarding/start-here/audio/`, activate the
runtime manifest, or mark approval complete until the owner has completed the
full listen-through. No previous media approval carries over to this batch.

After the listen-through, copy `owner-approval.example.json` into the ignored
work directory, complete every field, and publish with:

```powershell
.\.venv\Scripts\python.exe scripts/start-here-audio/promote.py --approval scripts/start-here-audio/work/owner-approval.json --scripts scripts/start-here-audio/work/scripts.json
```

Promotion fails closed on a missing clip, checksum mismatch, incomplete quality
checklist, mismatched script bundle, mismatched clip count, or an existing
publication target. It copies only reviewed MP3/VTT deliverables, records the
exact scripts and provenance, and replaces the pending runtime manifest with
the approved content-addressed clip allowlist.
