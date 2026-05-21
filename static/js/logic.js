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

(async function init() {
  const { map, baseLayers } = buildMap();
  buildLegend().addTo(map);

  // Earthquakes — keep raw GeoJSON around so we can rebuild the timeline
  // layer (and refill the static layer) on demand.
  let quakes = null;
  let quakeLayer = null;
  // Placeholder timeline layer for the layer-control checkbox. The *real*
  // timeline layer is built when the user actually toggles it on, so we can
  // pick window vs cumulative mode based on whether the static layer is also
  // visible at that moment.
  let timelinePlaceholder = null;
  let activeTimeline = null;
  try {
    quakes = await loadJSON(API_QUAKES);
    quakeLayer = buildQuakeLayer(quakes).addTo(map);
    if (typeof L.Timeline === "function") {
      timelinePlaceholder = L.layerGroup(); // empty, just for the checkbox
    }
  } catch (err) {
    console.error("Failed to load USGS quakes:", err);
  }

  // Tectonic plates
  let platesLayer = null;
  try {
    const plates = await loadJSON(API_PLATES);
    platesLayer = buildPlatesLayer(plates);
  } catch (err) {
    console.error("Failed to load tectonic plates:", err);
  }

  // Overlays
  const overlays = {};
  if (quakeLayer) overlays["Earthquakes (last 30 days)"] = quakeLayer;
  if (platesLayer) overlays["Tectonic plate boundaries"] = platesLayer;
  if (timelinePlaceholder) overlays["Timeline scrubber"] = timelinePlaceholder;

  L.control.layers(baseLayers, overlays, {
    collapsed: false,
    position: "topright",
  }).addTo(map);

  // ----- Timeline behavior -----
  //
  // Both "Earthquakes" AND "Timeline scrubber" checked
  //   → cumulative mode: clear the static dots, then re-fill them in real
  //     event-time order as the scrubber plays. They stay on screen after
  //     appearing, so by the end of playback you see the full month again.
  //
  // Only "Timeline scrubber" checked
  //   → window mode: each quake is visible for a 24h sliding window. Reads
  //     as a wave of activity sweeping through the month.
  //
  // Toggling the timeline OFF restores whatever state the static layer was
  // in (refills it if needed) and removes the scrubber control.

  let timelineControl = null;

  function showTimeline() {
    if (!quakes) return;
    const staticOn = quakeLayer && map.hasLayer(quakeLayer);
    const mode = staticOn ? "cumulative" : "window";

    // If static is on, empty it so the timeline can repopulate it visually.
    // We keep the layer on the map (so the checkbox stays checked) but with
    // no features in it.
    if (staticOn) quakeLayer.clearLayers();

    activeTimeline = buildTimelineLayer(quakes, mode);
    activeTimeline.addTo(map);

    if (typeof L.timelineSliderControl === "function") {
      timelineControl = L.timelineSliderControl({
        duration: 30000, // ~30s to play the full month
        formatOutput: (date) =>
          new Date(date).toUTCString().replace(/^\w+, /, ""),
      });
      timelineControl.addTo(map);
      timelineControl.addTimelines(activeTimeline);
    }
  }

  function hideTimeline() {
    if (activeTimeline) {
      map.removeLayer(activeTimeline);
      activeTimeline = null;
    }
    if (timelineControl) {
      timelineControl.remove();
      timelineControl = null;
    }
    // Refill the static layer if it's still checked (so the user gets the
    // full 30 days back instead of an empty-but-checked overlay).
    if (quakeLayer && map.hasLayer(quakeLayer) && quakes) {
      quakeLayer.clearLayers();
      quakeLayer.addData(quakes);
    }
  }

  if (timelinePlaceholder) {
    map.on("overlayadd", (e) => {
      if (e.layer === timelinePlaceholder) showTimeline();
    });
    map.on("overlayremove", (e) => {
      if (e.layer === timelinePlaceholder) hideTimeline();
    });
  }
})();
