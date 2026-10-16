# Assault & Recon

## Fix log

### Map canvas not rendering on page load/refresh
- Symptom: blank stage, no squad chips; console shows `Cannot read properties of null (reading 'addEventListener')` in `js/app.js`.
- Root cause: an element bound in `setupEvents()` (`#replayBtn`) was removed from `index.html`. The throw aborts `setupEvents()`, so `start()` never calls `layout()` and the ResizeObserver is never attached.
- Rule: every `$("id")` bound in `js/app.js` must exist in `index.html`. When removing markup, remove its bindings in the same change. Check the browser console before changing CSS for rendering issues.
