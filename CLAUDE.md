# CLAUDE.md — live-quakes

## What This Project Is
Static Leaflet map of the last 30 days of USGS M≥2.5 earthquakes, with a timeline scrubber, tectonic-plate overlay, and a "center on date" picker for historical windows. Hosted on GitHub Pages: https://warrenrross.github.io/live-quakes/

## Session-Start Checklist
1. Read this file
2. Default branch is `master` (not `main`); pushing to it redeploys Pages
3. Run locally from inside this folder: `python3 -m http.server 8000`, then open `http://localhost:8000` (not `file://`; OSM tiles can be blocked without a Referer)

## Architecture Decisions
| Decision | Rationale |
|----------|-----------|
| No build step, no API keys | Keep it deployable as plain static files on Pages |
| Basemaps: Esri Light/Dark Gray + OSM Streets | CARTO public tiles now return an "API KEY REQUIRED" watermark (HTTP 200, so curl status checks miss it) |
| Magnitude colors in `magColor()` (logic.js) | Legend reads the same function; blue→indigo→purple→red→red-orange→orange |
| Center-on-date uses the USGS FDSN query API (`API_QUERY`), ±15 days (`HALF_WINDOW_MS`), M≥2.5 | Keyless + CORS-enabled; keeps the window at 30 days like the live feed. Max 20,000 events/request. `loadForDate()` swaps `quakes` and re-applies the current view mode; a token guards against out-of-order responses |
| Loading a date or switching basemaps never moves the map | User preference. A `baselayerchange` guard restores the last settled view; no `fitBounds` on date load |
| Legend is a plain absolutely-positioned div, not an `L.control` | Needed so it can be dragged. `enableLegendDrag()` ported from World_Coffee_Trade: snaps to br (default) / bl / tl, <10px travel snaps back, dot-product picks the target corner. A tap on its title collapses it |
| Cumulative timeline uses its own `CumulativeTimeline` class (logic.js), not stock `L.Timeline.updateDisplayedLayers` | Stock plugin re-matches every shown marker against every active feature each tick (O(n²) + `getLayers()` copies); with ~1,500 markers playback bogged down. Ours binary-searches a time-sorted list and adds/removes only the delta (300 slider steps: 32.9 s → 38 ms, identical marker counts). Window mode still uses the stock plugin (only ~50 active markers) |
| Collapsible panels: Earthquake view, plugin's "Controls to Run Timeline", legend | Click the title bar; state saved in localStorage (`live-quakes-eq-collapsed`, `-tl-collapsed`, `-legend-collapsed`, `-legend-pos`). The timeline box is recreated on each rebuild, so `decorateTimelineControl()` re-attaches the toggle every mount |

## Directory Structure
`index.html`, `static/js/logic.js` (all app logic), `static/css/style.css` (all app styles; `leaflet.timeline.css` is the plugin's), `static/plugins/leaflet/timeline/` (bundled), `Images/`

## Known Issues
| Issue | Status | Notes |
|-------|--------|-------|
| CARTO tiles watermarked | Resolved 2026-10-30 | Replaced with Esri/OSM |
| `.gitignore` lists old `config.js`/`config.py`/`old.js` | Open | Leftovers from the Mapbox era; harmless |
| OSM tile usage policy | Note | Fine for light use; switch source if traffic grows |
| Esri layers max zoom 16 | Note | OSM goes to 19; past zoom 16 Leaflet greys out Light/Dark (expected) |
| Big events (e.g. 2011 Japan) return 4k+ markers in a ±15 day window | Note | May feel heavy; consider a higher min magnitude if it matters |
| Legend has no top-right corner | By design | The layers/Earthquake view/timeline panels occupy it |
| Basemap-switch recenter | Resolved 2026-11-03 | Could not be reproduced; user confirmed it doesn't recenter. The `baselayerchange` guard stays as a safety net |

## Pending Tasks
1. Optionally clean stale entries from `.gitignore`
2. Future: compare algorithms. Idea: sort the quake data once at retrieval time (right after fetch / in `loadForDate`) and build everything downstream (static layer, window timeline, cumulative timeline) assuming sorted input, instead of `CumulativeTimeline` sorting privately. Benchmark window mode with the sorted-list/binary-search approach vs the stock interval tree (`ranges.lookup`) before changing it; window mode is already smooth, so only do it if it simplifies code or measurably helps

## Testing Notes
Benchmarking timeline playback: in headless Chrome, select Timeline + Cumulative, then dispatch `input` events on `.time-slider` (e.g. 300 steps min→max) and time the loop; compare against a copy of the old code served on another port.

Headless Chrome works for visual checks: `puppeteer-core` pointed at `/Applications/Google Chrome.app` (install in the scratchpad, not the repo). Serve the parent folder or this one and screenshot; useful since curl can't see tile watermarks or layout bugs.

## Session History
| Date | Work Done |
|------|-----------|
| 2026-10-30 | Diagnosed "API KEY REQUIRED" map watermark (CARTO), swapped to Esri/OSM tiles; changed quake color ramp to blue/purple/red/orange; pushed to master |
| 2026-11-02 | Added center-on-date picker (USGS FDSN, ±15 days); made Earthquake view, timeline controls and legend collapsible; legend drags/snaps to corners (ported from World_Coffee_Trade); basemap switch/date load keep current view; restyled timeline box; pushed to master (a5badb2) |
| 2026-11-03 | Cumulative timeline rewritten as `CumulativeTimeline` (sorted prefix + binary search; ~860x faster); basemap recenter issue closed; noted sort-at-retrieval algorithm comparison as future step |
