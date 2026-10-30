# CLAUDE.md — live-quakes

## What This Project Is
Static Leaflet map of the last 30 days of USGS M≥2.5 earthquakes, with a timeline scrubber and tectonic-plate overlay. Hosted on GitHub Pages: https://warrenrross.github.io/live-quakes/

## Session-Start Checklist
1. Read this file
2. Default branch is `master` (not `main`); pushing to it redeploys Pages
3. Run locally: `python3 -m http.server 8000`

## Architecture Decisions
| Decision | Rationale |
|----------|-----------|
| No build step, no API keys | Keep it deployable as plain static files on Pages |
| Basemaps: Esri Light/Dark Gray + OSM Streets | CARTO public tiles now return an "API KEY REQUIRED" watermark (HTTP 200, so curl status checks miss it) |
| Magnitude colors in `magColor()` (logic.js) | Legend reads the same function; blue→indigo→purple→red→red-orange→orange |

## Directory Structure
`index.html`, `static/js/logic.js` (all app logic), `static/css/`, `static/plugins/leaflet/timeline/` (bundled), `Images/`

## Known Issues
| Issue | Status | Notes |
|-------|--------|-------|
| CARTO tiles watermarked | Resolved 2026-10-30 | Replaced with Esri/OSM |
| `.gitignore` lists old `config.js`/`config.py`/`old.js` | Open | Leftovers from the Mapbox era; harmless |
| OSM tile usage policy | Note | Fine for light use; switch source if traffic grows |
| Esri layers max zoom 16 | Note | OSM goes to 19 |

## Pending Tasks
1. Optionally clean stale entries from `.gitignore`

## Session History
| Date | Work Done |
|------|-----------|
| 2026-10-30 | Diagnosed "API KEY REQUIRED" map watermark (CARTO), swapped to Esri/OSM tiles; changed quake color ramp to blue/purple/red/orange; pushed to master |
