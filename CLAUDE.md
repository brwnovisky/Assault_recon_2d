# Assault & Recon

## Architecture rules
- `state.js` is the state container only (`state`, `say`, `setDoor`). Persistence lives in `storage.js`.
- Systems (`systems/*`, `entities/*`, `world.js`, `storage.js`) never touch the DOM. They mutate `state` and set `state.uiDirty`; `app.js` `ui()` is the single place that writes DOM state derived from `state`.
- Planning commands (`systems/planning.js`) don't request frames. The `app.js` event handler calls `req()` after the command.
- Always open/close doors through `setDoor(i, open)`, so `door.open` and `state.opaque` stay in sync.
- Operators and enemies come from `createUnit` (`entities/unit.js`). Behavior shared by both units goes there.
- Replay frames and the pre-replay save share `snapshot`/`applySnapshot` in `systems/replay.js`. Add new replayed fields to the key lists, not to new copy code.

## Verifying changes
- There is no test suite. To check refactors, use a deterministic headless-Chrome harness: seed `Math.random`, stub `requestAnimationFrame` with a manual pump at fixed 60 fps timestamps, no-op `setPointerCapture`, pin the `.stage` height, and wait for `document.fonts.ready`. Then compare state text and canvas hashes before and after the change.

## Fix log

### Map canvas not rendering on page load/refresh
- Symptom: blank stage, no squad chips; console shows `Cannot read properties of null (reading 'addEventListener')` in `js/app.js`.
- Root cause: an element bound in `setupEvents()` (`#replayBtn`) was removed from `index.html`. The throw aborts `setupEvents()`, so `start()` never calls `layout()` and the ResizeObserver is never attached.
- Rule: every `$("id")` bound in `js/app.js` must exist in `index.html`. When removing markup, remove its bindings in the same change. Check the browser console before changing CSS for rendering issues.

### Replay HUD (log, kills, HP pips) frozen during replay
- Root cause: applying a replay frame never set `state.uiDirty`, so `ui()` didn't run while replaying or after seeking.
- Fix: `applySnapshot` sets `state.uiDirty`.

### Turn-1 redeploy didn't request a redraw
- Root cause: `redeploy()` marked the UI dirty, but `tapAt` returned without calling `req()`.
- Fix: `tapAt` always calls `req()` after `tapTile()`.
