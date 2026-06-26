Original prompt: Allow the White Cell to allocate time for each game state mark, e.g. Strategic Orientation, Move 1, Move 2 and Move 3

Notes:
- 2026-06-25: Read the web-game workflow, White Cell controller, game-state store, database RPC boundary, Supabase mock, schema SQL, and live demo runbook.
- The current app has a single persisted `timer_seconds` value. The planned change is a persisted `timer_allocations` map on `game_state`, updated only through the existing White Cell operator RPC path.
- 2026-06-25: Added White Cell Time Allocations controls, `timer_allocations` game-state persistence, a protected Supabase RPC patch, mock backend support, focused unit coverage, and runbook/setup docs.

TODO:
- Human should apply `data/2026-06-25_timer_allocations_game_state.sql` to existing Supabase projects before using the allocation form against live backend.
- Human should run `npm test -- --run`, `npm run build`, and the relevant live-demo E2E gate.
