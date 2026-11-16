/* FireLine Field — offline-first wildland fire field app.
 * Map + NIFC public layers, NIFS-style data collection, structure triage,
 * GPS tracking, measure tool, offline tiles, GeoJSON export/import.
 */
(() => {
'use strict';

// Custom line icons (stroke = currentColor) so the UI is ours, not emoji.
const svg = (d) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON = {
  maps: svg('<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>'),
  mark: svg('<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>'),
  nav: svg('<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2.2 4.8-4.8 2.2 2.2-4.8z"/>'),
  triage: svg('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>'),
  data: svg('<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>'),
  intel: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="7.5"/>'),
  copy: svg('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>'),
  night: svg('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'),
  note: svg('<path d="M4 4h16v12H8l-4 4z"/><path d="M8 9h8M8 12h5"/>'),
  wx: svg('<path d="M7 18a4 4 0 1 1 .9-7.9A6 6 0 0 1 19 12a3 3 0 0 1-1 5.9z"/>'),
  pdf: svg('<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6"/><path d="M9 14h6M9 17h4"/>'),
};

// ---------------------------------------------------------------- config
// Categories modeled on the National Incident Feature Service (NIFS) event layers.
const POINT_CATS = [
  { id: 'Drop Point',      color: '#2f8cff', code: 'DP' },
  { id: 'Safety Zone',     color: '#3fbf6f', code: 'SZ' },
  { id: 'Escape Route Entry', color: '#7ee08f', code: 'ER' },
  { id: 'Helispot',        color: '#9b6bff', code: 'H' },
  { id: 'Water Source',    color: '#1ec8e6', code: 'W' },
  { id: 'Hazard',          color: '#ffb020', code: '!' },
  { id: 'Point of Origin', color: '#e5484d', code: 'PO' },
  { id: 'Spot Fire',       color: '#ff3b1a', code: 'SF' },
  { id: 'ICP',             color: '#ffd23f', code: 'ICP' },
  { id: 'Staging Area',    color: '#c9a27a', code: 'S' },
  { id: 'Medical / EMS',   color: '#ff5fa2', code: '+' },
  { id: 'Lookout',         color: '#f5ece4', code: 'LO' },
];
const LINE_CATS = [
  { id: 'Uncontrolled Fire Edge', color: '#ff2a1a', weight: 4 },
  { id: 'Completed Dozer Line',   color: '#111111', weight: 4, outline: '#ffd23f' },
  { id: 'Completed Hand Line',    color: '#111111', weight: 3, dash: '8 4', outline: '#ffd23f' },
  { id: 'Proposed Dozer Line',    color: '#ffd23f', weight: 3, dash: '10 6' },
  { id: 'Proposed Hand Line',     color: '#ffd23f', weight: 2, dash: '4 6' },
  { id: 'Road as Completed Line', color: '#8a8a8a', weight: 4 },
  { id: 'Wet Line / Hose Lay',    color: '#1ec8e6', weight: 3, dash: '2 5' },
  { id: 'Escape Route',           color: '#3fbf6f', weight: 3, dash: '12 4 2 4' },
  { id: 'Contained Line',         color: '#111111', weight: 5, outline: '#3fbf6f' },
];
const POLY_CATS = [
  { id: 'Wildfire Daily Fire Perimeter', color: '#ff2a1a', fill: 0.12 },
  { id: 'Intense Heat',            color: '#ff3b1a', fill: 0.45 },
  { id: 'Scattered Heat',          color: '#ff9a1a', fill: 0.3 },
  { id: 'Safety Zone (area)',      color: '#3fbf6f', fill: 0.25 },
  { id: 'Division Break / Area',   color: '#ffd23f', fill: 0.05 },
  { id: 'Structure Protection Group', color: '#2f8cff', fill: 0.1 },
  { id: 'Suppression Repair Area', color: '#c9a27a', fill: 0.2 },
];
// NWCG structure triage categories.
const TRIAGE_CATS = [
  { id: 'Defensible – Prep and Leave',     color: '#3fbf6f', code: 'PL',
    hint: 'Good defensible space; crews can prep and move on.' },
  { id: 'Defensible – Stand Alone',        color: '#2f8cff', code: 'SA',
    hint: 'Unlikely to need protection during fire front passage.' },
  { id: 'Non-Defensible – Prep and Defend', color: '#ffb020', code: 'PD',
    hint: 'Can be defended only with significant prep & resources.' },
  { id: 'Non-Defensible – Rescue Drill',    color: '#e5484d', code: 'RD',
    hint: 'Not safely defendable; only life-safety actions.' },
];
const TRIAGE_STATUS = ['Not Threatened', 'Threatened', 'Damaged', 'Destroyed', 'Not Assessed'];

// Public NIFC / Esri ArcGIS REST services (no login needed).
const SVC = {
  wwa: 'https://mapservices.weather.noaa.gov/eventdriven/rest/services/WWA/watch_warn_adv/MapServer/1/query',
  incidents: 'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Incident_Locations_Current/FeatureServer/0/query',
  perimeters: 'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters_Current/FeatureServer/0/query',
  viirs: 'https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/Satellite_VIIRS_Thermal_Hotspots_and_Fire_Activity/FeatureServer/0/query',
};

const esriTile = (svc, opts = {}) => L.tileLayer(`https://server.arcgisonline.com/ArcGIS/rest/services/${svc}/MapServer/tile/{z}/{y}/{x}`,
  { maxZoom: 19, maxNativeZoom: 19, attribution: 'Tiles © Esri', ...opts });
const usgsTile = (svc, opts = {}) => L.tileLayer(`https://basemap.nationalmap.gov/arcgis/rest/services/${svc}/MapServer/tile/{z}/{y}/{x}`,
  { maxZoom: 19, maxNativeZoom: 16, attribution: 'USGS The National Map', offlineOK: true, ...opts });
// offlineOK: public-domain sources whose terms allow downloading areas for offline use.
const BASEMAPS = {
  'USGS Topo': usgsTile('USGSTopo'),
  'Satellite + roads & labels': L.layerGroup([
    esriTile('World_Imagery', { attribution: 'Tiles © Esri, Maxar, Earthstar Geographics' }),
    esriTile('Reference/World_Transportation', { opacity: 0.9 }),
    esriTile('Reference/World_Boundaries_and_Places'),
  ]),
  'Satellite (clean)': esriTile('World_Imagery', { attribution: 'Tiles © Esri, Maxar, Earthstar Geographics' }),
  'USGS Shaded relief + hydro': L.layerGroup([usgsTile('USGSShadedReliefOnly'), usgsTile('USGSHydroCached', { opacity: 0.9 })]),
  'Esri Topo': esriTile('World_Topo_Map'),
  'OpenTopoMap': L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    { maxZoom: 17, attribution: '© OpenStreetMap contributors, SRTM | © OpenTopoMap (CC-BY-SA)' }),
  'Streets (OSM)': L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    { maxZoom: 19, attribution: '© OpenStreetMap contributors' }),
};
const baseTiles = (name) => { const l = BASEMAPS[name]; return l instanceof L.TileLayer ? [l] : l.getLayers(); };

// ---------------------------------------------------------------- state
const S = {
  basemap: 'USGS Topo',
  layersOn: { redflag: true, incidents: true, perimeters: true, viirs: false, mine: true, triage: true, track: true },
  rfwData: null,
  notes: [],              // incident notes & photos
  features: [],           // my collected features (incl. triage)
  track: null,            // { id, points:[[lat,lng,t]] }
  tracking: false,
  watchId: null,
  me: null,               // last GPS fix {lat,lng,acc}
  draw: null,             // active drawing session
  incidentsData: null,
  nav: null,              // active navigation target {lat,lng,name,elevFt}
  maps: [],               // imported GeoPDF maps (metadata)
  meGroundFt: null,
};

// ---------------------------------------------------------------- map
const FLAME = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 2c1.2 4 6 6.4 6 11.6a6 6 0 0 1-12 0c0-3 1.8-4.8 3-6.6 0 2 .9 3.3 2.1 3.9C10.3 7 11.2 4.4 12 2z" fill="#ff3b30" stroke="#160403" stroke-width="1.2"/><path d="M12 12.5c.8 2 2.6 3.1 2.6 5.2a2.6 2.6 0 0 1-5.2 0c0-1.5 1.1-2.3 1.5-3.4.4 1.2.8 1.5 1.1 1.5z" fill="#ffd0c8"/></svg>';
const fireIcon = L.divIcon({ className: 'fire-pin', html: FLAME, iconSize: [22, 22], iconAnchor: [11, 18] });
const map = L.map('map', { zoomControl: true, attributionControl: true }).setView([39.5, -111.5], 5);
map.createPane('geopdf').style.zIndex = 250; // above basemap tiles, below fire layers & markup
BASEMAPS[S.basemap].addTo(map);
L.control.scale({ imperial: true, metric: true }).addTo(map);

const G = {
  perimeters: L.geoJSON(null, { style: () => ({ color: '#ff2a1a', weight: 2, fillColor: '#ff2a1a', fillOpacity: 0.15 }),
    onEachFeature: (f, l) => l.bindPopup(() => nifcPopup(f.properties, 'perimeter')) }),
  redflag: L.geoJSON(null, {
    style: (f) => { const c = RFW_COLORS[f.properties.prod_type] || '#ff1493'; return { color: c, weight: 2, fillColor: c, fillOpacity: 0.18, dashArray: f.properties.prod_type === 'Red Flag Warning' ? null : '6 4' }; },
    onEachFeature: (f, l) => l.bindPopup(() => wwaPopup(f.properties)) }),
  incidents: L.geoJSON(null, {
    pointToLayer: (f, ll) => L.marker(ll, { icon: incidentIcon(f.properties) }),
    onEachFeature: (f, l) => l.bindPopup(() => { const [lng, lat] = f.geometry.coordinates; const n = noteCount(incKey(f.properties));
      return nifcPopup(f.properties, 'incident') + `<div class="btns">
        <button class="btn primary" data-inc-notes="${esc(incKey(f.properties))}">${ICON.note} Notes & photos${n ? ` (${n})` : ''}</button>
        ${ptButtons(lat, lng, f.properties.IncidentName || 'Incident')}</div>`; }) }),
  viirs: L.geoJSON(null, {
    pointToLayer: (f, ll) => L.circleMarker(ll, { radius: 4, color: '#ffd23f', weight: 1, fillColor: '#ff3b1a', fillOpacity: 0.9 }),
    onEachFeature: (f, l) => l.bindPopup(() => nifcPopup(f.properties, 'viirs')) }),
  mine: L.layerGroup(),
  triage: L.layerGroup(),
  track: L.layerGroup(),
  draw: L.layerGroup().addTo(map),
  nav: L.layerGroup().addTo(map),
  maps: {},               // id -> GeoPDF layer
  me: L.layerGroup().addTo(map),
};
// stacking order: perimeters under everything
['redflag', 'perimeters', 'viirs', 'incidents', 'track', 'mine', 'triage'].forEach((k) => S.layersOn[k] && G[k].addTo(map));

// ---------------------------------------------------------------- helpers
const $ = (s, r = document) => r.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const fmtDate = (t) => (t ? new Date(t).toLocaleString() : '');
// Give up on slow networks ("lie-fi") instead of hanging; callers fall back to saved data.
const timeoutSignal = (ms) => { if (AbortSignal.timeout) return AbortSignal.timeout(ms); const c = new AbortController(); setTimeout(() => c.abort(), ms); return c.signal; };

let toastT;
function toast(msg, ms = 2500) {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), ms);
}

// Degrees decimal minutes — the format used on most fire maps and radios.
function ddm(lat, lng) {
  const f = (v, p, n) => { const a = Math.abs(v), d = Math.floor(a), m = (a - d) * 60;
    return `${d}°${m.toFixed(3).padStart(6, '0')}'${v >= 0 ? p : n}`; };
  return `${f(lat, 'N', 'S')} ${f(lng, 'E', 'W')}`;
}

// Geodesy
const R = 6371008.8;
const rad = (d) => (d * Math.PI) / 180;
function dist(a, b) {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function pathLen(pts) { let s = 0; for (let i = 1; i < pts.length; i++) s += dist(pts[i - 1], pts[i]); return s; }
function area(pts) { // spherical polygon area, m²
  if (pts.length < 3) return 0;
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const p1 = pts[i], p2 = pts[(i + 1) % pts.length];
    s += rad(p2.lng - p1.lng) * (2 + Math.sin(rad(p1.lat)) + Math.sin(rad(p2.lat)));
  }
  return Math.abs((s * R * R) / 2);
}
function fmtLen(m) {
  const ft = m * 3.28084, ch = m / 20.1168, mi = m / 1609.344;
  return `<b>${ch.toFixed(1)}</b> ch · ${ft < 5280 ? ft.toFixed(0) + ' ft' : mi.toFixed(2) + ' mi'} · ${m < 1000 ? m.toFixed(0) + ' m' : (m / 1000).toFixed(2) + ' km'}`;
}
function fmtArea(m2) { return `<b>${(m2 / 4046.8564).toFixed(1)}</b> ac · ${(m2 / 10000).toFixed(2)} ha`; }

// ---------------------------------------------------------------- NIFC layers
function pick(p, keys) { for (const k of keys) if (p[k] !== undefined && p[k] !== null && p[k] !== '') return p[k]; return ''; }

function nifcPopup(p, kind) {
  const rows = [];
  const add = (label, v) => { if (v !== '' && v !== null && v !== undefined) rows.push(`<tr><td>${esc(label)}</td><td>${esc(v)}</td></tr>`); };
  let title = 'Feature';
  if (kind === 'incident') {
    title = pick(p, ['IncidentName']) || 'Incident';
    add('Type', pick(p, ['IncidentTypeCategory']));
    add('Size (ac)', pick(p, ['IncidentSize', 'DailyAcres']));
    add('Contained', p.PercentContained != null ? p.PercentContained + '%' : '');
    add('Discovered', fmtDate(p.FireDiscoveryDateTime));
    add('Cause', pick(p, ['FireCause']));
    add('State', pick(p, ['POOState']));
    add('Unit', pick(p, ['POODispatchCenterID', 'POOLandownerKind']));
    add('IRWIN ID', pick(p, ['IrwinID']));
    add('Updated', fmtDate(p.ModifiedOnDateTime_dt || p.ModifiedOnDateTime));
  } else if (kind === 'perimeter') {
    title = pick(p, ['poly_IncidentName', 'attr_IncidentName', 'IncidentName']) || 'Fire perimeter';
    add('GIS acres', Number(pick(p, ['poly_GISAcres', 'GISAcres']) || 0).toFixed(1));
    add('Contained', pick(p, ['attr_PercentContained']) !== '' ? p.attr_PercentContained + '%' : '');
    add('Method', pick(p, ['poly_MapMethod', 'MapMethod']));
    add('Perimeter date', fmtDate(pick(p, ['poly_PolygonDateTime', 'poly_DateCurrent'])));
  } else {
    title = 'VIIRS hotspot';
    add('Detected', p.esritimeutc ? fmtDate(p.esritimeutc) : pick(p, ['acq_date']));
    add('Day/Night', p.daynight === 'D' ? 'Day' : p.daynight === 'N' ? 'Night' : '');
    add('Hours old', pick(p, ['hours_old']));
    add('FRP (MW)', pick(p, ['frp']));
    add('Confidence', pick(p, ['confidence']));
    add('Satellite', pick(p, ['satellite']));
  }
  return `<h4>${esc(title)}</h4><table>${rows.join('')}</table>`;
}

function envParams(extra = {}) {
  const b = map.getBounds();
  return new URLSearchParams({
    where: '1=1', outFields: '*', f: 'geojson', outSR: '4326', inSR: '4326',
    geometryType: 'esriGeometryEnvelope', spatialRel: 'esriSpatialRelIntersects',
    geometry: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map((n) => n.toFixed(4)).join(','),
    resultRecordCount: '2000', ...extra,
  });
}

async function fetchLayer(key, url, params) {
  try {
    const r = await fetch(`${url}?${params}`, { signal: timeoutSignal(15000) });
    if (!r.ok) throw new Error(r.status);
    const gj = await r.json();
    if (gj.error) throw new Error(gj.error.message);
    DB.put('kv', gj, 'layer:' + key).catch(() => {});
    return gj;
  } catch (e) {
    const cached = await DB.get('kv', 'layer:' + key).catch(() => null);
    if (cached) { toast(`${key}: offline — showing last downloaded copy`); return cached; }
    toast(`Couldn't load ${key} (${e.message})`);
    return null;
  }
}

let loadTimer;
function refreshNifc() {
  clearTimeout(loadTimer);
  loadTimer = setTimeout(async () => {
    const z = map.getZoom();
    if (S.layersOn.redflag && (!S.rfwAt || Date.now() - S.rfwAt > 600000)) { S.rfwAt = Date.now(); refreshRedFlags(); }
    if (S.layersOn.incidents) {
      // Fire-only, nationwide is small enough; refresh at most every 5 min.
      if (!S.incidentsData || Date.now() - S.incidentsData.t > 300000) {
        const gj = await fetchLayer('incidents', SVC.incidents, new URLSearchParams({
          where: "IncidentTypeCategory IN ('WF','RX')", outFields: '*', f: 'geojson', outSR: '4326', resultRecordCount: '5000' }));
        if (gj) { S.incidentsData = { t: Date.now(), gj }; G.incidents.clearLayers().addData(gj); }
      }
    }
    if (S.layersOn.perimeters) {
      const tol = (360 / (256 * 2 ** z)) * 1.5; // ~1.5 px simplification
      const gj = await fetchLayer('perimeters', SVC.perimeters, envParams({ maxAllowableOffset: tol.toFixed(6) }));
      if (gj) G.perimeters.clearLayers().addData(gj);
    }
    if (S.layersOn.viirs) {
      if (z < 6) { G.viirs.clearLayers(); }
      else {
        const gj = await fetchLayer('viirs', SVC.viirs, envParams({ where: 'hours_old <= 48' }));
        if (gj) G.viirs.clearLayers().addData(gj);
      }
    }
  }, 400);
}
map.on('moveend', refreshNifc);

// ---------------------------------------------------------------- my data rendering
function catOf(f) {
  if (f.kind === 'point') return POINT_CATS.find((c) => c.id === f.category) || POINT_CATS[0];
  if (f.kind === 'line') return LINE_CATS.find((c) => c.id === f.category) || LINE_CATS[0];
  if (f.kind === 'polygon') return POLY_CATS.find((c) => c.id === f.category) || POLY_CATS[0];
  return TRIAGE_CATS.find((c) => c.id === f.category) || TRIAGE_CATS[0];
}
function symIcon(color, code, size = 26) {
  return L.divIcon({ className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2],
    html: `<div class="sym" style="width:${size}px;height:${size}px;background:${color};font-size:${code.length > 2 ? 9 : 11}px">${esc(code)}</div>` });
}
function toLL(coords) { return coords.map(([lng, lat]) => L.latLng(lat, lng)); }

function featurePopup(f) {
  const p = f.props || {};
  const rows = [];
  const add = (k, v) => v && rows.push(`<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`);
  if (f.kind === 'triage') {
    add('Address', p.address); add('Status', p.status); add('Structure', p.structureType);
    add('Roof', p.roof); add('Defensible space', p.space); add('Access', p.access);
    add('Water', p.water); add('Hazards', (p.hazards || []).join(', ')); add('Residents', p.residents);
  }
  if (f.kind === 'line') add('Length', pathLen(toLL(f.geometry.coordinates)).toFixed(0) + ' m / ' + (pathLen(toLL(f.geometry.coordinates)) / 20.1168).toFixed(1) + ' ch');
  if (f.kind === 'polygon') add('Area', (area(toLL(f.geometry.coordinates[0])) / 4046.8564).toFixed(1) + ' ac');
  add('Label', p.label); add('Notes', p.notes); add('Collected', fmtDate(p.createdAt)); add('By', p.by);
  let ptBtns = '';
  if (f.kind === 'point' || f.kind === 'triage') {
    const [lng, lat] = f.geometry.coordinates;
    add('Location', ddm(lat, lng));
    add('Elevation', p.elevFt != null ? `${Math.round(p.elevFt).toLocaleString()} ft` : navigator.onLine ? 'looking up…' : 'pending (offline)');
    ptBtns = ptButtons(lat, lng, p.label || p.address || f.category, p.elevFt);
  }
  const photo = p.photo ? `<img src="${p.photo}" style="max-width:220px;border-radius:6px;margin-top:6px">` : '';
  return `<h4>${esc(f.category)}</h4><table>${rows.join('')}</table>${photo}
    <div class="btns">${ptBtns}<button class="btn" data-edit="${f.id}">Edit</button><button class="btn danger" data-del="${f.id}">Delete</button></div>`;
}

function renderMine() {
  G.mine.clearLayers(); G.triage.clearLayers();
  for (const f of S.features) {
    const c = catOf(f);
    let lyr;
    if (f.kind === 'point' || f.kind === 'triage') {
      const [lng, lat] = f.geometry.coordinates;
      lyr = L.marker([lat, lng], { icon: symIcon(c.color, c.code, f.kind === 'triage' ? 24 : 26) });
    } else if (f.kind === 'line') {
      const ll = toLL(f.geometry.coordinates);
      if (c.outline) L.polyline(ll, { color: c.outline, weight: c.weight + 3, opacity: 0.8, interactive: false }).addTo(G.mine);
      lyr = L.polyline(ll, { color: c.color, weight: c.weight, dashArray: c.dash });
    } else {
      lyr = L.polygon(toLL(f.geometry.coordinates[0]), { color: c.color, weight: 2, fillColor: c.color, fillOpacity: c.fill });
    }
    lyr.bindPopup(() => featurePopup(f));
    lyr.addTo(f.kind === 'triage' ? G.triage : G.mine);
  }
}

document.addEventListener('click', async (e) => {
  const del = e.target.closest('[data-del]'); const ed = e.target.closest('[data-edit]');
  const nav = e.target.closest('[data-nav]'); const cp = e.target.closest('[data-copy]');
  const wx = e.target.closest('[data-wx]'); const inc = e.target.closest('[data-inc-notes]');
  if (wx) {
    const [lat, lng] = wx.dataset.wx.split(',').map(Number); map.closePopup(); showWeather(lat, lng, wx.dataset.name);
  } else if (inc) {
    openIncidentNotes(inc.dataset.incNotes);
  } else if (nav) {
    const [lat, lng] = nav.dataset.nav.split(',').map(Number);
    map.closePopup(); startNav({ lat, lng, name: nav.dataset.name || 'Waypoint', elevFt: nav.dataset.elev ? +nav.dataset.elev : null });
  } else if (cp) {
    const [lat, lng] = cp.dataset.copy.split(',').map(Number);
    copyText(`${ddm(lat, lng)}  (${lat.toFixed(5)}, ${lng.toFixed(5)})`);
  } else if (del) {
    if (!confirm('Delete this feature?')) return;
    const gone = S.features.find((f) => f.id === del.dataset.del); if (gone) unsyncFeature(gone);
    await DB.del('features', del.dataset.del);
    S.features = S.features.filter((f) => f.id !== del.dataset.del);
    map.closePopup(); renderMine(); toast('Deleted');
  } else if (ed) {
    const f = S.features.find((x) => x.id === ed.dataset.edit);
    map.closePopup();
    if (f) (f.kind === 'triage' ? openTriageForm(f) : openFeatureForm(f));
  }
});

async function saveFeature(f) {
  await DB.put('features', f);
  const i = S.features.findIndex((x) => x.id === f.id);
  if (i >= 0) S.features[i] = f; else S.features.push(f);
  renderMine();
  syncFeature(f);
  if ((f.kind === 'point' || f.kind === 'triage') && f.props.elevFt == null) fillElevation(f);
}

// ---------------------------------------------------------------- elevation (USGS 3DEP, public domain)
const elevCache = new Map();
async function getElevationFt(lat, lng) {
  const key = lat.toFixed(5) + ',' + lng.toFixed(5);
  if (elevCache.has(key)) return elevCache.get(key);
  try {
    const r = await fetch(`https://epqs.nationalmap.gov/v1/json?x=${lng.toFixed(6)}&y=${lat.toFixed(6)}&units=Feet&wkid=4326&includeDate=false`, { signal: timeoutSignal(25000) });
    const j = await r.json(); const v = parseFloat(j.value);
    if (!isFinite(v) || v < -1000) return null; // outside US coverage returns a no-data value
    elevCache.set(key, v); return v;
  } catch { return null; }
}
async function fillElevation(f) {
  const [lng, lat] = f.geometry.coordinates;
  const v = await getElevationFt(lat, lng);
  if (v == null) return;
  f.props.elevFt = v; f.props.elevSrc = 'USGS 3DEP';
  await DB.put('features', f);
  if (f.room) syncFeature(f);
}
// Points dropped with no signal get their elevation once coverage returns. Phones don't always
// announce "back online" reliably, so this also retries every 2 minutes while anything is pending.
let backfilling = false;
async function backfillElevations() {
  if (backfilling) return; backfilling = true;
  try {
    for (const f of S.features) {
      if ((f.kind === 'point' || f.kind === 'triage') && f.props.elevFt == null) {
        await fillElevation(f);
        if (f.props.elevFt == null) break; // still no signal; try again later
      }
    }
  } finally { backfilling = false; }
}
setInterval(backfillElevations, 120000);
function ptButtons(lat, lng, name, elevFt) {
  return `<button class="btn" data-nav="${lat},${lng}" data-name="${esc(name)}" data-elev="${elevFt ?? ''}">${ICON.nav} Navigate</button>
    <button class="btn" data-copy="${lat},${lng}">${ICON.copy} Copy</button>
    <button class="btn" data-wx="${lat},${lng}" data-name="${esc(name)}">${ICON.wx} Weather</button>`;
}

// ---------------------------------------------------------------- drawing
function startDraw(kind, category, onDone) {
  cancelDraw();
  closePanel();
  S.draw = { kind, category, pts: [], onDone };
  map.closePopup();
  map.getContainer().classList.add('drawing');
  $('#drawbar').classList.remove('hidden');
  updateDraw();
  if (kind === 'point' || kind === 'triage') toast('Tap the map where it is — or use + GPS');
}
function endDrawMode() { S.draw = null; map.getContainer().classList.remove('drawing'); $('#drawbar').classList.add('hidden'); }
function cancelDraw() { endDrawMode(); G.draw.clearLayers(); }

function addVertex(ll) {
  const d = S.draw; if (!d) return;
  d.pts.push(L.latLng(ll.lat, ll.lng));
  if (d.kind === 'point' || d.kind === 'triage') { finishDraw(); return; }
  updateDraw();
}

function updateDraw() {
  const d = S.draw; if (!d) return;
  G.draw.clearLayers();
  const isArea = d.kind === 'polygon' || d.kind === 'measure-area';
  if (d.pts.length > 1) {
    (isArea && d.pts.length > 2 ? L.polygon(d.pts, { color: '#ffd23f', weight: 2, dashArray: '6 4', fillOpacity: 0.15 })
      : L.polyline(d.pts, { color: '#ffd23f', weight: 3, dashArray: '6 4' })).addTo(G.draw);
  }
  d.pts.forEach((p) => L.marker(p, { icon: L.divIcon({ className: 'vtx', iconSize: [12, 12] }), interactive: false }).addTo(G.draw));
  let info;
  if (d.kind === 'point' || d.kind === 'triage') info = `Placing <b>${esc(d.category)}</b> — tap the map`;
  else {
    const len = pathLen(isArea && d.pts.length > 2 ? [...d.pts, d.pts[0]] : d.pts);
    info = `${d.kind.startsWith('measure') ? 'Measuring' : esc(d.category)} · ${d.pts.length} pts<br>${isArea ? 'Perimeter' : 'Length'}: ${fmtLen(len)}`;
    if (!isArea && d.pts.length > 1) { const b = bearing(d.pts[d.pts.length - 2], d.pts[d.pts.length - 1]); info += `<br>Last leg bearing: <b>${Math.round(b)}°</b> T ${card(b)}`; }
    if (isArea) info += `<br>Area: ${fmtArea(area(d.pts))}`;
  }
  $('#drawinfo').innerHTML = info;
  $('#d-finish').classList.toggle('hidden', d.kind === 'point' || d.kind === 'triage');
  $('#d-undo').classList.toggle('hidden', d.kind === 'point' || d.kind === 'triage');
}

function finishDraw() {
  const d = S.draw; if (!d) return;
  const isArea = d.kind === 'polygon' || d.kind === 'measure-area';
  if (d.kind.startsWith('measure')) { // keep the measurement visible until next action
    endDrawMode(); toast('Measurement kept on map — tap Tools ▸ Clear to remove', 3500); return;
  }
  const min = d.kind === 'line' ? 2 : isArea ? 3 : 1;
  if (d.pts.length < min) { toast(`Need at least ${min} points`); return; }
  const c = d.pts.map((p) => [+p.lng.toFixed(7), +p.lat.toFixed(7)]);
  const geometry = d.kind === 'line' ? { type: 'LineString', coordinates: c }
    : d.kind === 'polygon' ? { type: 'Polygon', coordinates: [[...c, c[0]]] }
    : { type: 'Point', coordinates: c[0] };
  const cb = d.onDone; cancelDraw(); cb(geometry);
}

map.on('click', (e) => { if (S.draw) addVertex(e.latlng); });
$('#d-undo').onclick = () => { if (S.draw) { S.draw.pts.pop(); updateDraw(); } };
$('#d-cancel').onclick = cancelDraw;
$('#d-finish').onclick = finishDraw;
$('#d-gps').onclick = () => {
  if (!S.me) { toast('No GPS fix yet — turn on GPS in Tools'); startGps(); return; }
  addVertex(S.me);
};

// ---------------------------------------------------------------- panels
const PANELS = {
  layers: { title: 'Maps & layers', render: renderLayers },
  collect: { title: 'Collect data', render: renderCollect },
  triage: { title: 'Structure triage', render: renderTriage },
  tools: { title: 'Navigate & measure', render: renderTools },
  data: { title: 'My data & offline', render: renderData },
  intel: { title: 'Fire intel & resources', render: renderIntel },
};
let openKey = null;
function openPanel(key) {
  if (openKey === key) return closePanel();
  openKey = key;
  document.querySelectorAll('.toolbar button').forEach((b) => b.classList.toggle('active', b.dataset.panel === key));
  $('#panel-title').textContent = PANELS[key].title;
  $('#panel-body').innerHTML = '';
  PANELS[key].render($('#panel-body'));
  $('#panel').classList.remove('hidden');
}
function closePanel() {
  openKey = null; $('#panel').classList.add('hidden');
  document.querySelectorAll('.toolbar button').forEach((b) => b.classList.remove('active'));
}
function showForm(title, build) {
  openKey = '__form';
  $('#panel-title').textContent = title;
  const body = $('#panel-body'); body.innerHTML = '';
  build(body);
  $('#panel').classList.remove('hidden');
  body.scrollTop = 0;
}
document.querySelectorAll('.toolbar button').forEach((b) => (b.onclick = () => { cancelDraw(); openPanel(b.dataset.panel); }));
$('#panel-close').onclick = closePanel;

function h(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content; }

// ---- Layers
function renderLayers(el) {
  const layerRow = (key, name, sub, sw) => `<label class="row"><input type="checkbox" data-layer="${key}" ${S.layersOn[key] ? 'checked' : ''}>
    ${sw}<span class="grow">${name}<small>${sub}</small></span></label>`;
  el.append(h(`
    <h3>Incident maps (GeoPDF)</h3>
    <p class="hint">Import the GeoPDF maps from your IAP. They're stored on this phone, work offline, and show your GPS position and markup on top.</p>
    <label class="btn primary block">${ICON.pdf} Import GeoPDF<input type="file" id="gp-file" accept="application/pdf,.pdf" hidden></label>
    <div id="gp-prog" class="hint"></div>
    <div id="gp-list">${S.maps.map((m) => `
      <div class="row maprow">
        <input type="checkbox" data-gp-on="${m.id}" ${m.on ? 'checked' : ''} aria-label="Show map">
        <span class="grow">${esc(m.name)}<small>${fmtDate(m.createdAt)}${m.fitErrM != null ? ` · fit ±${Math.max(1, Math.round(m.fitErrM * 3.28084))} ft` : ''}</small>
          <input type="range" min="0.2" max="1" step="0.05" value="${m.opacity}" data-gp-op="${m.id}" aria-label="Opacity"></span>
        <button class="btn" data-gp-zoom="${m.id}">Zoom</button>
        <button class="btn danger" data-gp-del="${m.id}" aria-label="Delete map">✕</button>
      </div>`).join('') || '<p class="hint">No maps imported yet.</p>'}</div>
    <h3>NIFC live layers (public)</h3>
    ${layerRow('redflag', 'Red flag warnings & fire weather watches', 'National Weather Service · nationwide', '<span class="swatch" style="background:#ff149355;border-color:#ff1493"></span>')}
    ${layerRow('incidents', 'Current incidents', 'WFIGS incident locations (IRWIN)', `<span class="fire-pin">${FLAME}</span>`)}
    ${layerRow('perimeters', 'Current fire perimeters', 'WFIGS interagency perimeters', '<span class="swatch" style="background:#ff2a1a55;border-color:#ff2a1a"></span>')}
    ${layerRow('viirs', 'VIIRS / MODIS hotspots (48 h)', 'Satellite thermal detections · zoom in to see', '<span class="swatch dot" style="background:#ff3b1a"></span>')}
    <h3>My data</h3>
    ${layerRow('mine', 'Points, lines & polygons', 'Collected on this device', '<span class="swatch" style="background:#2f8cff"></span>')}
    ${layerRow('triage', 'Structure triage', 'Assessments on this device', '<span class="swatch dot" style="background:#3fbf6f"></span>')}
    ${layerRow('track', 'My GPS track', 'Breadcrumb trail', '<span class="swatch line" style="background:#2f8cff"></span>')}
    <h3>Basemap</h3>
    ${Object.keys(BASEMAPS).map((n) => `<label class="row"><input type="radio" name="bm" value="${n}" ${n === S.basemap ? 'checked' : ''}><span class="grow">${n}</span></label>`).join('')}
    <h3>Legend</h3>
    <div class="legend">
      ${LINE_CATS.map((c) => `<div class="row"><span class="swatch line" style="background:${c.color};outline:2px solid ${c.outline || 'transparent'}"></span><span class="grow">${c.id}</span></div>`).join('')}
      ${TRIAGE_CATS.map((c) => `<div class="row"><span class="swatch dot" style="background:${c.color}"></span><span class="grow">${c.id}</span></div>`).join('')}
    </div>`));
  el.querySelectorAll('[data-layer]').forEach((cb) => (cb.onchange = () => {
    const k = cb.dataset.layer; S.layersOn[k] = cb.checked;
    cb.checked ? G[k].addTo(map) : map.removeLayer(G[k]);
    if (k === 'perimeters') G.perimeters.bringToBack();
    if (k === 'redflag') { S.rfwAt = 0; if (cb.checked) G.redflag.bringToBack(); }
    saveSettings(); if (cb.checked) refreshNifc();
    if (k === 'viirs' && cb.checked && map.getZoom() < 6) toast('Zoom in (level 6+) to load hotspots');
  }));
  el.querySelectorAll('[name=bm]').forEach((r) => (r.onchange = () => setBasemap(r.value)));
  $('#gp-file', el).onchange = (e) => importGeoPdf(e.target.files[0]);
  el.querySelectorAll('[data-gp-on]').forEach((cb) => (cb.onchange = () => setMapOn(cb.dataset.gpOn, cb.checked)));
  el.querySelectorAll('[data-gp-op]').forEach((r) => (r.oninput = () => setMapOpacity(r.dataset.gpOp, +r.value)));
  el.querySelectorAll('[data-gp-zoom]').forEach((b) => (b.onclick = () => { const l = G.maps[b.dataset.gpZoom]; if (l) { closePanel(); map.fitBounds(l.getBounds()); } }));
  el.querySelectorAll('[data-gp-del]').forEach((b) => (b.onclick = () => deleteMap(b.dataset.gpDel)));
}
function setBasemap(name) {
  map.removeLayer(BASEMAPS[S.basemap]); S.basemap = name; BASEMAPS[name].addTo(map);
  baseTiles(name).forEach((l, i) => l.setZIndex(i)); saveSettings();
}

// ---- Collect
function renderCollect(el) {
  const chips = (cats, kind) => cats.map((c) => `<button class="chip" data-kind="${kind}" data-cat="${esc(c.id)}">
    <span class="swatch ${kind === 'point' ? 'dot' : kind === 'line' ? 'line' : ''}" style="background:${c.color}"></span>${esc(c.id)}</button>`).join('');
  el.append(h(`
    <p class="hint">Categories follow the National Incident Feature Service (NIFS) event layers. Data is saved on this device and works offline.</p>
    <h3>Points</h3><div class="grid">${chips(POINT_CATS, 'point')}</div>
    <h3>Lines</h3><div class="grid">${chips(LINE_CATS, 'line')}</div>
    <h3>Polygons</h3><div class="grid">${chips(POLY_CATS, 'polygon')}</div>`));
  el.querySelectorAll('.chip').forEach((b) => (b.onclick = () => {
    const kind = b.dataset.kind, category = b.dataset.cat;
    startDraw(kind, category, (geometry) => openFeatureForm({ id: uid(), kind, category, geometry, props: { createdAt: Date.now() } }, true));
  }));
}

function openFeatureForm(f, isNew = false) {
  const cats = f.kind === 'point' ? POINT_CATS : f.kind === 'line' ? LINE_CATS : POLY_CATS;
  showForm(isNew ? 'New ' + f.kind : 'Edit ' + f.kind, (el) => {
    el.append(h(`
      <label class="f">Category<select name="category">${cats.map((c) => `<option ${c.id === f.category ? 'selected' : ''}>${esc(c.id)}</option>`).join('')}</select></label>
      <label class="f">Label<input name="label" value="${esc(f.props.label)}" placeholder="e.g. DP 12, Div A"></label>
      <label class="f">Notes<textarea name="notes">${esc(f.props.notes)}</textarea></label>
      <label class="f">Collected by<input name="by" value="${esc(f.props.by || localStorage.getItem('by') || '')}" placeholder="Name / resource"></label>
      <div class="btns"><button class="btn primary" id="sv">Save</button><button class="btn" id="cx">Cancel</button></div>`));
    $('#sv', el).onclick = async () => {
      f.category = $('[name=category]', el).value;
      f.props = { ...f.props, label: $('[name=label]', el).value.trim(), notes: $('[name=notes]', el).value.trim(),
        by: $('[name=by]', el).value.trim(), updatedAt: Date.now() };
      localStorage.setItem('by', f.props.by);
      await saveFeature(f); closePanel(); toast('Saved');
    };
    $('#cx', el).onclick = closePanel;
  });
}

// ---- Structure triage
function renderTriage(el) {
  const list = S.features.filter((f) => f.kind === 'triage');
  const counts = TRIAGE_CATS.map((c) => ({ c, n: list.filter((f) => f.category === c.id).length }));
  el.append(h(`
    <p class="hint">Assess structures using NWCG triage categories. Place the structure on the map (or at your GPS location), then fill in the form.</p>
    <div class="btns"><button class="btn primary" id="tri-map">＋ Assess structure (tap map)</button><button class="btn" id="tri-gps">＋ At my location</button></div>
    <h3>Summary — ${list.length} structures</h3>
    ${counts.map(({ c, n }) => `<div class="row"><span class="swatch dot" style="background:${c.color}"></span><span class="grow">${c.id}<small>${c.hint}</small></span><b>${n}</b></div>`).join('')}
    <h3>Recent</h3>
    ${list.slice(-15).reverse().map((f) => `<div class="row" data-goto="${f.id}" style="cursor:pointer"><span class="swatch dot" style="background:${catOf(f).color}"></span>
      <span class="grow">${esc(f.props.address || f.props.label || 'Structure')}<small>${esc(f.props.status || '')} · ${fmtDate(f.props.createdAt)}</small></span></div>`).join('') || '<p class="hint">None yet.</p>'}`));
  const create = (geometry) => openTriageForm({ id: uid(), kind: 'triage', category: TRIAGE_CATS[0].id, geometry, props: { createdAt: Date.now(), status: 'Not Assessed' } }, true);
  $('#tri-map', el).onclick = () => startDraw('triage', 'Structure', create);
  $('#tri-gps', el).onclick = () => {
    if (!S.me) { toast('Waiting for GPS fix…'); startGps(); return; }
    create({ type: 'Point', coordinates: [+S.me.lng.toFixed(7), +S.me.lat.toFixed(7)] });
  };
  el.querySelectorAll('[data-goto]').forEach((r) => (r.onclick = () => zoomToFeature(r.dataset.goto)));
}

function openTriageForm(f, isNew = false) {
  const p = f.props;
  const radio = (name, opts, cur) => `<div class="radios">${opts.map((o) => `<label><input type="radio" name="${name}" value="${esc(o)}" ${o === cur ? 'checked' : ''}>${esc(o)}</label>`).join('')}</div>`;
  const HAZ = ['Propane tank', 'Power lines', 'Wood pile', 'Hazmat', 'Vehicles', 'Animals/livestock', 'Narrow access', 'Steep slope'];
  showForm(isNew ? 'New structure assessment' : 'Edit assessment', (el) => {
    el.append(h(`
      <label class="f">Address / ID<input name="address" value="${esc(p.address)}" placeholder="123 Ridge Rd or SP-014"></label>
      <div class="f">Triage category ${radio('category', TRIAGE_CATS.map((c) => c.id), f.category)}</div>
      <div class="f">Structure status ${radio('status', TRIAGE_STATUS, p.status)}</div>
      <label class="f">Structure type<select name="structureType">${['Single residence', 'Multi-family', 'Mobile home', 'Outbuilding', 'Commercial', 'Critical infrastructure', 'Other'].map((o) => `<option ${o === p.structureType ? 'selected' : ''}>${o}</option>`).join('')}</select></label>
      <label class="f">Roof<select name="roof">${['Non-combustible (metal/tile/comp)', 'Combustible (wood shake)', 'Unknown'].map((o) => `<option ${o === p.roof ? 'selected' : ''}>${o}</option>`).join('')}</select></label>
      <label class="f">Defensible space<select name="space">${['> 100 ft', '30–100 ft', '< 30 ft', 'None'].map((o) => `<option ${o === p.space ? 'selected' : ''}>${o}</option>`).join('')}</select></label>
      <label class="f">Access<select name="access">${['Good – engine turnaround', 'Limited – one way in/out', 'Poor – no turnaround'].map((o) => `<option ${o === p.access ? 'selected' : ''}>${o}</option>`).join('')}</select></label>
      <label class="f">Water source<select name="water">${['Hydrant', 'Pool / pond', 'Tank / cistern', 'None'].map((o) => `<option ${o === p.water ? 'selected' : ''}>${o}</option>`).join('')}</select></label>
      <div class="f">Hazards<div class="radios">${HAZ.map((o) => `<label><input type="checkbox" name="hazards" value="${o}" ${(p.hazards || []).includes(o) ? 'checked' : ''}>${o}</label>`).join('')}</div></div>
      <label class="f">Residents<select name="residents">${['Unknown', 'Evacuated', 'Present – advised', 'Present – refusing', 'Needs assistance'].map((o) => `<option ${o === p.residents ? 'selected' : ''}>${o}</option>`).join('')}</select></label>
      <label class="f">Notes<textarea name="notes">${esc(p.notes)}</textarea></label>
      <label class="f">Photo<input type="file" name="photo" accept="image/*" capture="environment"></label>
      ${p.photo ? `<img class="photo-prev" src="${p.photo}">` : '<img class="photo-prev hidden">'}
      <label class="f">Assessed by<input name="by" value="${esc(p.by || localStorage.getItem('by') || '')}"></label>
      <div class="btns"><button class="btn primary" id="sv">Save assessment</button><button class="btn" id="cx">Cancel</button></div>`));
    let photo = p.photo || '';
    $('[name=photo]', el).onchange = async (e) => {
      const file = e.target.files[0]; if (!file) return;
      photo = await shrinkImage(file, 900); const img = $('.photo-prev', el); img.src = photo; img.classList.remove('hidden');
    };
    $('#sv', el).onclick = async () => {
      const val = (n) => ($(`[name=${n}]:checked`, el) || $(`[name=${n}]`, el) || {}).value || '';
      f.category = val('category') || TRIAGE_CATS[0].id;
      f.props = { ...p, address: $('[name=address]', el).value.trim(), status: val('status'), structureType: val('structureType'),
        roof: val('roof'), space: val('space'), access: val('access'), water: val('water'), residents: val('residents'),
        hazards: [...el.querySelectorAll('[name=hazards]:checked')].map((c) => c.value),
        notes: $('[name=notes]', el).value.trim(), by: $('[name=by]', el).value.trim(), photo, updatedAt: Date.now() };
      localStorage.setItem('by', f.props.by);
      await saveFeature(f); toast('Assessment saved'); openPanel('triage');
    };
    $('#cx', el).onclick = closePanel;
  });
}

function shrinkImage(file, max) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = img.width * s; c.height = img.height * s;
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src); resolve(c.toDataURL('image/jpeg', 0.7));
    };
    img.src = URL.createObjectURL(file);
  });
}

function zoomToFeature(id) {
  const f = S.features.find((x) => x.id === id); if (!f) return;
  closePanel();
  const lyr = L.geoJSON(f.geometry); map.fitBounds(lyr.getBounds(), { maxZoom: 17 });
}

// ---- Navigate & measure
function renderTools(el) {
  const decl = getDecl();
  el.append(h(`
    <h3>Navigate to waypoint</h3>
    ${S.nav ? `<div class="row"><span class="grow">Navigating to <b>${esc(S.nav.name)}</b></span><button class="btn danger" id="t-navstop">End</button></div>` : ''}
    <p class="hint">Tap any marker or incident and choose <b>Navigate</b>, or enter coordinates below. Shows distance, bearing and elevation change from where you are.</p>
    <input class="search" id="t-coord" placeholder="39.5123, -111.4321  or  39 30.738 N 111 25.926 W">
    <div class="btns"><button class="btn primary" id="t-nav">${ICON.nav} Navigate</button><button class="btn" id="t-go">Show on map</button></div>
    <label class="f">Magnetic declination (° east +, west −)<input id="t-decl" type="number" step="0.5" value="${decl || ''}" placeholder="e.g. 11 in Idaho, -8 in North Carolina"></label>
    <p class="hint">Set it to also see magnetic bearings for your compass. Leave blank for true bearings only.</p>
    <h3>My location</h3>
    <div class="btns">
      <button class="btn ${S.watchId != null ? 'primary' : ''}" id="t-gps">${S.watchId != null ? 'GPS on' : 'Turn on GPS'}</button>
      <button class="btn" id="t-center">Center on me</button>
      <button class="btn" id="t-copyme">${ICON.copy} Copy</button>
      <button class="btn" id="t-wx">${ICON.wx} Weather here</button>
    </div>
    <div id="t-fix" class="hint" style="margin-top:8px">${S.me ? fixText() : 'No fix yet.'}</div>
    <h3>Measure</h3>
    <div class="btns">
      <button class="btn" id="t-mline">Distance & bearing</button>
      <button class="btn" id="t-marea">Area</button>
      <button class="btn" id="t-mclear">Clear</button>
    </div>
    <h3>Track / breadcrumbs</h3>
    <p class="hint">Records your path for crew accountability and to map line as you walk it.</p>
    <div class="btns">
      <button class="btn ${S.tracking ? 'primary' : ''}" id="t-track">${S.tracking ? '■ Stop tracking' : '● Start tracking'}</button>
      <button class="btn" id="t-track2line">Save track as line…</button>
    </div>
    <div class="hint" id="t-trackinfo">${trackInfo()}</div>`));
  const navStop = $('#t-navstop', el); if (navStop) navStop.onclick = () => { stopNav(); openKey = null; openPanel('tools'); };
  $('#t-decl', el).onchange = (e) => { localStorage.setItem('decl', e.target.value || '0'); updateNav(); };
  $('#t-gps', el).onclick = () => { S.watchId != null ? stopGps() : startGps(); openKey = null; openPanel('tools'); };
  $('#t-center', el).onclick = () => { if (S.me) map.setView(S.me, Math.max(map.getZoom(), 15)); else { startGps(); toast('Getting a fix…'); } };
  $('#t-wx', el).onclick = () => { const c = S.me || map.getCenter(); if (!S.me) toast('No GPS fix: showing weather for the map center'); showWeather(c.lat, c.lng, S.me ? 'My location' : 'Map center'); };
  $('#t-copyme', el).onclick = () => (S.me ? copyText(`${ddm(S.me.lat, S.me.lng)}  (${S.me.lat.toFixed(5)}, ${S.me.lng.toFixed(5)})`) : toast('No GPS fix yet'));
  $('#t-track', el).onclick = () => { S.tracking ? stopTracking() : startTracking(); openKey = null; openPanel('tools'); };
  $('#t-track2line', el).onclick = trackToLine;
  $('#t-mline', el).onclick = () => startDraw('measure-line', 'Measure', () => {});
  $('#t-marea', el).onclick = () => startDraw('measure-area', 'Measure', () => {});
  $('#t-mclear', el).onclick = () => { cancelDraw(); toast('Cleared'); };
  $('#t-nav', el).onclick = () => {
    const ll = parseCoord($('#t-coord', el).value);
    if (!ll) return toast('Could not read those coordinates');
    startNav({ lat: ll[0], lng: ll[1], name: ddm(ll[0], ll[1]), elevFt: null });
  };
  $('#t-go', el).onclick = () => {
    const ll = parseCoord($('#t-coord', el).value);
    if (!ll) return toast('Could not read those coordinates');
    closePanel(); map.setView(ll, 15); locationPopup(L.latLng(ll[0], ll[1]));
  };
}

function parseCoord(s) {
  s = s.trim().toUpperCase();
  const dec = s.match(/^(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)$/);
  if (dec) return [+dec[1], +dec[2]];
  // DDM / DMS: "39 30.738 N 111 25.926 W" or "39°30.738'N 111°25.926'W"
  const parts = s.replace(/[°'"]/g, ' ').match(/(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)(?:\s+(\d+(?:\.\d+)?))?\s*([NS])[\s,]+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)(?:\s+(\d+(?:\.\d+)?))?\s*([EW])/);
  if (!parts) return null;
  const v = (d, m, sec, hemi) => (+d + +m / 60 + (+sec || 0) / 3600) * (hemi === 'S' || hemi === 'W' ? -1 : 1);
  return [v(parts[1], parts[2], parts[3], parts[4]), v(parts[5], parts[6], parts[7], parts[8])];
}

// ---------------------------------------------------------------- GPS & tracking
function fixText() {
  const parts = [`±${Math.round(S.me.acc * 3.28084)} ft accuracy`];
  if (S.meGroundFt != null) parts.push(`<b>${Math.round(S.meGroundFt).toLocaleString()} ft</b> elevation (USGS)`);
  if (S.me.alt != null) parts.push(`GPS altitude ${Math.round(S.me.alt * 3.28084).toLocaleString()} ft`);
  return `${ddm(S.me.lat, S.me.lng)}<br>${parts.join(' · ')}`;
}
let lastGroundAt = 0, lastGroundPos = null;
async function refreshGround() {
  if (!S.me || !navigator.onLine) return;
  if (Date.now() - lastGroundAt < 30000 || (lastGroundPos && dist(lastGroundPos, S.me) < 30)) return;
  lastGroundAt = Date.now(); lastGroundPos = { lat: S.me.lat, lng: S.me.lng };
  const v = await getElevationFt(S.me.lat, S.me.lng);
  if (v != null) { S.meGroundFt = v; const fx = $('#t-fix'); if (fx) fx.innerHTML = fixText(); updateNav(); }
}
function trackInfo() {
  if (!S.track || !S.track.points.length) return 'No track recorded.';
  const pts = S.track.points.map(([lat, lng]) => ({ lat, lng }));
  return `${S.track.points.length} pts · ${(pathLen(pts) / 1609.344).toFixed(2)} mi · started ${fmtDate(S.track.points[0][2])}`;
}

function startGps() {
  if (!navigator.geolocation) return toast('GPS not available on this device');
  if (S.watchId != null) return;
  S.watchId = navigator.geolocation.watchPosition(onFix, (err) => {
    $('#gps').textContent = 'GPS error'; $('#gps').className = 'pill bad'; toast('GPS: ' + err.message);
  }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
  $('#gps').textContent = 'GPS…'; $('#gps').className = 'pill off';
}
function stopGps() {
  if (S.watchId != null) navigator.geolocation.clearWatch(S.watchId);
  S.watchId = null; S.tracking = false; G.me.clearLayers();
  $('#gps').textContent = 'GPS off'; $('#gps').className = 'pill off';
}
let firstFix = true;
function onFix(pos) {
  const { latitude: lat, longitude: lng, accuracy: acc, altitude: alt } = pos.coords;
  S.me = { lat, lng, acc, alt };
  $('#gps').textContent = `GPS ±${Math.round(acc * 3.28084)} ft`; $('#gps').className = 'pill';
  G.me.clearLayers();
  L.circle([lat, lng], { radius: acc, color: '#2f8cff', weight: 1, fillOpacity: 0.08, interactive: false }).addTo(G.me);
  L.marker([lat, lng], { icon: L.divIcon({ className: 'me-dot', iconSize: [16, 16] }), interactive: false }).addTo(G.me);
  if (firstFix) { firstFix = false; map.setView([lat, lng], Math.max(map.getZoom(), 14)); }
  const fx = $('#t-fix'); if (fx) fx.innerHTML = fixText();
  refreshGround(); updateNav(); checkRfwBanner();
  if (S.tracking && acc < 50) {
    const last = S.track.points[S.track.points.length - 1];
    if (!last || dist({ lat: last[0], lng: last[1] }, S.me) > 5) {
      S.track.points.push([+lat.toFixed(7), +lng.toFixed(7), Date.now()]);
      DB.put('tracks', S.track); renderTrack();
      const ti = $('#t-trackinfo'); if (ti) ti.textContent = trackInfo();
    }
  }
}
function startTracking() {
  startGps(); S.tracking = true;
  if (!S.track) S.track = { id: 'current', points: [] };
  toast('Tracking — keep the app open for best results');
}
function stopTracking() { S.tracking = false; toast('Tracking stopped'); }
function renderTrack() {
  G.track.clearLayers();
  if (S.track && S.track.points.length > 1) L.polyline(S.track.points.map(([a, b]) => [a, b]), { color: '#2f8cff', weight: 3, opacity: 0.85 }).addTo(G.track);
}
function trackToLine() {
  if (!S.track || S.track.points.length < 2) return toast('Record a track first');
  showForm('Save track as line', (el) => {
    el.append(h(`<p class="hint">${trackInfo()}</p>
      <label class="f">Line type<select name="cat">${LINE_CATS.map((c) => `<option>${c.id}</option>`).join('')}</select></label>
      <div class="radios" style="margin-top:10px"><label><input type="checkbox" name="clear" checked> Clear track after saving</label></div>
      <div class="btns"><button class="btn primary" id="sv">Save</button></div>`));
    $('#sv', el).onclick = async () => {
      await saveFeature({ id: uid(), kind: 'line', category: $('[name=cat]', el).value,
        geometry: { type: 'LineString', coordinates: S.track.points.map(([lat, lng]) => [lng, lat]) },
        props: { createdAt: Date.now(), label: 'From GPS track', by: localStorage.getItem('by') || '' } });
      if ($('[name=clear]', el).checked) { S.track.points = []; await DB.put('tracks', S.track); renderTrack(); }
      closePanel(); toast('Line saved');
    };
  });
}

// ---------------------------------------------------------------- data / offline
function renderData(el) {
  const n = (k) => S.features.filter((f) => f.kind === k).length;
  el.append(h(`
    ${sharingSection()}
    <h3>On this device</h3>
    <div class="row"><span class="grow">Points</span><b>${n('point')}</b></div>
    <div class="row"><span class="grow">Lines</span><b>${n('line')}</b></div>
    <div class="row"><span class="grow">Polygons</span><b>${n('polygon')}</b></div>
    <div class="row"><span class="grow">Structure assessments</span><b>${n('triage')}</b></div>
    <h3>Share & export</h3>
    <label class="f">What to export<select id="x-what">${exportChoices().map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('')}</select></label>
    <label class="f">Format<select id="x-fmt">
      <option value="kml">KML: Google Earth, Avenza, Gaia, CalTopo, ArcGIS</option>
      <option value="gpx">GPX: handheld GPS units (waypoints & tracks)</option>
      <option value="geojson">GeoJSON: ArcGIS Online/Pro, QGIS, NIFS upload</option>
      <option value="csv">CSV: spreadsheet of points & triage</option>
      <option value="tak">TAK data package: ATAK, iTAK, WinTAK</option>
    </select></label>
    <div class="radios" style="margin-top:8px"><label><input type="checkbox" id="x-trk" ${S.track?.points.length > 1 ? 'checked' : ''}> Include my GPS track (KML/GPX/TAK)</label></div>
    <p class="hint">TAK: in ATAK/iTAK use Import ▸ Local storage (or open the .zip from Files/messages). Points arrive as TAK markers, lines and areas as an overlay.</p>
    <div class="btns">
      <button class="btn primary" id="x-dl">Download</button>
      <button class="btn" id="x-share">Share…</button>
      <label class="btn">Import GeoJSON<input type="file" id="x-imp" accept=".geojson,.json,application/geo+json" hidden></label>
    </div>
    <h3>Offline maps</h3>
    <p class="hint">Downloads the free USGS map for the area on screen (this zoom + 3 more levels) so it works with no signal. Areas you've already looked at on any basemap are also kept. Last-loaded fire layers and weather stay available offline too.</p>
    <button class="btn block" id="x-tiles">Download this area (${S.basemap})</button>
    <div class="hint" id="x-prog"></div>
    <h3>Signed in</h3>
    <div class="row"><span class="grow">${esc(S.session?.name || '—')}<small>${esc(S.session?.crew || '')}</small></span>
      <button class="btn" id="x-out">Sign out</button></div>
    <h3>Danger zone</h3>
    <button class="btn danger" id="x-wipe">Delete all my data</button>`));
  const pickExport = () => {
    const x = buildExport($('#x-fmt', el).value, $('#x-what', el).value, $('#x-trk', el).checked);
    if (!x.n && !($('#x-trk', el).checked && S.track?.points.length > 1)) { toast('Nothing to export for that selection'); return null; }
    return x;
  };
  $('#x-dl', el).onclick = () => { const x = pickExport(); if (x) { download(x.name, x.text, x.type); toast(`Exported ${x.n} features`); } };
  $('#x-share', el).onclick = async () => {
    const x = pickExport(); if (!x) return;
    const file = new File([x.text], x.name, { type: x.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'FireLine field data' }); } catch { /* cancelled */ }
    } else { download(x.name, x.text, x.type); toast('Sharing not supported here, so it was downloaded instead'); }
  };
  $('#x-imp', el).onchange = importFile;
  $('#x-tiles', el).onclick = downloadTiles;
  $('#x-out', el).onclick = signOut;
  wireSharing(el);
  $('#x-wipe', el).onclick = async () => {
    if (!confirm('Delete ALL collected features, triage and tracks on this device? Export first if you need them.')) return;
    await DB.clear('features'); await DB.clear('tracks'); S.features = []; S.track = null;
    renderMine(); renderTrack(); openKey = null; openPanel('data'); toast('All data deleted');
  };
}
const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
function toGeoJSON(list = S.features) {
  return { type: 'FeatureCollection', features: list.map((f) => ({ type: 'Feature', id: f.id, geometry: f.geometry,
    properties: { FeatureCategory: f.category, Kind: f.kind, ...Object.fromEntries(Object.entries(f.props).map(([k, v]) => [k, Array.isArray(v) ? v.join('; ') : v])),
      CreateDate: f.props.createdAt ? new Date(f.props.createdAt).toISOString() : null } })) };
}
function download(name, text, type) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
async function importFile(e) {
  const file = e.target.files[0]; if (!file) return;
  try {
    const gj = JSON.parse(await file.text()); let n = 0;
    for (const ft of gj.features || []) {
      const g = ft.geometry; if (!g) continue;
      const p = ft.properties || {};
      const kind = p.Kind || (g.type === 'Point' ? 'point' : g.type === 'LineString' ? 'line' : g.type === 'Polygon' ? 'polygon' : null);
      if (!kind) continue;
      const { FeatureCategory, Kind, CreateDate, ...rest } = p;
      if (typeof rest.hazards === 'string') rest.hazards = rest.hazards.split('; ').filter(Boolean);
      await saveFeature({ id: String(ft.id || uid()), kind, category: FeatureCategory || p.category || catOf({ kind }).id, geometry: g,
        props: { createdAt: Date.now(), ...rest } });
      n++;
    }
    toast(`Imported ${n} features`); openKey = null; openPanel('data');
  } catch (err) { toast('Import failed: ' + err.message); }
}

async function downloadTiles() {
  const layers = baseTiles(S.basemap);
  if (!layers.every((l) => l.options.offlineOK)) {
    return toast('Offline downloads use the free USGS maps. Switch the basemap to “USGS Topo” or “USGS Shaded relief” (Maps tab) and try again.', 6000);
  }
  const b = map.getBounds(), z0 = Math.min(map.getZoom(), 16), urls = [];
  for (const layer of layers) {
    const zMax = Math.min(z0 + 3, layer.options.maxNativeZoom || layer.options.maxZoom);
    for (let z = z0; z <= zMax; z++) {
      const nw = map.project(b.getNorthWest(), z).divideBy(256).floor(), se = map.project(b.getSouthEast(), z).divideBy(256).floor();
      for (let x = nw.x; x <= se.x; x++) for (let y = nw.y; y <= se.y; y++) {
        urls.push(L.Util.template(layer._url, { s: 'abc'[(x + y) % 3], z, x, y, r: '' }));
      }
    }
  }
  if (urls.length > 2500) return toast(`That's ${urls.length} tiles — zoom in further first (max 2500)`, 4000);
  if (!confirm(`Download ${urls.length} map tiles for offline use?`)) return;
  const cache = await caches.open('fireline-tiles');
  let done = 0, fail = 0; const prog = $('#x-prog');
  const worker = async () => {
    while (urls.length) {
      const u = urls.pop();
      try { if (!(await cache.match(u))) { const r = await fetch(u, { mode: 'no-cors' }); if (r.ok || r.type === 'opaque') await cache.put(u, r); else fail++; } }
      catch { fail++; }
      done++; if (prog) prog.textContent = `${done} tiles cached${fail ? ` · ${fail} failed` : ''}`;
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  toast(`Offline area ready (${done - fail} tiles)`);
}

// ---- Intel & resources
function renderIntel(el) {
  el.append(h(`
    <h3>Find an incident</h3>
    <input class="search" id="i-q" placeholder="Search current incidents by name…">
    <div id="i-res"></div>
    <h3>FireGuard</h3>
    <p class="hint">DoD satellite fire mapping, updated as often as every 15 minutes — most valuable in the first 24–48 hours of a fire when other intel is thin. It is <b>only</b> available through the NIFC ArcGIS Online org (login required), so it can't be shown in this public app. Open it in Field Maps or the NIFC org.</p>
    <a class="btn block" href="https://iaa-nifc.hub.arcgis.com/pages/fireguard" target="_blank" rel="noopener">FireGuard info (IAA hub)</a>
    <h3>NIFC ArcGIS Online org</h3>
    <p class="hint">Open to federal, state, local and tribal wildland firefighters and cooperators — not just feds. Gives you NIFS editing, the National Structure Triage layer, offline Field Maps templates and FireGuard.</p>
    <a class="btn block" href="https://support-nifc.hub.arcgis.com/" target="_blank" rel="noopener">Request a NIFC account</a>
    <a class="btn block" href="https://nifc.maps.arcgis.com/home/index.html" target="_blank" rel="noopener">NIFC org sign-in</a>
    <h3>Other sources</h3>
    <a class="btn block" href="https://data-nifc.opendata.arcgis.com/search" target="_blank" rel="noopener">NIFC Open Data (perimeters, RAWS, PODs, boundaries)</a>
    <a class="btn block" href="https://egp.wildfire.gov/egp/default.aspx" target="_blank" rel="noopener">Enterprise Geospatial Portal (EGP / WildFireSA)</a>
    <a class="btn block" href="https://www.nifc.gov/nicc/incident-information/imsr" target="_blank" rel="noopener">IMSR dashboard (national situation)</a>
    <a class="btn block" href="https://iaa-nifc.hub.arcgis.com/" target="_blank" rel="noopener">Incident Awareness & Assessment (IAA)</a>
    <h3>Field reminders</h3>
    <p class="hint"><b>LCES</b> — Lookouts, Communications, Escape routes, Safety zones. Mark them with Collect ▸ Points before engaging.</p>`));
  const q = $('#i-q', el), res = $('#i-res', el);
  q.oninput = () => {
    const s = q.value.trim().toLowerCase(); res.innerHTML = '';
    if (s.length < 2) return;
    const feats = (S.incidentsData?.gj.features || []).filter((f) => (f.properties.IncidentName || '').toLowerCase().includes(s)).slice(0, 25);
    if (!feats.length) { res.innerHTML = `<p class="hint">${S.incidentsData ? 'No match.' : 'Incident layer not loaded yet.'}</p>`; return; }
    feats.forEach((f) => {
      const p = f.properties, r = h(`<div class="row" style="cursor:pointer"><span class="fire-pin">${FLAME}</span><span class="grow">${esc(p.IncidentName)}
        <small>${esc(p.POOState || '')} · ${p.IncidentSize != null ? esc(p.IncidentSize) + ' ac' : 'size n/a'}${p.PercentContained != null ? ' · ' + p.PercentContained + '% contained' : ''}</small></span></div>`).firstElementChild;
      r.onclick = () => { const [lng, lat] = f.geometry.coordinates; closePanel(); map.setView([lat, lng], 12);
        L.popup().setLatLng([lat, lng]).setContent(nifcPopup(p, 'incident')).openOn(map); };
      res.appendChild(r);
    });
  };
}

// ---------------------------------------------------------------- copy coordinates
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Copied: ' + text, 3000); }
  catch {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('Copied: ' + text, 3000); } catch { prompt('Copy these coordinates:', text); }
    ta.remove();
  }
}

// ---------------------------------------------------------------- navigate to waypoint
function bearing(a, b) {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
const CARD = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const card = (d) => CARD[Math.round(d / 22.5) % 16];
function getDecl() { return parseFloat(localStorage.getItem('decl') || '0') || 0; }
function fmtDistBig(m) {
  const ft = m * 3.28084;
  return ft < 1320 ? `${Math.round(ft).toLocaleString()} ft` : `${(m / 1609.344).toFixed(2)} mi`;
}
const targetIcon = L.divIcon({ className: '', iconSize: [34, 34], iconAnchor: [17, 17],
  html: '<div class="nav-target"><span></span></div>' });

function startNav(t) {
  S.nav = t; closePanel(); startGps();
  $('#navbar').classList.remove('hidden');
  if (t.elevFt == null) getElevationFt(t.lat, t.lng).then((v) => { if (S.nav === t && v != null) { t.elevFt = v; updateNav(); } });
  updateNav();
  map.fitBounds(L.latLngBounds([t, S.me || t]).pad(0.35), { maxZoom: 16 });
}
function stopNav() { S.nav = null; G.nav.clearLayers(); $('#navbar').classList.add('hidden'); }
let arrived = false;
function updateNav() {
  const t = S.nav; if (!t) return;
  G.nav.clearLayers();
  L.marker(t, { icon: targetIcon, interactive: false }).addTo(G.nav);
  let html = `<div class="nav-name">${esc(t.name)}</div>`;
  if (!S.me) {
    html += `<div class="nav-big">Waiting for GPS…</div>`;
  } else {
    const d = dist(S.me, t), brg = bearing(S.me, t), decl = getDecl();
    L.polyline([S.me, t], { color: '#ff3b30', weight: 3, dashArray: '2 8', lineCap: 'round', interactive: false }).addTo(G.nav);
    const myElev = S.meGroundFt ?? (S.me.alt != null ? S.me.alt * 3.28084 : null);
    let elev = t.elevFt != null ? `Target ${Math.round(t.elevFt).toLocaleString()} ft` : 'Target elev —';
    if (t.elevFt != null && myElev != null) {
      const dz = t.elevFt - myElev;
      elev = `${dz >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(dz)).toLocaleString()} ft ${dz >= 0 ? 'climb' : 'descent'}`;
    }
    const grade = t.elevFt != null && myElev != null && d > 30 ? ` · ${Math.round(((t.elevFt - myElev) / (d * 3.28084)) * 100)}% avg slope` : '';
    html += `<div class="nav-main">
        <div class="nav-arrow" style="transform:rotate(${brg}deg)">${svg('<path d="M12 3l6 17-6-4-6 4z" fill="currentColor"/>')}</div>
        <div><div class="nav-big">${fmtDistBig(d)}</div><div class="nav-sub">${(d / 20.1168).toFixed(0)} chains</div></div>
        <div class="nav-brg"><div class="nav-big">${Math.round(brg)}°<small>T</small></div>
          <div class="nav-sub">${card(brg)}${decl ? ` · ${Math.round((brg - decl + 360) % 360)}° M` : ''}</div></div>
      </div>
      <div class="nav-sub">${elev}${grade}</div>`;
    if (d < 15 && !arrived) { arrived = true; toast(`Arrived at ${t.name}`, 4000); navigator.vibrate?.(300); }
    if (d > 30) arrived = false;
  }
  $('#navinfo').innerHTML = html;
}
$('#nav-stop').onclick = stopNav;

// ---------------------------------------------------------------- GeoPDF incident maps
// Reads the ISO 32000 geospatial dictionaries (/VP → /Measure /GEO with GPTS/LPTS) that
// ArcGIS and most IAP map tools write, renders the page once, and pins it to the map.
const LIBS = {
  pdfjs: 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js',
  pdfjsWorker: 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js',
  pdflib: 'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js',
};
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const el = document.createElement('script'); el.src = src; el.onload = resolve;
    el.onerror = () => reject(new Error('Could not load the PDF reader. Connect once to enable GeoPDF import.'));
    document.head.appendChild(el);
  });
}

// Image pinned to the map by three corners (affine), so rotated / projected maps line up.
const AffineImage = L.Layer.extend({
  options: { pane: 'geopdf', opacity: 0.9 },
  initialize(url, corners, opts) { this._url = url; this._c = corners.map((c) => L.latLng(c)); L.setOptions(this, opts); },
  onAdd() {
    const img = (this._img = L.DomUtil.create('img', 'geopdf-img leaflet-zoom-hide'));
    img.style.opacity = this.options.opacity;
    img.onload = () => this._reset();
    img.src = this._url;
    this.getPane().appendChild(img);
    this._map.on('zoomend viewreset', this._reset, this);
    this._reset();
  },
  onRemove() { this._img.remove(); this._map.off('zoomend viewreset', this._reset, this); },
  setOpacity(o) { this.options.opacity = o; if (this._img) this._img.style.opacity = o; },
  getBounds() {
    const [tl, tr, bl] = this._c;
    const br = L.latLng(tr.lat + bl.lat - tl.lat, tr.lng + bl.lng - tl.lng);
    return L.latLngBounds([tl, tr, bl, br]);
  },
  _reset() {
    const img = this._img; if (!img || !img.naturalWidth || !this._map) return;
    const [tl, tr, bl] = this._c.map((c) => this._map.latLngToLayerPoint(c));
    const w = img.naturalWidth, hgt = img.naturalHeight;
    img.style.width = w + 'px'; img.style.height = hgt + 'px';
    img.style.transform = `matrix(${(tr.x - tl.x) / w},${(tr.y - tl.y) / w},${(bl.x - tl.x) / hgt},${(bl.y - tl.y) / hgt},${tl.x},${tl.y})`;
  },
});

function solve3(A, b) { // Cramer's rule for 3x3
  const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det(A); if (Math.abs(D) < 1e-12) throw new Error('Map georeference points are degenerate');
  return [0, 1, 2].map((i) => det(A.map((row, r) => row.map((v, c) => (c === i ? b[r] : v)))) / D);
}
function fitAffine(src, dst) { // least squares: dst = [a b c; d e f] * [x y 1]
  const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], bx = [0, 0, 0], by = [0, 0, 0];
  src.forEach(([x, y], i) => {
    const v = [x, y, 1];
    for (let r = 0; r < 3; r++) { for (let c = 0; c < 3; c++) A[r][c] += v[r] * v[c]; bx[r] += v[r] * dst[i][0]; by[r] += v[r] * dst[i][1]; }
  });
  const X = solve3(A, bx), Y = solve3(A, by);
  return (x, y) => [X[0] * x + X[1] * y + X[2], Y[0] * x + Y[1] * y + Y[2]];
}

async function readGeoref(bytes) {
  const { PDFDocument, PDFName, PDFArray, PDFDict, PDFNumber } = window.PDFLib;
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const page = doc.getPage(0);
  const look = (o) => (o ? doc.context.lookup(o) : undefined);
  const nums = (o) => { o = look(o); return o instanceof PDFArray ? o.asArray().map((x) => { x = look(x); return x instanceof PDFNumber ? x.asNumber() : NaN; }) : null; };
  const vps = look(page.node.get(PDFName.of('VP')));
  const cands = [];
  if (vps instanceof PDFArray) {
    for (const ref of vps.asArray()) {
      const vp = look(ref); if (!(vp instanceof PDFDict)) continue;
      const m = look(vp.get(PDFName.of('Measure'))); if (!(m instanceof PDFDict)) continue;
      const sub = look(m.get(PDFName.of('Subtype')));
      if (sub && sub.toString() !== '/GEO') continue;
      const bbox = nums(vp.get(PDFName.of('BBox'))), gpts = nums(m.get(PDFName.of('GPTS')));
      const lpts = nums(m.get(PDFName.of('LPTS'))) || [0, 1, 0, 0, 1, 0, 1, 1];
      if (!bbox || !gpts || gpts.length < 6 || gpts.some(isNaN)) continue;
      cands.push({ bbox, gpts, lpts, area: Math.abs((bbox[2] - bbox[0]) * (bbox[3] - bbox[1])) });
    }
  }
  if (!cands.length) {
    if (page.node.get(PDFName.of('LGIDict'))) throw new Error('This is an older TerraGo-style GeoPDF. Re-export it from ArcGIS or the IAP as an ISO/OGC GeoPDF.');
    throw new Error('No georeference found in this PDF — is it a GeoPDF?');
  }
  const vp = cands.sort((a, b) => b.area - a.area)[0];
  const [bx0, by0, bx1, by1] = [Math.min(vp.bbox[0], vp.bbox[2]), Math.min(vp.bbox[1], vp.bbox[3]), Math.max(vp.bbox[0], vp.bbox[2]), Math.max(vp.bbox[1], vp.bbox[3])];
  const src = [], dst = [];
  for (let i = 0; i * 2 + 1 < vp.gpts.length; i++) {
    const lat = vp.gpts[2 * i], lng = vp.gpts[2 * i + 1];
    const lx = vp.lpts[2 * i] ?? 0, ly = vp.lpts[2 * i + 1] ?? 0;
    src.push([bx0 + lx * (bx1 - bx0), by0 + ly * (by1 - by0)]);
    const pm = L.CRS.EPSG3857.project(L.latLng(lat, lng)); dst.push([pm.x, pm.y]);
  }
  const f = fitAffine(src, dst);
  const fitErrM = Math.max(...src.map(([x, y], i) => { const [X, Y] = f(x, y); return Math.hypot(X - dst[i][0], Y - dst[i][1]); }))
    * Math.cos(rad(vp.gpts[0])); // mercator meters → ground meters
  const mb = page.getMediaBox();
  const toLL = (x, y) => { const [X, Y] = f(x, y); const ll = L.CRS.EPSG3857.unproject(L.point(X, Y)); return [ll.lat, ll.lng]; };
  return {
    corners: [toLL(mb.x, mb.y + mb.height), toLL(mb.x + mb.width, mb.y + mb.height), toLL(mb.x, mb.y)], // TL, TR, BL
    fitErrM,
  };
}

async function renderPdfImage(bytes) {
  const pdfjs = window.pdfjsLib; pdfjs.GlobalWorkerOptions.workerSrc = LIBS.pdfjsWorker;
  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  const page = await pdf.getPage(1);
  const base = page.getViewport({ scale: 1, rotation: 0 }); // unrotated, to match PDF user space
  const maxDim = 4000, maxArea = 15e6;
  const scale = Math.min(4, maxDim / Math.max(base.width, base.height), Math.sqrt(maxArea / (base.width * base.height)));
  const vp = page.getViewport({ scale, rotation: 0 });
  const canvas = document.createElement('canvas'); canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height);
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.85));
  pdf.destroy(); canvas.width = canvas.height = 0;
  return blob;
}

async function importGeoPdf(file) {
  if (!file) return;
  const prog = (t) => { const p = $('#gp-prog'); if (p) p.textContent = t; };
  try {
    prog('Loading PDF reader…');
    await Promise.all([loadScript(LIBS.pdfjs), loadScript(LIBS.pdflib)]);
    const buf = new Uint8Array(await file.arrayBuffer());
    prog('Reading georeference…');
    const geo = await readGeoref(buf.slice());
    prog('Rendering map (large maps take a few seconds)…');
    const blob = await renderPdfImage(buf.slice());
    const m = { id: uid(), name: file.name.replace(/\.pdf$/i, ''), corners: geo.corners, fitErrM: geo.fitErrM,
      opacity: 0.9, on: true, createdAt: Date.now(), size: blob.size };
    await DB.put('maps', { ...m, blob });
    S.maps.push(m); addMapLayer(m, blob);
    map.fitBounds(G.maps[m.id].getBounds());
    prog(''); toast(`Map added: ${m.name}`);
    if (openKey === 'layers') { openKey = null; openPanel('layers'); }
  } catch (err) {
    console.error(err); prog(''); toast('GeoPDF import failed: ' + err.message, 6000);
  }
}
function addMapLayer(m, blob) {
  const layer = new AffineImage(URL.createObjectURL(blob), m.corners, { opacity: m.opacity });
  G.maps[m.id] = layer; if (m.on) layer.addTo(map);
}
async function saveMapMeta(m) { const rec = await DB.get('maps', m.id); if (rec) await DB.put('maps', { ...rec, ...m }); }
function setMapOn(id, on) {
  const m = S.maps.find((x) => x.id === id); if (!m) return;
  m.on = on; on ? G.maps[id].addTo(map) : map.removeLayer(G.maps[id]); saveMapMeta(m);
}
function setMapOpacity(id, o) {
  const m = S.maps.find((x) => x.id === id); if (!m) return;
  m.opacity = o; G.maps[id].setOpacity(o); clearTimeout(m._t); m._t = setTimeout(() => { delete m._t; saveMapMeta(m); }, 400);
}
async function deleteMap(id) {
  const m = S.maps.find((x) => x.id === id); if (!m || !confirm(`Remove map "${m.name}" from this device?`)) return;
  map.removeLayer(G.maps[id]); delete G.maps[id];
  S.maps = S.maps.filter((x) => x.id !== id); await DB.del('maps', id);
  openKey = null; openPanel('layers');
}
async function loadMaps() {
  for (const rec of await DB.all('maps')) {
    const { blob, ...m } = rec; S.maps.push(m); addMapLayer(m, blob);
  }
}

// ---------------------------------------------------------------- export (GeoJSON / KML / GPX / CSV)
function exportChoices() {
  const out = [['all', 'All my data'], ['kind:point', 'Points'], ['kind:line', 'Lines'], ['kind:polygon', 'Polygons'], ['kind:triage', 'Structure triage'], ['notes', 'Incident notes']];
  [...new Set(S.features.filter((f) => f.kind !== 'triage').map((f) => f.category))].sort().forEach((c) => out.push(['cat:' + c, '• ' + c]));
  return out;
}
function pickFeatures(what) {
  if (what === 'all') return S.features;
  if (what === 'notes') return notesAsFeatures();
  const [k, v] = [what.slice(0, what.indexOf(':')), what.slice(what.indexOf(':') + 1)];
  return S.features.filter((f) => (k === 'kind' ? f.kind === v : f.category === v));
}
const xml = (v) => String(v ?? '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
const flatProps = (p) => Object.entries(p).filter(([k, v]) => k !== 'photo' && v !== '' && v != null).map(([k, v]) => [k, Array.isArray(v) ? v.join('; ') : k.endsWith('At') ? new Date(v).toISOString() : v]);
const featName = (f) => f.props.label || f.props.address || f.category;
function kmlColor(hex, alpha = 'ff') { const h6 = hex.replace('#', ''); return alpha + h6.slice(4, 6) + h6.slice(2, 4) + h6.slice(0, 2); }

function toKML(feats, withTrack) {
  const styles = new Map();
  const pm = feats.map((f) => {
    const c = catOf(f), sid = 's' + (styles.size + 1);
    if (!styles.has(c.id)) styles.set(c.id, { id: sid, color: c.color, kind: f.kind });
    const st = styles.get(c.id).id;
    const g = f.geometry;
    const coords = (arr) => arr.map(([x, y]) => `${x},${y}`).join(' ');
    const geom = g.type === 'Point' ? `<Point><coordinates>${g.coordinates[0]},${g.coordinates[1]}${f.props.elevFt != null ? ',' + (f.props.elevFt / 3.28084).toFixed(1) : ''}</coordinates></Point>`
      : g.type === 'LineString' ? `<LineString><tessellate>1</tessellate><coordinates>${coords(g.coordinates)}</coordinates></LineString>`
      : `<Polygon><outerBoundaryIs><LinearRing><coordinates>${coords(g.coordinates[0])}</coordinates></LinearRing></outerBoundaryIs></Polygon>`;
    const data = [['category', f.category], ...flatProps(f.props)].map(([k, v]) => `<Data name="${xml(k)}"><value>${xml(v)}</value></Data>`).join('');
    return `<Placemark><name>${xml(featName(f))}</name><description>${xml(f.props.notes || f.category)}</description><styleUrl>#${st}</styleUrl><ExtendedData>${data}</ExtendedData>${geom}</Placemark>`;
  });
  if (withTrack && S.track?.points.length > 1) {
    pm.push(`<Placemark><name>My GPS track</name><styleUrl>#track</styleUrl><LineString><tessellate>1</tessellate><coordinates>${S.track.points.map(([la, ln]) => `${ln},${la}`).join(' ')}</coordinates></LineString></Placemark>`);
  }
  const st = [...styles.values()].map((s) => `<Style id="${s.id}"><IconStyle><color>${kmlColor(s.color)}</color><scale>1.1</scale></IconStyle><LineStyle><color>${kmlColor(s.color)}</color><width>3</width></LineStyle><PolyStyle><color>${kmlColor(s.color, '55')}</color></PolyStyle></Style>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>FireLine Field ${stamp()}</name>${st}<Style id="track"><LineStyle><color>ff3b3bff</color><width>3</width></LineStyle></Style>${pm.join('\n')}</Document></kml>`;
}
function toGPX(feats, withTrack) {
  const wpts = [], trks = [];
  for (const f of feats) {
    const g = f.geometry, name = xml(featName(f)), desc = xml([f.category, f.props.notes].filter(Boolean).join(' — '));
    if (g.type === 'Point') {
      wpts.push(`<wpt lat="${g.coordinates[1]}" lon="${g.coordinates[0]}">${f.props.elevFt != null ? `<ele>${(f.props.elevFt / 3.28084).toFixed(1)}</ele>` : ''}${f.props.createdAt ? `<time>${new Date(f.props.createdAt).toISOString()}</time>` : ''}<name>${name}</name><desc>${desc}</desc><type>${xml(f.category)}</type></wpt>`);
    } else {
      const ring = g.type === 'LineString' ? g.coordinates : g.coordinates[0];
      trks.push(`<trk><name>${name}</name><desc>${desc}</desc><type>${xml(f.category)}</type><trkseg>${ring.map(([x, y]) => `<trkpt lat="${y}" lon="${x}"/>`).join('')}</trkseg></trk>`);
    }
  }
  if (withTrack && S.track?.points.length > 1) {
    trks.push(`<trk><name>My GPS track</name><trkseg>${S.track.points.map(([la, ln, t]) => `<trkpt lat="${la}" lon="${ln}"><time>${new Date(t).toISOString()}</time></trkpt>`).join('')}</trkseg></trk>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="FireLine Field" xmlns="http://www.topografix.com/GPX/1/1">\n${wpts.join('\n')}\n${trks.join('\n')}\n</gpx>`;
}
function toCSV(feats) {
  const pts = feats.filter((f) => f.geometry.type === 'Point');
  const cols = ['name', 'category', 'lat', 'lon', 'ddm', 'elev_ft', 'notes', 'by', 'created',
    'status', 'structureType', 'roof', 'space', 'access', 'water', 'hazards', 'residents'];
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = pts.map((f) => {
    const [lng, lat] = f.geometry.coordinates, p = f.props;
    return [featName(f), f.category, lat, lng, ddm(lat, lng), p.elevFt != null ? Math.round(p.elevFt) : '', p.notes, p.by, fmtDate(p.createdAt),
      p.status, p.structureType, p.roof, p.space, p.access, p.water, (p.hazards || []).join('; '), p.residents].map(q).join(',');
  });
  return [cols.join(','), ...rows].join('\n');
}
function buildExport(fmt, what, withTrack) {
  const feats = pickFeatures(what);
  const base = `fireline-${what === 'all' || what === 'notes' ? what : what.split(':')[1].toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${stamp()}`;
  if (fmt === 'tak') return { name: base + '-tak.zip', type: 'application/zip', text: toTAK(feats, withTrack), n: feats.length };
  if (fmt === 'kml') return { name: base + '.kml', type: 'application/vnd.google-earth.kml+xml', text: toKML(feats, withTrack), n: feats.length };
  if (fmt === 'gpx') return { name: base + '.gpx', type: 'application/gpx+xml', text: toGPX(feats, withTrack), n: feats.length };
  if (fmt === 'csv') return { name: base + '.csv', type: 'text/csv', text: toCSV(feats), n: feats.filter((f) => f.geometry.type === 'Point').length };
  const gj = toGeoJSON(feats);
  return { name: base + '.geojson', type: 'application/geo+json', text: JSON.stringify(gj, null, 1), n: feats.length };
}

// ---------------------------------------------------------------- night mode (red light)
function setNight(on) {
  document.documentElement.classList.toggle('night', on);
  localStorage.setItem('night', on ? '1' : '0');
  $('#night-btn').classList.toggle('on', on);
  document.querySelector('meta[name=theme-color]').content = on ? '#000000' : '#0a0606';
}
$('#night-btn').onclick = () => setNight(!document.documentElement.classList.contains('night'));

// ---------------------------------------------------------------- weather (NWS, public domain)
const RFW_TYPES = ['Red Flag Warning', 'Fire Weather Watch', 'Extreme Fire Danger', 'Fire Warning'];
const RFW_COLORS = { 'Red Flag Warning': '#ff1493', 'Fire Weather Watch': '#ffb347', 'Extreme Fire Danger': '#e9967a', 'Fire Warning': '#a0522d' };
// Test hook: ?wxtest adds wind alerts so the layer can be checked when no red flags are active.
if (/[?&]wxtest/.test(location.search)) RFW_TYPES.push('Wind Advisory', 'High Wind Warning');

function inRing(pt, ring) { // ray casting, ring = [[lng,lat],...]
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inGeom(pt, g) {
  if (!g) return false;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  return polys.some((p) => inRing(pt, p[0]) && !p.slice(1).some((hole) => inRing(pt, hole)));
}
function rfwAt(lat, lng) {
  return (S.rfwData?.features || []).filter((f) => inGeom([lng, lat], f.geometry)).map((f) => f.properties.prod_type);
}
function checkRfwBanner() {
  const el = $('#rfw-banner'); if (!el) return;
  const hits = S.me ? [...new Set(rfwAt(S.me.lat, S.me.lng))] : [];
  el.classList.toggle('hidden', !hits.length);
  if (hits.length) el.textContent = '⚠ ' + hits.join(' · ').toUpperCase() + ' AT YOUR LOCATION';
}
async function refreshRedFlags() {
  const where = `prod_type IN (${RFW_TYPES.map((t) => `'${t}'`).join(',')})`;
  const gj = await fetchLayer('red flag warnings', SVC.wwa, new URLSearchParams({ where, outFields: 'prod_type,issuance,expiration,ends,url,wfo', f: 'geojson',
    outSR: '4326', geometryPrecision: '4', maxAllowableOffset: '0.005', resultRecordCount: '2000' }));
  if (!gj) return;
  S.rfwData = gj; G.redflag.clearLayers().addData(gj); checkRfwBanner();
}
function wwaPopup(p) {
  const t = (v) => (v && v.trim() ? new Date(v).toLocaleString() : '');
  return `<h4>${esc(p.prod_type)}</h4><table>
    <tr><td>Issued</td><td>${esc(t(p.issuance))}</td></tr>
    <tr><td>Until</td><td>${esc(t(p.ends) || t(p.expiration))}</td></tr>
    <tr><td>Office</td><td>NWS ${esc(p.wfo)}</td></tr></table>
    ${p.url ? `<div class="btns"><a class="btn" href="${esc(p.url)}" target="_blank" rel="noopener">Full NWS text</a></div>` : ''}`;
}

const dirs16 = (d) => CARD[Math.round(((d % 360) + 360) % 360 / 22.5) % 16];
async function getWeather(lat, lng) {
  const key = 'wx:' + lat.toFixed(2) + ',' + lng.toFixed(2);
  try {
    const opt = { signal: timeoutSignal(20000), headers: { Accept: 'application/geo+json' } };
    const pt = await (await fetch(`https://api.weather.gov/points/${lat.toFixed(4)},${lng.toFixed(4)}`, opt)).json();
    if (!pt.properties) throw new Error(pt.detail || 'Outside NWS coverage (US only)');
    const [hourly, daily, alerts] = await Promise.all([
      fetch(pt.properties.forecastHourly, opt).then((r) => r.json()),
      fetch(pt.properties.forecast, opt).then((r) => r.json()),
      fetch(`https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lng.toFixed(4)}`, opt).then((r) => r.json()).catch(() => ({ features: [] })),
    ]);
    const wx = {
      at: Date.now(), place: [pt.properties.relativeLocation?.properties?.city, pt.properties.relativeLocation?.properties?.state].filter(Boolean).join(', '),
      office: pt.properties.gridId,
      hours: (hourly.properties?.periods || []).slice(0, 18).map((p) => ({ t: p.startTime, temp: p.temperature, rh: p.relativeHumidity?.value,
        wind: p.windSpeed, dir: p.windDirection, pop: p.probabilityOfPrecipitation?.value, sky: p.shortForecast })),
      days: (daily.properties?.periods || []).slice(0, 4).map((p) => ({ name: p.name, text: p.detailedForecast })),
      alerts: (alerts.features || []).map((a) => ({ event: a.properties.event, headline: a.properties.headline, ends: a.properties.ends || a.properties.expires })),
    };
    DB.put('kv', wx, key).catch(() => {});
    return wx;
  } catch (err) {
    const cached = await DB.get('kv', key).catch(() => null);
    if (cached) return { ...cached, stale: true };
    throw err;
  }
}
async function showWeather(lat, lng, name) {
  showForm('Spot weather', (el) => { el.append(h(`<p class="hint">${esc(name || ddm(lat, lng))}</p><p class="hint">Loading NWS forecast…</p>`)); });
  let wx;
  try { wx = await getWeather(lat, lng); }
  catch (err) { $('#panel-body').innerHTML = `<p class="hint">${esc(name || ddm(lat, lng))}</p><p class="hint">Couldn't get weather: ${esc(err.message)}. Weather needs signal the first time for each area.</p>`; return; }
  const mph = (s) => parseInt(String(s || '').split(' ').pop(), 10) || parseInt(s, 10) || 0;
  const rows = wx.hours.map((x) => {
    const crit = x.rh != null && x.rh <= 15 && mph(x.wind) >= 20;
    return `<tr class="${crit ? 'crit' : ''}"><td>${new Date(x.t).toLocaleTimeString([], { hour: 'numeric' })}</td><td>${x.temp}°</td>
      <td class="${x.rh != null && x.rh <= 15 ? 'hot' : ''}">${x.rh ?? '—'}%</td><td class="${mph(x.wind) >= 20 ? 'hot' : ''}">${esc(x.dir)} ${esc(x.wind)}</td><td>${x.pop ?? 0}%</td></tr>`;
  }).join('');
  $('#panel-body').innerHTML = '';
  $('#panel-body').append(h(`
    <p class="hint">${esc(name || ddm(lat, lng))}${wx.place ? ` · near ${esc(wx.place)}` : ''} · NWS ${esc(wx.office)}</p>
    ${wx.stale ? `<p class="hint"><b>Offline: showing forecast saved ${fmtDate(wx.at)}</b></p>` : ''}
    ${wx.alerts.map((a) => `<div class="wx-alert ${/red flag|fire/i.test(a.event) ? 'fire' : ''}"><b>${esc(a.event)}</b><br>${esc(a.headline || '')}</div>`).join('') || '<p class="hint">No active NWS alerts here.</p>'}
    <h3>Next 18 hours</h3>
    <div class="wx-wrap"><table class="wx"><tr><th>Time</th><th>Temp</th><th>RH</th><th>Wind</th><th>Rain</th></tr>${rows}</table></div>
    <p class="hint">Highlighted: humidity ≤ 15% or wind ≥ 20 mph. Rows in red have both (red flag–type conditions).</p>
    <h3>Forecast</h3>
    ${wx.days.map((d) => `<p><b>${esc(d.name)}:</b> <span class="hint">${esc(d.text)}</span></p>`).join('')}
    <p class="hint">Source: National Weather Service. Always confirm with your incident's fire weather forecast / spot forecast.</p>`));
}

// ---------------------------------------------------------------- incident notes & photos
const incKey = (p) => p.IrwinID || p.UniqueFireIdentifier || `${p.IncidentName}|${p.POOState}`;
function noteCount(key) { return S.notes.filter((n) => n.incident === key).length; }
function incidentIcon(p) {
  const n = noteCount(incKey(p));
  return n ? L.divIcon({ className: 'fire-pin', html: FLAME + `<b class="note-badge">${n}</b>`, iconSize: [22, 22], iconAnchor: [11, 18] }) : fireIcon;
}
function refreshIncidentIcons() { G.incidents.eachLayer((l) => l.feature && l.setIcon(incidentIcon(l.feature.properties))); }
function openIncidentNotes(key, keepScroll) {
  S.openNotesKey = key; const scroll = keepScroll ? $('#panel-body').scrollTop : 0;
  const f = (S.incidentsData?.gj.features || []).find((x) => incKey(x.properties) === key);
  const name = f?.properties.IncidentName || S.notes.find((n) => n.incident === key)?.incidentName || 'Incident';
  map.closePopup();
  showForm(`${name}: notes`, (el) => {
    const list = S.notes.filter((n) => n.incident === key).sort((a, b) => b.at - a.at);
    el.append(h(`
      <p class="hint">Add updates, observations or photos. Each entry is timestamped and signed. Earlier entries are kept, and new ones are added on top.</p>
      <label class="f">New note<textarea id="in-text" placeholder="e.g. Spotting across Hwy 21 at the ridge, crew pulled back to DP 4"></textarea></label>
      <label class="f">Photo<input type="file" id="in-photo" accept="image/*" capture="environment"></label>
      <img id="in-prev" class="photo-prev hidden" alt="">
      <div class="btns"><button class="btn primary" id="in-add">Add note</button></div>
      <h3>Log: ${list.length} ${list.length === 1 ? 'entry' : 'entries'}</h3>
      ${list.map((n) => `<div class="note">
          <div class="note-head"><b>${esc(new Date(n.at).toLocaleString())}</b><span>${esc(n.by || '')}</span></div>
          ${n.text ? `<div class="note-text">${esc(n.text)}</div>` : ''}
          ${n.photo ? `<img class="photo-prev" src="${n.photo}" alt="Note photo">` : ''}
          ${n.by === localStorage.getItem('by') ? `<button class="btn danger note-del" data-note-del="${n.id}">Delete</button>` : ''}
        </div>`).join('') || '<p class="hint">No notes yet. Be the first.</p>'}
      <p class="hint">${SYNC.room ? `Shared live with <b>${esc(SYNC.room.name)}</b>. New notes from your crew appear here automatically.` : 'Saved on this phone. Join a room (Data ▸ Live team sharing) to share notes live with your crew, or export them from Data ▸ Export ▸ “Incident notes”.'}</p>`));
    if (scroll) $('#panel-body').scrollTop = scroll;
    let photo = '';
    $('#in-photo', el).onchange = async (e) => { const file = e.target.files[0]; if (!file) return; photo = await shrinkImage(file, 1000); const p = $('#in-prev', el); p.src = photo; p.classList.remove('hidden'); };
    $('#in-add', el).onclick = async () => {
      const text = $('#in-text', el).value.trim();
      if (!text && !photo) return toast('Write a note or add a photo');
      const [lng, lat] = f ? f.geometry.coordinates : [null, null];
      const note = { id: uid(), incident: key, incidentName: name, lat, lng, at: Date.now(), by: localStorage.getItem('by') || '', text, photo };
      await DB.put('notes', note); S.notes.push(note); syncNote(note); refreshIncidentIcons();
      toast('Note added'); openIncidentNotes(key);
    };
    el.querySelectorAll('[data-note-del]').forEach((b) => (b.onclick = async () => {
      if (!confirm('Delete this note?')) return;
      const gone = S.notes.find((n) => n.id === b.dataset.noteDel); if (gone) unsyncNote(gone);
      await DB.del('notes', b.dataset.noteDel); S.notes = S.notes.filter((n) => n.id !== b.dataset.noteDel);
      refreshIncidentIcons(); openIncidentNotes(key);
    }));
  });
}
function notesAsFeatures() {
  return S.notes.filter((n) => n.lat != null).map((n) => ({ id: n.id, kind: 'point', category: 'Incident note',
    geometry: { type: 'Point', coordinates: [n.lng, n.lat] },
    props: { label: `${n.incidentName}: ${new Date(n.at).toLocaleString()}`, notes: n.text, by: n.by, createdAt: n.at, incident: n.incidentName } }));
}

// ---------------------------------------------------------------- TAK data package (ATAK / iTAK / WinTAK)
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function zipStore(files) { // minimal ZIP writer, no compression (TAK reads it fine)
  const enc = new TextEncoder(), parts = [], central = []; let off = 0;
  for (const f of files) {
    const name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(8, 0, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true);
    parts.push(new Uint8Array(lh.buffer), name, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true); ch.setUint32(42, off, true);
    central.push(new Uint8Array(ch.buffer), name);
    off += 30 + name.length + data.length;
  }
  const csize = central.reduce((s, a) => s + a.length, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, csize, true); end.setUint32(16, off, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)], out = new Uint8Array(all.reduce((s, a) => s + a.length, 0));
  let p = 0; for (const a of all) { out.set(a, p); p += a.length; }
  return out;
}
function argb(hex) { const v = parseInt(hex.replace('#', ''), 16); return ((0xff << 24) | v) | 0; } // signed int, as TAK expects
function toTAK(feats, withTrack) {
  const now = new Date(), stale = new Date(now.getTime() + 365 * 864e5), iso = (d) => d.toISOString();
  const pts = feats.filter((f) => f.geometry.type === 'Point'), shapes = feats.filter((f) => f.geometry.type !== 'Point');
  const files = [], contents = [];
  for (const f of pts) {
    const [lng, lat] = f.geometry.coordinates, color = argb(catOf(f).color), id = 'fireline-' + f.id;
    const hae = f.props.elevFt != null ? (f.props.elevFt / 3.28084).toFixed(1) : '9999999.0';
    const remarks = [f.category, f.props.notes, f.props.address, f.props.status, f.props.by && 'By ' + f.props.by].filter(Boolean).join(' | ');
    files.push({ name: `${id}/${id}.cot`, data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<event version="2.0" uid="${id}" type="b-m-p-s-m" time="${iso(now)}" start="${iso(now)}" stale="${iso(stale)}" how="h-g-i-g-o">
<point lat="${lat}" lon="${lng}" hae="${hae}" ce="9999999.0" le="9999999.0"/>
<detail><contact callsign="${xml(featName(f))}"/><remarks>${xml(remarks)}</remarks><color argb="${color}"/><usericon iconsetpath="COT_MAPPING_SPOTMAP/b-m-p-s-m/${color}"/><archive/><precisionlocation altsrc="DTED0"/></detail>
</event>` });
    contents.push(`<Content ignore="false" zipEntry="${id}/${id}.cot"><Parameter name="uid" value="${id}"/></Content>`);
  }
  if (shapes.length || (withTrack && S.track?.points.length > 1)) {
    files.push({ name: 'fireline-lines-areas.kml', data: toKML(shapes, withTrack) });
    contents.push('<Content ignore="false" zipEntry="fireline-lines-areas.kml"/>');
  }
  const pkg = 'fireline-' + uid();
  files.unshift({ name: 'MANIFEST/manifest.xml', data: `<MissionPackageManifest version="2">
<Configuration><Parameter name="uid" value="${pkg}"/><Parameter name="name" value="FireLine Field ${stamp()}"/><Parameter name="onReceiveDelete" value="false"/></Configuration>
<Contents>${contents.join('')}</Contents>
</MissionPackageManifest>` });
  return zipStore(files);
}

// ---------------------------------------------------------------- live team sharing (Firebase)
// Phones join a "room" (an incident or crew) with a share code. Markers, lines, areas, triage and
// incident notes sync live. Firestore's offline cache queues changes made with no signal and sends
// them when coverage returns. Sign-in is anonymous per device; the person's name comes from crew sign-in.
const FB_V = '10.14.1';
const FB_URL = (m) => `https://www.gstatic.com/firebasejs/${FB_V}/firebase-${m}.js`;
const SYNC = { fb: null, room: null, unsub: [], members: [], pending: false, fromCache: true, lastError: '' };

async function fbInit() {
  if (SYNC.fb) return SYNC.fb;
  const cfg = window.FIRELINE_FIREBASE;
  if (!cfg) throw new Error('Live sharing is not set up yet');
  const [appM, authM, fs] = await Promise.all([import(FB_URL('app')), import(FB_URL('auth')), import(FB_URL('firestore'))]);
  const app = appM.initializeApp(cfg);
  const auth = authM.getAuth(app);
  let db;
  // Long polling: slower to set up than streaming in theory, but reliable on agency networks, proxies and
  // flaky cell links, and avoids a slow first sync while the SDK probes the connection.
  try { db = fs.initializeFirestore(app, { experimentalForceLongPolling: true, localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) }); }
  catch { db = fs.getFirestore(app); }
  await auth.authStateReady();
  if (!auth.currentUser) await authM.signInAnonymously(auth);
  SYNC.fb = { auth, db, fs, uid: auth.currentUser.uid };
  return SYNC.fb;
}
const ROOM_ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function newRoomCode() {
  const r = crypto.getRandomValues(new Uint8Array(16));
  return [...r].map((b) => ROOM_ALPHA[b % ROOM_ALPHA.length]).join('');
}
const prettyCode = (c) => c.match(/.{1,4}/g).join('-');
const cleanCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const joinLink = (c) => `${location.origin}${location.pathname}?join=${c}`;
const me = () => ({ name: S.session?.name || '', crew: S.session?.crew || '', by: localStorage.getItem('by') || '' });

function featToDoc(f) {
  return { kind: f.kind, category: f.category, geometry: JSON.stringify(f.geometry), props: f.props || {},
    updatedAt: f.props?.updatedAt || f.props?.createdAt || Date.now(), updatedBy: SYNC.fb.uid, deviceBy: me().by };
}
function docToFeat(id, d) {
  return { id, kind: d.kind, category: d.category, geometry: JSON.parse(d.geometry), props: d.props || {}, room: SYNC.room?.id };
}
function noteToDoc(n) { const { room, ...rest } = n; return { ...rest, updatedAt: n.at, updatedBy: SYNC.fb.uid }; }

async function createRoom(name) {
  const { db, fs, uid } = await fbInit();
  const id = newRoomCode();
  const batch = fs.writeBatch(db);
  batch.set(fs.doc(db, 'rooms', id), { name, createdBy: uid, createdAt: fs.serverTimestamp(), creatorName: me().by });
  batch.set(fs.doc(db, 'rooms', id, 'members', uid), { ...me(), joinedAt: fs.serverTimestamp() });
  await batch.commit();
  await activateRoom({ id, name, owner: true });
  return id;
}
async function joinRoom(code) {
  const id = cleanCode(code);
  if (id.length < 12) throw new Error('That share code looks too short');
  const { db, fs, uid } = await fbInit();
  await fs.setDoc(fs.doc(db, 'rooms', id, 'members', uid), { ...me(), joinedAt: fs.serverTimestamp() });
  const snap = await fs.getDoc(fs.doc(db, 'rooms', id));
  if (!snap.exists()) { await fs.deleteDoc(fs.doc(db, 'rooms', id, 'members', uid)).catch(() => {}); throw new Error('No room with that code'); }
  await activateRoom({ id, name: snap.data().name, owner: snap.data().createdBy === uid });
}
async function leaveRoom() {
  if (!SYNC.room) return;
  const { db, fs, uid } = SYNC.fb;
  const id = SYNC.room.id;
  stopRoom();
  localStorage.removeItem('room');
  fs.deleteDoc(fs.doc(db, 'rooms', id, 'members', uid)).catch(() => {});
  // Shared items stay on this phone as your own copies.
  for (const f of S.features) if (f.room === id) { delete f.room; DB.put('features', f); }
  for (const n of S.notes) if (n.room === id) { delete n.room; DB.put('notes', n); }
  updateSyncPill();
}
function stopRoom() { SYNC.unsub.forEach((u) => u()); SYNC.unsub = []; SYNC.room = null; SYNC.members = []; }

async function activateRoom(room) {
  const { db, fs } = await fbInit();
  stopRoom();
  SYNC.room = room; localStorage.setItem('room', JSON.stringify(room));
  updateSyncPill();
  const col = (c) => fs.collection(db, 'rooms', room.id, c);
  const onErr = (err) => {
    if (err.code === 'permission-denied' && SYNC.room?.id === room.id) {
      // removed from the room (or it was deleted): stop syncing, keep local copies
      toast(`You no longer have access to "${room.name}". Your copies stay on this phone.`, 6000);
      leaveRoom(); return;
    }
    SYNC.lastError = err.message; updateSyncPill(); console.error('sync', err);
  };

  SYNC.unsub.push(fs.onSnapshot(col('features'), { includeMetadataChanges: true }, async (snap) => {
    SYNC.pending = snap.metadata.hasPendingWrites; SYNC.fromCache = snap.metadata.fromCache; SYNC.lastError = '';
    let changed = false;
    for (const ch of snap.docChanges()) {
      if (ch.type === 'removed') {
        if (S.features.some((f) => f.id === ch.doc.id)) {
          S.features = S.features.filter((f) => f.id !== ch.doc.id); await DB.del('features', ch.doc.id); changed = true;
        }
        continue;
      }
      const f = docToFeat(ch.doc.id, ch.doc.data());
      const i = S.features.findIndex((x) => x.id === f.id);
      const localT = i >= 0 ? (S.features[i].props.updatedAt || S.features[i].props.createdAt || 0) : -1;
      if (i < 0 || (f.props.updatedAt || f.props.createdAt || 0) >= localT) {
        if (i >= 0) S.features[i] = f; else S.features.push(f);
        await DB.put('features', f); changed = true;
      }
    }
    if (changed) { renderMine(); if (openKey === 'triage' || openKey === 'data') { const k = openKey; openKey = null; openPanel(k); } }
    updateSyncPill();
  }, onErr));

  SYNC.unsub.push(fs.onSnapshot(col('notes'), async (snap) => {
    let changed = false;
    for (const ch of snap.docChanges()) {
      if (ch.type === 'removed') { S.notes = S.notes.filter((n) => n.id !== ch.doc.id); await DB.del('notes', ch.doc.id); changed = true; continue; }
      const { updatedAt, updatedBy, ...n } = ch.doc.data();
      const note = { ...n, id: ch.doc.id, room: room.id };
      const i = S.notes.findIndex((x) => x.id === note.id);
      if (i >= 0) S.notes[i] = note; else S.notes.push(note);
      await DB.put('notes', note); changed = true;
    }
    if (changed) { refreshIncidentIcons(); if (S.openNotesKey && openKey === '__form') openIncidentNotes(S.openNotesKey, true); }
  }, onErr));

  SYNC.unsub.push(fs.onSnapshot(col('members'), (snap) => {
    SYNC.members = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
    updateSyncPill();
    if (openKey === 'data') { openKey = null; openPanel('data'); }
  }, onErr));
}

// Called after local saves/deletes; Firestore queues these when offline.
function syncFeature(f) {
  if (!SYNC.room || !SYNC.fb) return;
  if (f.room && f.room !== SYNC.room.id) return; // belongs to another room
  f.room = SYNC.room.id; DB.put('features', f);
  const { db, fs } = SYNC.fb;
  fs.setDoc(fs.doc(db, 'rooms', SYNC.room.id, 'features', f.id), featToDoc(f)).catch((e) => { SYNC.lastError = e.message; updateSyncPill(); });
}
function unsyncFeature(f) {
  if (!SYNC.room || !SYNC.fb || f.room !== SYNC.room.id) return;
  const { db, fs } = SYNC.fb;
  fs.deleteDoc(fs.doc(db, 'rooms', SYNC.room.id, 'features', f.id)).catch(() => {});
}
function syncNote(n) {
  if (!SYNC.room || !SYNC.fb) return;
  n.room = SYNC.room.id; DB.put('notes', n);
  const { db, fs } = SYNC.fb;
  fs.setDoc(fs.doc(db, 'rooms', SYNC.room.id, 'notes', n.id), noteToDoc(n)).catch((e) => { SYNC.lastError = e.message; updateSyncPill(); });
}
function unsyncNote(n) {
  if (!SYNC.room || !SYNC.fb || n.room !== SYNC.room.id) return;
  const { db, fs } = SYNC.fb;
  fs.deleteDoc(fs.doc(db, 'rooms', SYNC.room.id, 'notes', n.id)).catch(() => {});
}
async function shareExisting() {
  const fs_ = S.features.filter((f) => !f.room), ns = S.notes.filter((n) => !n.room);
  if (!fs_.length && !ns.length) return toast('Nothing new to share');
  if (!confirm(`Share ${fs_.length} features and ${ns.length} incident notes from this phone with "${SYNC.room.name}"?`)) return;
  fs_.forEach(syncFeature); ns.forEach(syncNote);
  toast(`Shared ${fs_.length + ns.length} items`);
}

function updateSyncPill() {
  const el = $('#sync'); if (!el) return;
  if (!SYNC.room) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  const n = SYNC.members.length;
  if (SYNC.lastError) { el.className = 'pill bad'; el.textContent = 'SYNC ERROR'; el.title = SYNC.lastError; return; }
  if (SYNC.pending || !navigator.onLine) { el.className = 'pill off'; el.textContent = `⇅ QUEUED${n ? ' · ' + n : ''}`; el.title = 'Changes are saved and will sync when you have signal'; return; }
  el.className = 'pill'; el.textContent = `⇅ LIVE${n ? ' · ' + n : ''}`; el.title = `Sharing with ${SYNC.room.name}`;
}

function sharingSection() {
  if (!window.FIRELINE_FIREBASE) {
    return `<h3>Live team sharing</h3><p class="hint">Not set up yet. Your admin needs to add the Firebase settings (see README).</p>`;
  }
  if (!SYNC.room) {
    return `<h3>Live team sharing</h3>
      <p class="hint">Join an incident or crew room to see each other's markers, lines, triage and incident notes live. Works offline: changes sync when you get signal.</p>
      <label class="f">Join with a share code<input id="sh-code" placeholder="e.g. K7QM-3XRA-…" autocapitalize="characters"></label>
      <div class="btns"><button class="btn primary" id="sh-join">Join room</button></div>
      <label class="f">…or start a new room<input id="sh-name" placeholder="e.g. Sawtooth Fire: Div A"></label>
      <div class="btns"><button class="btn" id="sh-new">Create room</button></div>
      <div class="hint" id="sh-msg"></div>`;
  }
  const r = SYNC.room;
  return `<h3>Live team sharing</h3>
    <div class="room-card">
      <div class="room-name">${esc(r.name)}</div>
      <div class="hint">${SYNC.pending ? 'Changes queued, will sync with signal' : SYNC.fromCache ? 'Connecting…' : 'Live, all changes synced'}</div>
      <div class="room-code">${esc(prettyCode(r.id))}</div>
      <div class="btns"><button class="btn primary" id="sh-share">Invite crew…</button><button class="btn" id="sh-copy">${ICON.copy} Copy code</button></div>
    </div>
    <h3>In this room: ${SYNC.members.length}</h3>
    ${SYNC.members.map((m) => `<div class="row"><span class="grow">${esc(m.name || 'Unknown')}<small>${esc(m.crew || '')}${m.uid === SYNC.fb?.uid ? ' · you' : ''}</small></span>
      ${r.owner && m.uid !== SYNC.fb?.uid ? `<button class="btn danger" data-sh-kick="${m.uid}">Remove</button>` : ''}</div>`).join('')}
    <div class="btns"><button class="btn" id="sh-push">Share my existing data</button><button class="btn danger" id="sh-leave">Leave room</button></div>
    <p class="hint">Anyone with the code can join, so share it only with your crew. Leaving keeps a copy of everything on this phone.</p>`;
}
function wireSharing(el) {
  const msg = (t) => { const m = $('#sh-msg', el); if (m) m.textContent = t; };
  const busy = async (fn) => { try { msg('Working…'); await fn(); msg(''); openKey = null; openPanel('data'); } catch (e) { msg(e.message); toast(e.message, 5000); } };
  const j = $('#sh-join', el); if (j) j.onclick = () => busy(async () => { await joinRoom($('#sh-code', el).value); toast(`Joined ${SYNC.room.name}`); });
  const n = $('#sh-new', el); if (n) n.onclick = () => busy(async () => {
    const name = $('#sh-name', el).value.trim(); if (!name) throw new Error('Give the room a name');
    await createRoom(name); toast('Room created. Invite your crew.');
  });
  const share = $('#sh-share', el); if (share) share.onclick = async () => {
    const text = `Join "${SYNC.room.name}" on FireLine Field: ${joinLink(SYNC.room.id)}  (code ${prettyCode(SYNC.room.id)})`;
    if (navigator.share) { try { await navigator.share({ title: 'FireLine Field room', text }); } catch { /* cancelled */ } } else copyText(text);
  };
  const cp = $('#sh-copy', el); if (cp) cp.onclick = () => copyText(prettyCode(SYNC.room.id));
  const push = $('#sh-push', el); if (push) push.onclick = shareExisting;
  const leave = $('#sh-leave', el); if (leave) leave.onclick = async () => { if (confirm(`Leave "${SYNC.room.name}"?`)) { await leaveRoom(); openKey = null; openPanel('data'); } };
  el.querySelectorAll('[data-sh-kick]').forEach((b) => (b.onclick = async () => {
    if (!confirm('Remove this person from the room?')) return;
    const { db, fs } = SYNC.fb; await fs.deleteDoc(fs.doc(db, 'rooms', SYNC.room.id, 'members', b.dataset.shKick)).catch((e) => toast(e.message));
  }));
}
async function initSharing() {
  if (!window.FIRELINE_FIREBASE) return;
  const join = new URLSearchParams(location.search).get('join');
  try {
    if (join) {
      history.replaceState(null, '', location.pathname);
      if (!SYNC.room || SYNC.room.id !== cleanCode(join)) { await joinRoom(join); toast(`Joined ${SYNC.room.name}`, 4000); }
      return;
    }
    const saved = JSON.parse(localStorage.getItem('room') || 'null');
    if (saved) await activateRoom(saved);
  } catch (e) { console.error('sharing', e); toast('Live sharing: ' + e.message, 5000); }
}
addEventListener('online', updateSyncPill); addEventListener('offline', updateSyncPill);

// ---------------------------------------------------------------- misc wiring
map.on('mousemove', (e) => { $('#coords').textContent = ddm(e.latlng.lat, e.latlng.lng); });
map.on('moveend', () => { if (!matchMedia('(hover: hover)').matches) { const c = map.getCenter(); $('#coords').textContent = '⌖ ' + ddm(c.lat, c.lng); } });
function locationPopup(ll) {
  const base = `<h4>Location</h4>${ddm(ll.lat, ll.lng)}<br>${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}`;
  const pop = L.popup().setLatLng(ll).setContent(`${base}<br>Elevation: ${navigator.onLine ? 'looking up…' : 'needs signal'}
    <div class="btns">${ptButtons(ll.lat, ll.lng, ddm(ll.lat, ll.lng))}</div>`).openOn(map);
  getElevationFt(ll.lat, ll.lng).then((v) => {
    if (!pop.isOpen()) return;
    pop.setContent(`${base}<br>Elevation: <b>${v != null ? Math.round(v).toLocaleString() + ' ft' : 'n/a'}</b>
      <div class="btns">${ptButtons(ll.lat, ll.lng, ddm(ll.lat, ll.lng), v)}</div>`);
  });
}
map.on('contextmenu', (e) => { if (!S.draw) locationPopup(e.latlng); });

function setNet() { const on = navigator.onLine; $('#net').textContent = on ? 'online' : 'OFFLINE'; $('#net').className = on ? 'pill' : 'pill bad'; }
addEventListener('online', () => { setNet(); refreshNifc(); backfillElevations(); });
addEventListener('offline', setNet);

function saveSettings() {
  localStorage.setItem('settings', JSON.stringify({ basemap: S.basemap, layersOn: S.layersOn, view: [map.getCenter(), map.getZoom()] }));
}
map.on('moveend', saveSettings);

// ---------------------------------------------------------------- crew sign-in
// Casual gate only: the site is public and static, so this keeps out passers-by, not attackers.
const CFG = window.FIRELINE_CONFIG || {};
async function hashPass(pass) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(CFG.passSalt + ':' + pass));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function getSession() {
  try {
    const s = JSON.parse(localStorage.getItem('session') || 'null');
    return s && s.passHash === CFG.passHash ? s : null; // a new passcode signs everyone out
  } catch { return null; }
}
function requireLogin() {
  return new Promise((resolve) => {
    const existing = getSession();
    if (existing) return resolve(existing);
    const box = $('#login'), form = $('#login-form'), err = $('#login-err');
    form.elements.name.value = localStorage.getItem('by') || '';
    box.classList.remove('hidden');
    form.onsubmit = async (e) => {
      e.preventDefault();
      if ((await hashPass(form.elements.pass.value)) !== CFG.passHash) {
        err.classList.remove('hidden'); form.elements.pass.value = ''; form.elements.pass.focus(); return;
      }
      const s = { name: form.elements.name.value.trim(), crew: form.elements.crew.value.trim(), passHash: CFG.passHash, at: Date.now() };
      localStorage.setItem('session', JSON.stringify(s));
      localStorage.setItem('by', `${s.name} (${s.crew})`);
      form.elements.pass.value = ''; err.classList.add('hidden'); box.classList.add('hidden');
      resolve(s);
    };
  });
}
function signOut() {
  if (!confirm('Sign out? Your collected data stays on this device.')) return;
  localStorage.removeItem('session'); location.reload();
}

async function init() {
  document.querySelectorAll('[data-icon]').forEach((el) => (el.innerHTML = ICON[el.dataset.icon] || ''));
  setNight(localStorage.getItem('night') === '1');
  S.session = await requireLogin();
  try {
    const st = JSON.parse(localStorage.getItem('settings') || 'null');
    if (st) {
      if (st.basemap && BASEMAPS[st.basemap] && st.basemap !== S.basemap) setBasemap(st.basemap);
      else baseTiles(S.basemap).forEach((l, i) => l.setZIndex(i));
      for (const k of Object.keys(S.layersOn)) if (k in (st.layersOn || {}) && st.layersOn[k] !== S.layersOn[k]) {
        S.layersOn[k] = st.layersOn[k]; S.layersOn[k] ? G[k].addTo(map) : map.removeLayer(G[k]);
      }
      if (st.view) map.setView(st.view[0], st.view[1]);
    }
  } catch { /* ignore bad settings */ }
  S.features = await DB.all('features');
  S.notes = await DB.all('notes').catch(() => []);
  S.track = (await DB.get('tracks', 'current')) || null;
  renderMine(); renderTrack(); setNet(); refreshNifc();
  loadMaps().catch((e) => console.error('maps', e));
  backfillElevations();
  initSharing();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
}
init();
})();
