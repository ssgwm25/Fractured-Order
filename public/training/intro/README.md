# Training introduction media

This directory contains authored delivery metadata and accessibility files for
the local, video-first training introduction. Runtime playback is local to the
application bundle; it does not use a third-party player, tracker, or reusable
browser credential.

Committed deliverables:

- `media-manifest.json` records the source, full 2:28 playback duration, poster,
  caption path, and release-review state.
- `plenum-onboarding.en.vtt` is the English WebVTT track mirrored by the visible
  transcript in `TrainingIntroModal.js`.
- `plenum-onboarding.mp4.placeholder.txt` records the handoff path for a future
  owner-approved final export without committing an editing project or cache.

The product owner selected full playback of the 2:28 source and confirmed that
synchronized open captions are burned into the video image. The independent
WebVTT track and visible transcript use the approved explainer script. Its
authored narration and scene times run from 0:00 through 1:28; the remaining
minute has no scripted narration in that source. Recheck every WebVTT cue to a
0.5-second tolerance whenever the video or script changes. A failed or missing
media request does not block a learner: the text transcript, Retry, and Continue
actions remain available.
