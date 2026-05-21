# live-quakes

A real-time visualization of [USGS earthquake data](https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_month.geojson) on an interactive Leaflet map. Plays the last 30 days of magnitude ≥ 2.5 events back as colored circles, with an optional timeline scrubber and a tectonic-plate overlay.

**Live demo:** [warrenrross.github.io/live-quakes](https://warrenrross.github.io/live-quakes/)

![map preview](Images/2-BasicMap.png)

## Features

- Pulls live data from the USGS GeoJSON feed every time the page is loaded.
- Circle markers sized and colored by magnitude on a green → red ramp.
- Tooltips on hover; popups on click with the place, time and a deep-link to the USGS event page.
- Tectonic-plate boundaries from [`fraxen/tectonicplates`](https://github.com/fraxen/tectonicplates) toggleable as an overlay.
- A timeline scrubber (Leaflet.timeline) you can switch on to watch the last month of seismic activity play back in time order.
- Three base maps to choose from: CARTO Voyager (default), Positron (light), Dark Matter (dark).

## Stack

- Pure HTML, CSS, and ES2020 JavaScript — no build step.
- [Leaflet 1.9.4](https://leafletjs.com/) for the map.
- [Leaflet.timeline](https://github.com/skeate/Leaflet.timeline) (bundled in `static/plugins/`) for the timeline scrubber.
- [CARTO basemaps](https://carto.com/basemaps/) for tiles — free, no API key required, attribution-only.

> Earlier versions of this project used Mapbox tiles and required an API key in `static/js/config.js`. That dependency has been removed.

## Run locally

The site is static — anything that serves files over HTTP will do.

```bash
git clone https://github.com/warrenrross/live-quakes.git
cd live-quakes
python3 -m http.server 8000
# open http://localhost:8000
```

## Layout

```
.
├── index.html
├── static/
│   ├── css/
│   │   ├── style.css
│   │   └── leaflet.timeline.css
│   ├── js/
│   │   └── logic.js
│   └── plugins/leaflet/timeline/
│       ├── IntervalTree.js
│       ├── Timeline.js
│       └── TimelineSliderControl.js
└── Images/
```

## Data sources

- USGS earthquakes — [earthquake.usgs.gov](https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_month.geojson)
- Tectonic plate boundaries — [github.com/fraxen/tectonicplates](https://github.com/fraxen/tectonicplates)

## License

MIT — see `LICENSE` if present, otherwise treat this as MIT.
