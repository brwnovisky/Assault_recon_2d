# Assault & Recon

## Architecture rules
- `state.js` is the state container only (`state`, `say`, `setDoor`). Persistence lives in `storage.js`.
- Systems (`systems/*`, `entities/*`, `world.js`, `storage.js`) never touch the DOM. They mutate `state` and set `state.uiDirty`; `app.js` `ui()` is the single place that writes DOM state derived from `state`.
- Planning commands (`systems/planning.js`) don't request frames. The `app.js` event handler calls `req()` after the command.
- Always open/close doors through `setDoor(i, open)`, so `door.open` and `state.opaque` stay in sync.
- Operators and enemies come from `createUnit` (`entities/unit.js`). Behavior shared by both units goes there.
- Replay frames and the pre-replay save share `snapshot`/`applySnapshot` in `systems/replay.js`. Add new replayed fields to the key lists, not to new copy code.
- Execution always runs at 1.0x. `state.replaySpeed` (cycled through `REPLAY_SPEEDS`) affects only replay playback.
- One timeline (`#timeline`, `#timeTxt`) shows execution progress and seeks the replay. `timeline()` in `app.js` updates it every frame.
- `state.mode` can be `null`. With no mode active, a map tap selects an operator; pressing the active mode's button or key turns it off.
- Position conflicts are resolved by path-creation priority (`priority`/`byPriority` in `entities/operator.js`). An operator without its own route keeps its tile; otherwise the route created earlier (`planAt`, from `state.planSeq`) wins. `resolveEnds()` in `planning.js` keeps planned end tiles unique by trimming lower-priority routes. `moveOperators()` processes operators in priority order, and `blocker()` never lets two operators reserve the same tile.
- The canvas uses a fractional tile size (`layout()` in `render.js`), so the map exactly fills the stage's limiting side. The stage size must never depend on content that changes between states: `flex: 1`/`min-height: 0` for the stage, and fixed-height HUD rows (for example `.chip .mv` keeps `min-height` when empty).
- Tracers store only the shot's end point (`tx`, `ty`, hit or miss) and the shooter (`en`, `i`). `render.js` draws them from the shooter's current muzzle, and `gunPose` aims the arms and weapon at the end point, with recoil decaying over `TRACER_LIFE`.

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

### Operators ending a turn on the same tile
- Symptom: a fuzz test of 600 turns (4 seeds) with converging routes found 5 turns where two operators finished on one tile.
- Root cause: `blocker()` only blocked a tile when the ally on it sat exactly at its centre, so a second operator could reserve a tile another operator was already entering.
- Fix: a tile reserved by another operator (`res === k`) always blocks; a tile is passable only while its occupant is leaving it (`res >= 0`). Planned end tiles are also kept unique by priority.

### Canvas overflowing the stage after a map change
- Symptom: on a 14×10 map at 1400×1000 the canvas was 565px tall in a 552px stage, and it never corrected itself.
- Root cause: `start()` calls `layout()` right after `buildSquad()`, while the chips' `.mv` text is still empty, which makes the panel 12.5px shorter. `ui()` restores the chips before ResizeObserver delivers, so the observer sees no size change and never relayouts.
- Fix: `.chip .mv` has `min-height: 1.35em`, so panel height doesn't depend on state. `layout()` reads the stage size with `getBoundingClientRect()` to get exact fractional sizes.
- Testing note: under `--virtual-time-budget`, headless Chrome holds back ResizeObserver callbacks and rAF. Check layout in real time through the DevTools protocol (a stdlib websocket client is enough).

### Turn-1 redeploy didn't request a redraw
- Root cause: `redeploy()` marked the UI dirty, but `tapAt` returned without calling `req()`.
- Fix: `tapAt` always calls `req()` after `tapTile()`.
