# Assault & Recon

## Architecture rules
- `state.js` is the state container only (`state`, `say`, `setDoor`). Persistence lives in `storage.js`.
- Systems (`systems/*`, `entities/*`, `world.js`, `storage.js`) never touch the DOM. They mutate `state` and set `state.uiDirty`; `app.js` `ui()` is the single place that writes DOM state derived from `state`.
- Planning commands (`systems/planning.js`) don't request frames. The `app.js` event handler calls `req()` after the command.
- Always open/close doors through `setDoor(i, open)`, so `door.open` and `state.opaque` stay in sync.
- Doors are sliding doors (`systems/doors.js`), drawn as a bar 1/3 of a tile thick. `slide` goes from 0 (closed) to 1 (retracted into the wall, leaving a stub) at `DOOR_SPEED` per second, advanced by `updateDoors()` at the start of `step()`. `doorBusy(d)` = open and `slide < 1`. Opacity clears as soon as a door opens. Replay frames store `[open, slide]`; saved matches only store `doorsOpen` (matches are saved between turns, so an open door restores fully slid). A turn isn't done while any door is busy.
- Abrir (open) mode, key O: with an operator selected, tapping a door Chebyshev-adjacent to the end of its current route (or its starting tile) adds `o.opens = [{ at, door, tx, ty }]` (`openTap()` in `planning.js`), shown as a key icon on the door tile (`keyMark()` in `render.js`). At that route point `moveOperators()` opens the door and waits until it has fully slid open; moves planned afterwards start only then. Walking into a closed door also opens it and waits for the slide. `pruneHolds()` also drops opens whose route point changed.
- Operators and enemies come from `createUnit` (`entities/unit.js`). Behavior shared by both units goes there.
- Replay frames and the pre-replay save share `snapshot`/`applySnapshot` in `systems/replay.js`. Add new replayed fields to the key lists, not to new copy code.
- Execution always runs at 1.0x. `state.replaySpeed` (cycled through `REPLAY_SPEEDS`) affects only replay playback.
- One timeline (`#timeline`) shows execution progress and seeks the replay. It sits on top of the map inside `.board`; `contain: inline-size` makes it as wide as the canvas. `timeline()` in `app.js` updates it every frame, and `ticks()` draws a mark every second with labels every 1/2/5/10 s depending on width. The top `.topbar` holds the replay group (`.seg`: Replay, Pausar, speed, Sair), the time label (`#timeTxt`) and the turn actions (Reiniciar, Executar).
- Tick marks and the progress fill share the 14px thumb geometry: `calc(7px + (100% - 14px) * fraction)`.
- `state.mode` can be `null`. With no mode active, a map tap selects an operator; pressing the active mode's button or key turns it off. Switching to another operator (`select()`) also turns the mode off.
- Aims are anchored to the route: `o.aims = [{ at, x, y }]`, where `at` is the route length when the aim was set. `activeAim(o)` (`entities/operator.js`) is the last aim with `at <= o.pi`. `moveOperators()` faces it every tick (moving, blocked or waiting), and `fight()` runs afterwards, so an engaged enemy takes priority. Trimming a route clamps `at`; an aim at the same point replaces the previous one (undo restores it through `{ aim, replaced }`).
- When a wall blocks the line to the active aim (`los < 0`), `aimAngle()` (`entities/operator.js`) locks the operator on the wall edge instead: it sweeps outward from the aim line in `EDGE_STEP` steps on both sides with `rayDist()` (`pathfinding.js`, grid DDA) and faces the nearest angle where the ray reaches the aim distance or jumps past the occluder. Once the line is clear it faces the aim itself.
- A turn counts as done only when every route has finished and the operator has finished turning (`want` reached), so the final aim is actually held. There is no minimum turn time; an idle turn ends on its first step.
- Executar (button and Enter) requires at least one player order: `hasOrders()` in `planning.js` checks for any living operator with `acts`. Steps left over from the previous turn don't count.
- Position conflicts are resolved by path-creation priority (`priority`/`byPriority` in `entities/operator.js`). An operator without its own route keeps its tile; otherwise the route created earlier (`planAt`, from `state.planSeq`) wins. New route segments never pass through or end on another living operator's final tile (`endOf`): `tapTile()` passes those tiles to `bfs()` as `avoid`, and tapping one is refused. A new route may pass through tiles of another operator's route but never end on one: tapping such a tile is refused, and a route cut by the move budget steps back to the last tile off other routes. `resolveEnds()` in `planning.js` keeps planned end tiles unique by trimming lower-priority routes. `moveOperators()` processes operators in priority order, and `blocker()` never lets two operators reserve the same tile.
- The canvas uses a fractional tile size (`layout()` in `render.js`), so the map exactly fills the stage's limiting side, minus whatever else is in `.board` (the time bar and gap). The stage size must never depend on content that changes between states: `flex: 1`/`min-height: 0` for the stage, and fixed-height HUD rows (for example `.chip .mv` keeps `min-height` when empty).
- Destructive buttons (Reiniciar, Apagar dados salvos) use `confirmClick()` in `app.js`: the first tap arms the button (`.armed`, new label) and a second tap within 3 s confirms.
- The selected operator is marked with a silhouette outline (`drawOutline()` in `render.js`) instead of a circle. The figure is drawn without its ground shadow into an offscreen canvas, stamped in 8 directions, tinted with the operator's colour, and then has the figure cut out. `drawOperator(g, …)`, `drawArm(g, …)` and `applyGun(g, …)` take the target context for this reason.
- Enemies always see only within their cone (`fight()` has no 360° mode). The first time an enemy is alerted, by a shot within 8 tiles or by acquiring a target, `alertEnemy()` (`entities/enemy.js`) sets `alert` and picks `watchDoor`, a random door index of its own room (`roomOf`). `updateWatch()` re-draws it every `WATCH_SWITCH` (5) seconds of sim time, always picking a different door when the room has more than one; the countdown is `watchLeft`, compared with a `1e-9` tolerance. An alerted enemy with no target faces `watchAngle(e)`. Saved matches without `watchDoor` are not restored.
- An enemy under fire (`shoot()` with an operator targeting it, hit or miss) calls `takeFire()` (`entities/enemy.js`): it is alerted, the shooter's bit is set in `attackers`, and `threatLeft` is reset to `THREAT_MEMORY` (4) s. While `attackersOf(e)` (living attackers, nearest first) is non-empty, the enemy faces the nearest attacker instead of its watched door, and `fight()` only considers attackers as targets; when the memory expires or all attackers die, it falls back to every operator.
- Wait (Esperar) is one tap: with an operator selected and the wait mode on, tapping a tile of another operator's route binds the end of the selected operator's current route (`at = o.path.length`; 0 is its starting tile) to that tile (`waitTap()` in `planning.js`). Moves planned afterwards start only once the other operator reaches the tile; combat keeps running while waiting. A hold may sit at the route end (`pruneHolds()` keeps `h.at <= o.path.length`). `holdMark()` in `render.js` draws a solid bar across the route where movement resumes (`o.path[at]`, or facing the trigger tile when nothing follows yet) plus the dashed link to a clock icon on the trigger tile. Wait marks are drawn in their own pass after every route, so other routes never cover the clock.
- Units are drawn in a local frame scaled by `UNIT_SCALE` (1.5, `render.js`): with a tile ≈ 1 m (one door width), shoulders ≈ 0.63 and the head ≈ 0.25 of a tile. `gunPose()` divides the target offset by it and `muzzle()` multiplies the barrel point by it, so tracers leave the drawn muzzle; `OUTLINE_BOX` and the dead-unit X scale with it too.
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

### Refresh crashed after planning any route
- Symptom: plan a route, refresh, and the squad cards are empty and the game doesn't start. The console shows `TypeError: Cannot use 'in' operator to search for 'hold' in 7` in `storage.js` `restore()`.
- Root cause: the restore filter did `"hold" in a` on move steps, which are plain numbers. The bug was already present before the refactor.
- Fix: the filter only inspects object steps: `typeof a === "number" || !("hold" in a) || a.hold`.

### Turn ended before the final aim was faced
- Root cause: the turn resolved on the same tick the last route finished, before the operator had turned toward its aim.
- Fix: `done` in `simulation.js` also requires `|adiff(want, a)| < 1e-6`.

### Turn-1 redeploy didn't request a redraw
- Root cause: `redeploy()` marked the UI dirty, but `tapAt` returned without calling `req()`.
- Fix: `tapAt` always calls `req()` after `tapTile()`.
