/* live-quakes
 * A modern Leaflet visualization of USGS earthquake data.
 *
 * Data:
 *   - USGS earthquakes (past 30 days, M ≥ 2.5)
 *   - Tectonic plate boundaries (fraxen/tectonicplates)
 *
 * Tiles: Esri Light/Dark Gray + OpenStreetMap (free, no API key, attribution-only).
 */

const API_QUAKES =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_month.geojson";
// USGS FDSN query endpoint, used for "center on date". Max 20,000 events per
// request; a ±15 day window at M≥2.5 is typically ~1–2k.
const API_QUERY =
  "https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minmagnitude=2.5";
const HALF_WINDOW_MS = 15 * 86400000;
const EQ_COLLAPSED_KEY = "live-quakes-eq-collapsed";
const TL_COLLAPSED_KEY = "live-quakes-tl-collapsed";
const LEGEND_COLLAPSED_KEY = "live-quakes-legend-collapsed";
const LEGEND_POS_KEY = "live-quakes-legend-pos";
const API_PLATES =
  "https://raw.githubusercontent.com/fraxen/tectonicplates/master/GeoJSON/PB2002_boundaries.json";

/* ---------- styling helpers ---------- */

// Color ramp by magnitude (low → high).
function magColor(mag) {
  if (mag < 2.5) return "#60a5fa"; // blue
  if (mag < 3.5) return "#818cf8"; // indigo
  if (mag < 4.5) return "#a855f7"; // purple
  if (mag < 5.5) return "#dc2626"; // red
  if (mag < 6.5) return "#ea580c"; // red-orange
  return "#ff9f1c";                // bright orange
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
  // All three basemaps are keyless. (CARTO's public tiles now return an
  // "API KEY REQUIRED" watermark, so we use OSM + Esri instead.)
  const osmAttr =
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
  const esriAttr =
    'Tiles &copy; <a href="https://www.esri.com/">Esri</a> &mdash; Esri, HERE, Garmin, FAO, NOAA, USGS';

  const streets = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: osmAttr,
  });

  const light = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    { maxZoom: 16, attribution: esriAttr }
  );

  const dark = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    { maxZoom: 16, attribution: esriAttr }
  );

  const map = L.map("map-id", {
    center: [20, -40],
    zoom: 2,
    minZoom: 2,
    worldCopyJump: true,
    zoomControl: true,
    layers: [light],
  });

  return { map, baseLayers: { Light: light, Streets: streets, Dark: dark } };
}

/* ---------- legend ---------- */

// The legend is a plain absolutely-positioned div inside the map container
// (not an L.control) so it can be dragged between corners.
function buildLegend(map) {
  const div = L.DomUtil.create("div", "info legend eq-legend", map.getContainer());
  let html = "<h4>Magnitude</h4>";
  for (const bin of MAG_BINS) {
    const d = Math.min(28, magRadius(bin.value) * 2); // diameter, capped so legend stays tidy
    const swatch = `width:${d}px;height:${d}px;background:${magColor(bin.value)}`;
    html += `<div class="row"><span class="swatch" style="${swatch}"></span>${bin.label}</div>`;
  }
  div.innerHTML = html;
  const h = div.querySelector("h4");
  h.insertAdjacentHTML("beforeend",
    '<svg class="eq-chevron" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">' +
    '<path d="M3 5l4 4 4-4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>');
  try { div.classList.toggle("leg-collapsed", localStorage.getItem(LEGEND_COLLAPSED_KEY) === "1"); } catch (_) {}
  L.DomEvent.disableClickPropagation(div);
  L.DomEvent.disableScrollPropagation(div);
  return div;
}

/* Drag-to-corner (ported from World_Coffee_Trade).
 *
 * Corners: br (default), bl, tl. Under 10px of travel snaps back to where it
 * started; otherwise the dot product of the drag vector against the direction
 * to each *other* corner picks the winner, so it's scale-invariant.
 * Position persists in localStorage.
 */
function enableLegendDrag(legend, map) {
  const CLASS = { bl: "leg-bl", tl: "leg-tl" }; // br = base style
  const THRESHOLD = 10, PAD = 12, TOP_OFFSET = 96; // TOP_OFFSET clears zoom control
  const container = map.getContainer();

  const getPos = () =>
    legend.classList.contains("leg-tl") ? "tl" :
    legend.classList.contains("leg-bl") ? "bl" : "br";

  function applyPos(pos) {
    legend.classList.remove("leg-bl", "leg-tl");
    if (CLASS[pos]) legend.classList.add(CLASS[pos]);
    legend.style.left = legend.style.top = legend.style.right = legend.style.bottom = "";
  }

  try {
    const saved = localStorage.getItem(LEGEND_POS_KEY);
    if (saved === "bl" || saved === "tl") applyPos(saved);
  } catch (_) {}

  let downTarget = null, dragging = false, startX = 0, startY = 0, grabX = 0, grabY = 0, origin = "br";

  legend.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    const r = legend.getBoundingClientRect();
    grabX = e.clientX - r.left; grabY = e.clientY - r.top;
    startX = e.clientX; startY = e.clientY;
    origin = getPos();
    downTarget = e.target;
    dragging = true;
    legend.classList.add("leg-dragging");
    legend.setPointerCapture(e.pointerId);
  });

  legend.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const m = container.getBoundingClientRect();
    legend.style.left = (e.clientX - m.left - grabX) + "px";
    legend.style.top = (e.clientY - m.top - grabY) + "px";
    legend.style.right = "auto";
    legend.style.bottom = "auto";
  });

  legend.addEventListener("pointerup", (e) => {
    if (!dragging) return;
    dragging = false;
    legend.classList.remove("leg-dragging");
    if (Math.hypot(e.clientX - startX, e.clientY - startY) < THRESHOLD) {
      applyPos(origin);
      // A tap on the title collapses / expands the legend.
      if (downTarget && downTarget.closest && downTarget.closest("h4")) {
        const c = legend.classList.toggle("leg-collapsed");
        try { localStorage.setItem(LEGEND_COLLAPSED_KEY, c ? "1" : "0"); } catch (_) {}
      }
      return;
    }
    const m = container.getBoundingClientRect();
    const lw = legend.offsetWidth, lh = legend.offsetHeight;
    const bottomOff = 30;
    const anchors = {
      br: [m.width - PAD - lw / 2, m.height - bottomOff - lh / 2],
      bl: [PAD + lw / 2,           m.height - bottomOff - lh / 2],
      tl: [PAD + lw / 2,           TOP_OFFSET + lh / 2],
    };
    const dx = e.clientX - startX, dy = e.clientY - startY;
    const [ox, oy] = anchors[origin];
    let winner = origin, best = -Infinity;
    for (const [pos, [ax, ay]] of Object.entries(anchors)) {
      if (pos === origin) continue;
      const score = dx * (ax - ox) + dy * (ay - oy);
      if (score > best) { best = score; winner = pos; }
    }
    applyPos(winner);
    try { localStorage.setItem(LEGEND_POS_KEY, winner); } catch (_) {}
  });

  legend.addEventListener("pointercancel", () => {
    if (!dragging) return;
    dragging = false;
    legend.classList.remove("leg-dragging");
    applyPos(origin);
  });
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
      <div class="eq-head" role="button" tabindex="0" aria-expanded="true" title="Collapse / expand">
        <h4>Earthquake view</h4>
        <svg class="eq-chevron" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M3 5l4 4 4-4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div class="eq-body">
      <label><input type="radio" name="eq-view" value="static" checked /> Static · all 30 days</label>
      <label><input type="radio" name="eq-view" value="timeline" /> Timeline</label>
      <label><input type="radio" name="eq-view" value="off" /> Off</label>
      <div class="eq-date">
        <div class="eq-date-title">Center on date <span class="hint">(±15 days, UTC)</span></div>
        <div class="eq-date-row">
          <input type="date" class="eq-date-input" min="1900-01-01" />
          <button type="button" class="eq-date-go">Go</button>
          <button type="button" class="eq-date-live" title="Back to the last 30 days">Live</button>
        </div>
        <div class="eq-date-status" aria-live="polite"></div>
      </div>
      </div>
    `;
    this._div = div;

    // Collapse to just the title bar (the timeline slider stays visible).
    const head = div.querySelector(".eq-head");
    const toggle = () => this.setCollapsed(!this._collapsed);
    L.DomEvent.on(head, "click", toggle);
    L.DomEvent.on(head, "keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
    });
    let saved = false;
    try { saved = localStorage.getItem(EQ_COLLAPSED_KEY) === "1"; } catch (_) {}
    this.setCollapsed(saved, true);
    const input = div.querySelector(".eq-date-input");
    input.max = new Date().toISOString().slice(0, 10);
    this._dateInput = input;
    this._status = div.querySelector(".eq-date-status");
    const go = () => {
      if (!input.value) { this.setStatus("Pick a date first."); return; }
      this.options.onDate && this.options.onDate(input.value);
    };
    L.DomEvent.on(div.querySelector(".eq-date-go"), "click", go);
    L.DomEvent.on(input, "keydown", (e) => { if (e.key === "Enter") go(); });
    L.DomEvent.on(div.querySelector(".eq-date-live"), "click", () => {
      input.value = "";
      this.options.onDate && this.options.onDate(null);
    });
    div.querySelectorAll('input[name="eq-view"]').forEach((el) => {
      L.DomEvent.on(el, "change", () => this.setMode(el.value));
    });
    return div;
  },
  isCollapsed() { return !!this._collapsed; },
  setCollapsed(c, silent) {
    this._collapsed = c;
    if (this._div) {
      this._div.classList.toggle("eq-collapsed", c);
      this._div.querySelector(".eq-head").setAttribute("aria-expanded", String(!c));
    }
    if (!silent) {
      try { localStorage.setItem(EQ_COLLAPSED_KEY, c ? "1" : "0"); } catch (_) {}
    }
    this.options.onCollapse && this.options.onCollapse(c);
  },
  setStatus(msg) { if (this._status) this._status.textContent = msg || ""; },
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
  const legendEl = buildLegend(map);
  enableLegendDrag(legendEl, map);


  // Switching basemaps must never move the view. Remember the last settled
  // view and restore it if a layer swap disturbs it.
  let lastView = { center: map.getCenter(), zoom: map.getZoom() };
  map.on("moveend", () => { lastView = { center: map.getCenter(), zoom: map.getZoom() }; });
  map.on("baselayerchange", () => {
    if (map.getZoom() !== lastView.zoom || !map.getCenter().equals(lastView.center, 1e-6)) {
      map.setView(lastView.center, lastView.zoom, { animate: false });
    }
  });

  let quakes = null;
  let quakeLayer = null;
  let activeTimeline = null;
  let timelineControl = null;
  let timelineModeUi = null;       // DOM container injected into the slider control
  let timelineMode = "window";     // "window" | "cumulative"
  let timelineCollapsed = false;
  try { timelineCollapsed = localStorage.getItem(TL_COLLAPSED_KEY) === "1"; } catch (_) {}

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

  // Make the plugin's "Controls to Run Timeline" box collapsible to its title.
  function decorateTimelineControl() {
    const root = timelineControl && timelineControl.getContainer
      ? timelineControl.getContainer() : null;
    const h = root && root.querySelector("h4");
    if (!h) return;
    h.classList.add("tl-head");
    h.setAttribute("role", "button");
    h.setAttribute("tabindex", "0");
    h.insertAdjacentHTML("beforeend",
      '<svg class="eq-chevron" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">' +
      '<path d="M3 5l4 4 4-4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>');
    const apply = () => {
      root.classList.toggle("tl-collapsed", timelineCollapsed);
      h.setAttribute("aria-expanded", String(!timelineCollapsed));
    };
    const toggle = () => {
      timelineCollapsed = !timelineCollapsed;
      try { localStorage.setItem(TL_COLLAPSED_KEY, timelineCollapsed ? "1" : "0"); } catch (_) {}
      apply();
    };
    L.DomEvent.on(h, "click", toggle);
    L.DomEvent.on(h, "keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
    });
    apply();
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
    decorateTimelineControl();
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
  let loadToken = 0; // guards against out-of-order responses
  async function loadForDate(dateStr) {
    const token = ++loadToken;
    const subtitle = document.querySelector(".site-header .subtitle");
    let url = API_QUAKES;
    let label = "last 30 days · M ≥ 2.5 · USGS";
    if (dateStr) {
      const center = Date.parse(dateStr + "T12:00:00Z");
      if (isNaN(center)) { viewControl.setStatus("Invalid date."); return; }
      const start = new Date(center - HALF_WINDOW_MS).toISOString().slice(0, 10);
      const end = new Date(center + HALF_WINDOW_MS).toISOString().slice(0, 10);
      url = `${API_QUERY}&starttime=${start}&endtime=${end}&orderby=time-asc`;
      label = `${start} → ${end} · M ≥ 2.5 · USGS`;
    }
    viewControl.setStatus("Loading…");
    try {
      const data = await loadJSON(url);
      if (token !== loadToken) return; // a newer request superseded this one
      quakes = data;
      if (!quakeLayer) quakeLayer = buildQuakeLayer(quakes);
      applyMode(viewControl.getMode());
      if (subtitle) subtitle.textContent = label;
      const n = quakes.features.length;
      viewControl.setStatus(`${n} quake${n === 1 ? "" : "s"} loaded.`);
    } catch (err) {
      if (token !== loadToken) return;
      console.error("Failed to load quakes:", err);
      viewControl.setStatus("Could not load data for that date.");
    }
  }

  const viewControl = new EarthquakeViewControl({
    onChange: (mode) => applyMode(mode),
    onDate: (d) => loadForDate(d),
  });
  viewControl.addTo(map);
  applyMode("static");
})();
