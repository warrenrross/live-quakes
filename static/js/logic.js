/* live-quakes
 * A modern Leaflet visualization of USGS earthquake data.
 *
 * Data:
 *   - USGS earthquakes (past 30 days, M ≥ 2.5)
 *   - Tectonic plate boundaries (fraxen/tectonicplates)
 *
 * Tiles: CARTO Voyager (free, no API key, attribution-only).
 */

const API_QUAKES =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_month.geojson";
const API_PLATES =
  "https://raw.githubusercontent.com/fraxen/tectonicplates/master/GeoJSON/PB2002_boundaries.json";

/* ---------- styling helpers ---------- */

// Color ramp by magnitude (low → high).
function magColor(mag) {
  if (mag < 2.5) return "#a7f3d0"; // light green
  if (mag < 3.5) return "#fde68a"; // light amber
  if (mag < 4.5) return "#fdba74"; // orange
  if (mag < 5.5) return "#f87171"; // red
  if (mag < 6.5) return "#dc2626"; // strong red
  return "#7f1d1d";                // dark red
}

// Quake-marker radius scales with magnitude.
//
// Earthquake energy is roughly proportional to 10^(1.5 * mag), so a one-point
// jump in magnitude is ~32x more energetic. To make that legible without
// hiding small events, we scale radius by an exponential of magnitude:
//
//   M 2.5 → ~4 px       M 5.5 → ~16 px
//   M 3.5 → ~6 px       M 6.5 → ~26 px
//   M 4.5 → ~10 px      M 7.5 → ~42 px
//
// A small floor keeps very low-magnitude markers clickable; no upper clamp
// so the big events really stand out.
function magRadius(mag) {
  const m = Math.max(0, mag || 0);
  return Math.max(3.5, Math.pow(1.6, m));
}

const MAG_BINS = [
  { label: "< 2.5", value: 2.0 },
  { label: "2.5 – 3.5", value: 3.0 },
  { label: "3.5 – 4.5", value: 4.0 },
  { label: "4.5 – 5.5", value: 5.0 },
  { label: "5.5 – 6.5", value: 6.0 },
  { label: "6.5 +", value: 7.0 },
];

/* ---------- popup + tooltip ---------- */

function quakePopupHtml(p) {
  const mag = (p.mag ?? 0).toFixed(1);
  const when = new Date(p.time).toLocaleString();
  const place = p.place || "Unknown location";
  const url = p.url || `https://earthquake.usgs.gov/earthquakes/eventpage/${p.code || ""}`;
  return `
    <div class="quake-popup">
      <span class="mag">M ${mag}</span>
      <h3>${place}</h3>
      <div class="meta">${when}</div>
      <a href="${url}" target="_blank" rel="noopener">USGS event page ↗</a>
    </div>
  `;
}

function bindQuakeInteractions(feature, layer) {
  const p = feature.properties || {};
  if (p.mag != null && p.place) {
    layer.bindTooltip(`M ${p.mag.toFixed(1)} — ${p.place}`, {
      className: "quake-tip",
      direction: "top",
      offset: [0, -6],
    });
  }
  layer.bindPopup(quakePopupHtml(p));
}

/* ---------- map construction ---------- */

function buildMap() {
  // Carto Voyager — free, no token, retina-friendly.
  const voyager = L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
    }
  );

  const positron = L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
    }
  );

  const darkMatter = L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
    }
  );

  const map = L.map("map-id", {
    center: [20, -40],
    zoom: 2,
    minZoom: 2,
    worldCopyJump: true,
    zoomControl: true,
    layers: [voyager],
  });

  return { map, baseLayers: { Voyager: voyager, Light: positron, Dark: darkMatter } };
}

/* ---------- legend ---------- */

function buildLegend() {
  const legend = L.control({ position: "bottomright" });
  legend.onAdd = () => {
    const div = L.DomUtil.create("div", "info legend");
    let html = "<h4>Magnitude</h4>";
    for (const bin of MAG_BINS) {
      const d = Math.min(28, magRadius(bin.value) * 2); // diameter, capped so legend stays tidy
      const swatch = `width:${d}px;height:${d}px;background:${magColor(bin.value)}`;
      html += `<div class="row"><span class="swatch" style="${swatch}"></span>${bin.label}</div>`;
    }
    div.innerHTML = html;
    return div;
  };
  return legend;
}

/* ---------- data loading ---------- */

async function loadJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r.json();
}

function buildQuakeLayer(geojson) {
  return L.geoJSON(geojson, {
    pointToLayer: (feature, latlng) => {
      const mag = feature.properties.mag || 0;
      return L.circleMarker(latlng, {
        radius: magRadius(mag),
        fillColor: magColor(mag),
        color: "#ffffff",
        weight: 1.5,
        opacity: 1,
        fillOpacity: 0.85,
      });
    },
    onEachFeature: bindQuakeInteractions,
  });
}

/**
 * Build a Leaflet.timeline layer with one of two interval strategies:
 *
 *   - "window":     each quake is visible for 24h starting at its event time,
 *                   then disappears. Reads as a moving slice through the month.
 *   - "cumulative": each quake appears at its event time and stays visible
 *                   until the end of the data. Reads as the map gradually
 *                   filling in as the month plays out.
 */
function buildTimelineLayer(geojson, mode = "window") {
  if (typeof L.Timeline !== "function") return null;

  const ONE_DAY = 86400000;
  // Last event time in the feed (used as the "keep forever" end-point).
  const maxTime = geojson.features.reduce(
    (acc, f) => Math.max(acc, f.properties.time || 0),
    0
  );
  const cumulativeEnd = maxTime + ONE_DAY;

  const getInterval =
    mode === "cumulative"
      ? (q) => ({ start: q.properties.time, end: cumulativeEnd })
      : (q) => ({ start: q.properties.time, end: q.properties.time + ONE_DAY });

  return new L.Timeline(geojson, {
    getInterval,
    pointToLayer: (feature, latlng) => {
      const mag = feature.properties.mag || 0;
      return L.circleMarker(latlng, {
        radius: magRadius(mag),
        fillColor: magColor(mag),
        color: "#ffffff",
        weight: 1.5,
        opacity: 1,
        fillOpacity: 0.9,
      });
    },
    onEachFeature: bindQuakeInteractions,
  });
}

function buildPlatesLayer(geojson) {
  const baseStyle = { color: "#f97316", weight: 2, opacity: 0.7 };
  const hoverStyle = { color: "#ea580c", weight: 4, opacity: 1 };

  const layer = L.geoJSON(geojson, {
    style: () => baseStyle,
    onEachFeature: (feature, lyr) => {
      const name = feature?.properties?.Name || "Plate boundary";
      lyr.bindTooltip(name, { className: "quake-tip", sticky: true });
      lyr.on({
        mouseover: (e) => e.target.setStyle(hoverStyle),
        mouseout: (e) => e.target.setStyle(baseStyle),
      });
    },
  });
  return layer;
}

/* ---------- boot ---------- */

/* ---------- Earthquake-view radio control ----------
 *
 * One picker, three choices: Static / Timeline / Off.
 * When "Timeline" is selected, a slider control appears at the bottom
 * with its own radio group (Moving window / Cumulative) that rebuilds
 * the timeline in place when toggled.
 */
const EarthquakeViewControl = L.Control.extend({
  options: { position: "topright" },
  initialize(opts) { L.Util.setOptions(this, opts); this._mode = "static"; },
  setMode(m) { this._mode = m; this._sync(); this.options.onChange && this.options.onChange(m); },
  getMode() { return this._mode; },
  onAdd() {
    const div = L.DomUtil.create("div", "leaflet-control eq-view-control");
    L.DomEvent.disableClickPropagation(div);
    L.DomEvent.disableScrollPropagation(div);
    div.innerHTML = `
      <h4>Earthquake view</h4>
      <label><input type="radio" name="eq-view" value="static" checked /> Static · all 30 days</label>
      <label><input type="radio" name="eq-view" value="timeline" /> Timeline</label>
      <label><input type="radio" name="eq-view" value="off" /> Off</label>
    `;
    this._div = div;
    div.querySelectorAll('input[name="eq-view"]').forEach((el) => {
      L.DomEvent.on(el, "change", () => this.setMode(el.value));
    });
    return div;
  },
  _sync() {
    if (!this._div) return;
    this._div.querySelectorAll('input[name="eq-view"]').forEach((el) => {
      el.checked = (el.value === this._mode);
    });
  },
});

/* ---------- boot ---------- */

(async function init() {
  const { map, baseLayers } = buildMap();
  buildLegend().addTo(map);

  let quakes = null;
  let quakeLayer = null;
  let activeTimeline = null;
  let timelineControl = null;
  let timelineModeUi = null;       // DOM container injected into the slider control
  let timelineMode = "window";     // "window" | "cumulative"

  try {
    quakes = await loadJSON(API_QUAKES);
    quakeLayer = buildQuakeLayer(quakes); // not added yet — controller decides
  } catch (err) {
    console.error("Failed to load USGS quakes:", err);
  }

  // Tectonic plates (still a normal toggle)
  let platesLayer = null;
  try {
    const plates = await loadJSON(API_PLATES);
    platesLayer = buildPlatesLayer(plates);
  } catch (err) {
    console.error("Failed to load tectonic plates:", err);
  }

  // Layer control: base maps + (only) the plate overlay.
  const overlays = {};
  if (platesLayer) overlays["Tectonic plate boundaries"] = platesLayer;
  L.control.layers(baseLayers, overlays, {
    collapsed: false,
    position: "topright",
  }).addTo(map);

  /* ---------- mode controllers ---------- */

  function clearTimeline() {
    if (activeTimeline) {
      map.removeLayer(activeTimeline);
      activeTimeline = null;
    }
    if (timelineControl) {
      timelineControl.remove();
      timelineControl = null;
      timelineModeUi = null;
    }
  }

  function clearStatic() {
    if (quakeLayer && map.hasLayer(quakeLayer)) map.removeLayer(quakeLayer);
  }

  function showStatic() {
    if (!quakeLayer) return;
    if (!map.hasLayer(quakeLayer)) quakeLayer.addTo(map);
    // make sure it has all features (in case timeline emptied it earlier)
    if (quakes) { quakeLayer.clearLayers(); quakeLayer.addData(quakes); }
  }

  function rebuildTimelineLayer() {
    // Replace the L.Timeline layer while keeping the slider control,
    // so toggling Moving window <-> Cumulative feels instant.
    if (!quakes || !timelineControl) return;
    if (activeTimeline) map.removeLayer(activeTimeline);
    activeTimeline = buildTimelineLayer(quakes, timelineMode);
    if (!activeTimeline) return;
    activeTimeline.addTo(map);
    // re-bind to the existing slider control
    if (typeof timelineControl.addTimelines === "function") {
      // The plugin doesn't expose a remove API; the simplest reliable
      // rebind is to recreate the control too.
      timelineControl.remove();
      timelineControl = null;
      timelineModeUi = null;
      mountTimelineControl();
    }
  }

  function mountTimelineControl() {
    if (typeof L.timelineSliderControl !== "function") return;
    timelineControl = L.timelineSliderControl({
      duration: 30000,
      formatOutput: (date) =>
        new Date(date).toUTCString().replace(/^\w+, /, ""),
    });
    timelineControl.addTo(map);
    timelineControl.addTimelines(activeTimeline);

    // Inject the mode radio group into the slider control's DOM.
    const root = timelineControl.getContainer ? timelineControl.getContainer() : null;
    if (root) {
      timelineModeUi = L.DomUtil.create("div", "eq-timeline-mode", root);
      L.DomEvent.disableClickPropagation(timelineModeUi);
      timelineModeUi.innerHTML = `
        <div class="eq-timeline-mode-title">Mode</div>
        <label><input type="radio" name="eq-tl-mode" value="window" ${timelineMode === "window" ? "checked" : ""} /> Moving window <span class="hint">(24 h slice)</span></label>
        <label><input type="radio" name="eq-tl-mode" value="cumulative" ${timelineMode === "cumulative" ? "checked" : ""} /> Cumulative <span class="hint">(builds up)</span></label>
      `;
      timelineModeUi.querySelectorAll('input[name="eq-tl-mode"]').forEach((el) => {
        L.DomEvent.on(el, "change", () => {
          timelineMode = el.value;
          rebuildTimelineLayer();
        });
      });
    }
  }

  function showTimeline() {
    if (!quakes) return;
    clearTimeline();
    activeTimeline = buildTimelineLayer(quakes, timelineMode);
    if (!activeTimeline) return;
    activeTimeline.addTo(map);
    mountTimelineControl();
  }

  function applyMode(mode) {
    if (mode === "static") {
      clearTimeline();
      showStatic();
    } else if (mode === "timeline") {
      clearStatic();
      showTimeline();
    } else { // "off"
      clearTimeline();
      clearStatic();
    }
  }

  // Mount the radio control and default to Static
  const viewControl = new EarthquakeViewControl({
    onChange: (mode) => applyMode(mode),
  });
  viewControl.addTo(map);
  applyMode("static");
})();
