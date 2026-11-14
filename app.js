/* FireLine Field — offline-first wildland fire field app.
 * Map + NIFC public layers, NIFS-style data collection, structure triage,
 * GPS tracking, measure tool, offline tiles, GeoJSON export/import.
 */
(() => {
'use strict';

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
  incidents: 'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Incident_Locations_Current/FeatureServer/0/query',
  perimeters: 'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters_Current/FeatureServer/0/query',
  viirs: 'https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/Satellite_VIIRS_Thermal_Hotspots_and_Fire_Activity/FeatureServer/0/query',
};

const BASEMAPS = {
  'Topo (Esri)': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    { maxZoom: 19, maxNativeZoom: 19, attribution: 'Tiles © Esri' }),
  'Imagery (Esri)': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { maxZoom: 19, maxNativeZoom: 19, attribution: 'Tiles © Esri, Maxar, Earthstar' }),
  'OpenTopoMap': L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    { maxZoom: 17, attribution: '© OpenStreetMap contributors, SRTM | © OpenTopoMap (CC-BY-SA)' }),
  'Streets (OSM)': L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    { maxZoom: 19, attribution: '© OpenStreetMap contributors' }),
};

// ---------------------------------------------------------------- state
const S = {
  basemap: 'Topo (Esri)',
  layersOn: { incidents: true, perimeters: true, viirs: false, mine: true, triage: true, track: true },
  features: [],           // my collected features (incl. triage)
  track: null,            // { id, points:[[lat,lng,t]] }
  tracking: false,
  watchId: null,
  me: null,               // last GPS fix {lat,lng,acc}
  draw: null,             // active drawing session
  incidentsData: null,
};

// ---------------------------------------------------------------- map
const map = L.map('map', { zoomControl: true, attributionControl: true }).setView([39.5, -111.5], 5);
BASEMAPS[S.basemap].addTo(map);
L.control.scale({ imperial: true, metric: true }).addTo(map);

const G = {
  perimeters: L.geoJSON(null, { style: () => ({ color: '#ff2a1a', weight: 2, fillColor: '#ff2a1a', fillOpacity: 0.15 }),
    onEachFeature: (f, l) => l.bindPopup(() => nifcPopup(f.properties, 'perimeter')) }),
  incidents: L.geoJSON(null, {
    pointToLayer: (f, ll) => L.marker(ll, { icon: L.divIcon({ className: 'fire-pin', html: '🔥', iconSize: [20, 20] }) }),
    onEachFeature: (f, l) => l.bindPopup(() => nifcPopup(f.properties, 'incident')) }),
  viirs: L.geoJSON(null, {
    pointToLayer: (f, ll) => L.circleMarker(ll, { radius: 4, color: '#ffd23f', weight: 1, fillColor: '#ff3b1a', fillOpacity: 0.9 }),
    onEachFeature: (f, l) => l.bindPopup(() => nifcPopup(f.properties, 'viirs')) }),
  mine: L.layerGroup(),
  triage: L.layerGroup(),
  track: L.layerGroup(),
  draw: L.layerGroup().addTo(map),
  me: L.layerGroup().addTo(map),
};
// stacking order: perimeters under everything
['perimeters', 'viirs', 'incidents', 'track', 'mine', 'triage'].forEach((k) => S.layersOn[k] && G[k].addTo(map));

// ---------------------------------------------------------------- helpers
const $ = (s, r = document) => r.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const fmtDate = (t) => (t ? new Date(t).toLocaleString() : '');

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
    const r = await fetch(`${url}?${params}`);
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
  if (f.kind === 'point' || f.kind === 'triage') { const [lng, lat] = f.geometry.coordinates; add('Location', ddm(lat, lng)); }
  const photo = p.photo ? `<img src="${p.photo}" style="max-width:220px;border-radius:6px;margin-top:6px">` : '';
  return `<h4>${esc(f.category)}</h4><table>${rows.join('')}</table>${photo}
    <div class="btns"><button class="btn" data-edit="${f.id}">Edit</button><button class="btn danger" data-del="${f.id}">Delete</button></div>`;
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
  if (del) {
    if (!confirm('Delete this feature?')) return;
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
  layers: { title: 'Layers', render: renderLayers },
  collect: { title: 'Collect data', render: renderCollect },
  triage: { title: 'Structure triage', render: renderTriage },
  tools: { title: 'Tools', render: renderTools },
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
    <h3>NIFC live layers (public)</h3>
    ${layerRow('incidents', 'Current incidents', 'WFIGS incident locations (IRWIN)', '<span class="fire-pin">🔥</span>')}
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
    saveSettings(); if (cb.checked) refreshNifc();
    if (k === 'viirs' && cb.checked && map.getZoom() < 6) toast('Zoom in (level 6+) to load hotspots');
  }));
  el.querySelectorAll('[name=bm]').forEach((r) => (r.onchange = () => setBasemap(r.value)));
}
function setBasemap(name) {
  map.removeLayer(BASEMAPS[S.basemap]); S.basemap = name; BASEMAPS[name].addTo(map); BASEMAPS[name].bringToBack(); saveSettings();
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

// ---- Tools
function renderTools(el) {
  el.append(h(`
    <h3>Location</h3>
    <div class="btns">
      <button class="btn ${S.watchId != null ? 'primary' : ''}" id="t-gps">${S.watchId != null ? 'GPS on' : 'Turn on GPS'}</button>
      <button class="btn" id="t-center">Center on me</button>
    </div>
    <div id="t-fix" class="hint" style="margin-top:8px">${S.me ? fixText() : 'No fix yet.'}</div>
    <h3>Track / breadcrumbs</h3>
    <p class="hint">Records your path for crew accountability and to map line as you walk it.</p>
    <div class="btns">
      <button class="btn ${S.tracking ? 'primary' : ''}" id="t-track">${S.tracking ? '■ Stop tracking' : '● Start tracking'}</button>
      <button class="btn" id="t-track2line">Save track as line…</button>
    </div>
    <div class="hint" id="t-trackinfo">${trackInfo()}</div>
    <h3>Measure</h3>
    <div class="btns">
      <button class="btn" id="t-mline">Distance</button>
      <button class="btn" id="t-marea">Area</button>
      <button class="btn" id="t-mclear">Clear</button>
    </div>
    <h3>Go to coordinates</h3>
    <input class="search" id="t-coord" placeholder="39.5123, -111.4321  or  39 30.738 N 111 25.926 W">
    <button class="btn block" id="t-go">Go</button>`));
  $('#t-gps', el).onclick = () => { S.watchId != null ? stopGps() : startGps(); openKey = null; openPanel('tools'); };
  $('#t-center', el).onclick = () => { if (S.me) map.setView(S.me, Math.max(map.getZoom(), 15)); else { startGps(); toast('Getting a fix…'); } };
  $('#t-track', el).onclick = () => { S.tracking ? stopTracking() : startTracking(); openKey = null; openPanel('tools'); };
  $('#t-track2line', el).onclick = trackToLine;
  $('#t-mline', el).onclick = () => startDraw('measure-line', 'Measure', () => {});
  $('#t-marea', el).onclick = () => startDraw('measure-area', 'Measure', () => {});
  $('#t-mclear', el).onclick = () => { cancelDraw(); toast('Cleared'); };
  $('#t-go', el).onclick = () => {
    const ll = parseCoord($('#t-coord', el).value);
    if (!ll) return toast('Could not read those coordinates');
    closePanel(); map.setView(ll, 15);
    L.popup().setLatLng(ll).setContent(`<h4>Coordinate</h4>${ddm(ll[0], ll[1])}<br>${ll[0].toFixed(5)}, ${ll[1].toFixed(5)}`).openOn(map);
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
function fixText() { return `${ddm(S.me.lat, S.me.lng)}<br>±${Math.round(S.me.acc * 3.28084)} ft${S.me.alt != null ? ` · elev ${Math.round(S.me.alt * 3.28084)} ft` : ''}`; }
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
    <h3>On this device</h3>
    <div class="row"><span class="grow">Points</span><b>${n('point')}</b></div>
    <div class="row"><span class="grow">Lines</span><b>${n('line')}</b></div>
    <div class="row"><span class="grow">Polygons</span><b>${n('polygon')}</b></div>
    <div class="row"><span class="grow">Structure assessments</span><b>${n('triage')}</b></div>
    <h3>Share & export</h3>
    <p class="hint">GeoJSON opens in ArcGIS Online / Pro, Field Maps (via AGOL), QGIS, Avenza and CalTopo. Upload to your incident's NIFS map to share with the team.</p>
    <div class="btns">
      <button class="btn primary" id="x-geo">Export GeoJSON</button>
      <button class="btn" id="x-csv">Triage CSV</button>
      <button class="btn" id="x-share">Share…</button>
      <label class="btn">Import<input type="file" id="x-imp" accept=".geojson,.json,application/geo+json" hidden></label>
    </div>
    <h3>Offline maps</h3>
    <p class="hint">Downloads basemap tiles for the area on screen (this zoom + 3 more levels) so the map works with no signal. Last-loaded NIFC layers are also kept for offline viewing.</p>
    <button class="btn block" id="x-tiles">Download this area (${S.basemap})</button>
    <div class="hint" id="x-prog"></div>
    <h3>Danger zone</h3>
    <button class="btn danger" id="x-wipe">Delete all my data</button>`));
  $('#x-geo', el).onclick = () => download(`fireline-${stamp()}.geojson`, JSON.stringify(toGeoJSON(), null, 1), 'application/geo+json');
  $('#x-csv', el).onclick = () => download(`structure-triage-${stamp()}.csv`, triageCsv(), 'text/csv');
  $('#x-share', el).onclick = shareData;
  $('#x-imp', el).onchange = importFile;
  $('#x-tiles', el).onclick = downloadTiles;
  $('#x-wipe', el).onclick = async () => {
    if (!confirm('Delete ALL collected features, triage and tracks on this device? Export first if you need them.')) return;
    await DB.clear('features'); await DB.clear('tracks'); S.features = []; S.track = null;
    renderMine(); renderTrack(); openKey = null; openPanel('data'); toast('All data deleted');
  };
}
const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
function toGeoJSON() {
  return { type: 'FeatureCollection', features: S.features.map((f) => ({ type: 'Feature', id: f.id, geometry: f.geometry,
    properties: { FeatureCategory: f.category, Kind: f.kind, ...Object.fromEntries(Object.entries(f.props).map(([k, v]) => [k, Array.isArray(v) ? v.join('; ') : v])),
      CreateDate: f.props.createdAt ? new Date(f.props.createdAt).toISOString() : null } })) };
}
function triageCsv() {
  const cols = ['address', 'category', 'status', 'structureType', 'roof', 'space', 'access', 'water', 'hazards', 'residents', 'notes', 'by', 'lat', 'lon', 'ddm', 'createdAt'];
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = S.features.filter((f) => f.kind === 'triage').map((f) => {
    const [lng, lat] = f.geometry.coordinates; const p = f.props;
    return [p.address, f.category, p.status, p.structureType, p.roof, p.space, p.access, p.water, (p.hazards || []).join('; '), p.residents, p.notes, p.by,
      lat, lng, ddm(lat, lng), fmtDate(p.createdAt)].map(q).join(',');
  });
  return [cols.join(','), ...rows].join('\n');
}
function download(name, text, type) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
async function shareData() {
  const file = new File([JSON.stringify(toGeoJSON())], `fireline-${stamp()}.geojson`, { type: 'application/geo+json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'FireLine field data' }); } catch { /* cancelled */ }
  } else { toast('Sharing not supported here — use Export instead'); }
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
  const layer = BASEMAPS[S.basemap];
  const b = map.getBounds(), z0 = map.getZoom(), zMax = Math.min(z0 + 3, layer.options.maxNativeZoom || layer.options.maxZoom);
  const urls = [];
  for (let z = z0; z <= zMax; z++) {
    const nw = map.project(b.getNorthWest(), z).divideBy(256).floor(), se = map.project(b.getSouthEast(), z).divideBy(256).floor();
    for (let x = nw.x; x <= se.x; x++) for (let y = nw.y; y <= se.y; y++) {
      urls.push(L.Util.template(layer._url, { s: 'abc'[(x + y) % 3], z, x, y, r: '' }));
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
      const p = f.properties, r = h(`<div class="row" style="cursor:pointer"><span class="fire-pin">🔥</span><span class="grow">${esc(p.IncidentName)}
        <small>${esc(p.POOState || '')} · ${p.IncidentSize != null ? esc(p.IncidentSize) + ' ac' : 'size n/a'}${p.PercentContained != null ? ' · ' + p.PercentContained + '% contained' : ''}</small></span></div>`).firstElementChild;
      r.onclick = () => { const [lng, lat] = f.geometry.coordinates; closePanel(); map.setView([lat, lng], 12);
        L.popup().setLatLng([lat, lng]).setContent(nifcPopup(p, 'incident')).openOn(map); };
      res.appendChild(r);
    });
  };
}

// ---------------------------------------------------------------- misc wiring
map.on('mousemove', (e) => { $('#coords').textContent = ddm(e.latlng.lat, e.latlng.lng); });
map.on('moveend', () => { if (!matchMedia('(hover: hover)').matches) { const c = map.getCenter(); $('#coords').textContent = '⌖ ' + ddm(c.lat, c.lng); } });
map.on('contextmenu', (e) => {
  L.popup().setLatLng(e.latlng).setContent(`<h4>Location</h4>${ddm(e.latlng.lat, e.latlng.lng)}<br>${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`).openOn(map);
});

function setNet() { const on = navigator.onLine; $('#net').textContent = on ? 'online' : 'OFFLINE'; $('#net').className = on ? 'pill' : 'pill bad'; }
addEventListener('online', () => { setNet(); refreshNifc(); });
addEventListener('offline', setNet);

function saveSettings() {
  localStorage.setItem('settings', JSON.stringify({ basemap: S.basemap, layersOn: S.layersOn, view: [map.getCenter(), map.getZoom()] }));
}
map.on('moveend', saveSettings);

async function init() {
  try {
    const st = JSON.parse(localStorage.getItem('settings') || 'null');
    if (st) {
      if (st.basemap && BASEMAPS[st.basemap] && st.basemap !== S.basemap) setBasemap(st.basemap);
      for (const k of Object.keys(S.layersOn)) if (k in (st.layersOn || {}) && st.layersOn[k] !== S.layersOn[k]) {
        S.layersOn[k] = st.layersOn[k]; S.layersOn[k] ? G[k].addTo(map) : map.removeLayer(G[k]);
      }
      if (st.view) map.setView(st.view[0], st.view[1]);
    }
  } catch { /* ignore bad settings */ }
  S.features = await DB.all('features');
  S.track = (await DB.get('tracks', 'current')) || null;
  renderMine(); renderTrack(); setNet(); refreshNifc();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
}
init();
})();
