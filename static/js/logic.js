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

function buildTimelineLayer(geojson) {
  if (typeof L.Timeline !== "function") return null;

  return new L.Timeline(geojson, {
    getInterval: (q) => ({
      start: q.properties.time,
      end: q.properties.time + 86400000, // visible for 24 h after the event
    }),
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

  // Earthquakes
  let quakeLayer = null;
  let timelineLayer = null;
  try {
    const quakes = await loadJSON(API_QUAKES);
    quakeLayer = buildQuakeLayer(quakes).addTo(map);
    timelineLayer = buildTimelineLayer(quakes);
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
  if (timelineLayer) overlays["Timeline scrubber"] = timelineLayer;

  L.control.layers(baseLayers, overlays, { collapsed: false, position: "topright" }).addTo(map);

  // Timeline scrubber control: only present while the timeline overlay is on.
  let timelineControl = null;
  if (timelineLayer && typeof L.timelineSliderControl === "function") {
    map.on("overlayadd", (e) => {
      if (e.layer !== timelineLayer) return;
      timelineControl = L.timelineSliderControl({
        formatOutput: (date) => new Date(date).toUTCString().replace(/^\w+, /, ""),
      });
      timelineControl.addTo(map);
      timelineControl.addTimelines(timelineLayer);
    });
    map.on("overlayremove", (e) => {
      if (e.layer !== timelineLayer || !timelineControl) return;
      timelineControl.remove();
      timelineControl = null;
    });
  }
})();
