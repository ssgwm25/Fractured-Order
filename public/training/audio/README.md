# Training narration release assets

This directory is the public boundary for final, owner-approved guided
narration only.

The current `provenance.json` is intentionally marked
`pending-owner-review`. No narration binary is approved or published yet. The
candidate voice must pass the four-clip checklist in
`scripts/training-audio/README.md` before bulk generation can populate
`clips/`, `captions/`, generation dates, durations, or output checksums.

At runtime, incomplete provenance fails closed to visible lesson text and the
explicitly labelled browser Web Speech fallback. It never triggers a hosted or
paid TTS request.
