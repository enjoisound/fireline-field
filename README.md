# FireLine Field

A simple, offline-first web app for wildland firefighters. It runs in any phone or laptop browser and can be installed to the home screen (PWA).

## What it does

| Tab | Features |
|---|---|
| **Layers** | Live NIFC data (public, no login): current incidents (WFIGS/IRWIN), current fire perimeters, VIIRS/MODIS hotspots (last 48 h). Your own data, GPS track, 4 basemaps, legend. |
| **Collect** | NIFS-style points (drop points, safety zones, helispots, water, hazards, origin…), lines (fire edge, dozer/hand line, escape routes…) and polygons (daily perimeter, heat, divisions…). Tap the map or use **+ GPS**. Shows live length in chains/feet/miles and area in acres. |
| **Triage** | Structure triage using NWCG categories (Prep and Leave, Stand Alone, Prep and Defend, Rescue Drill), plus status, roof, defensible space, access, water, hazards, residents, notes and a photo. Summary counts per category. |
| **Tools** | GPS with accuracy, breadcrumb tracking (save a walked track as a line), distance/area measure, go to coordinates (decimal or DDM). |
| **Data** | Export GeoJSON (opens in ArcGIS Online/Pro, QGIS, CalTopo, Avenza), triage CSV, share sheet, import GeoJSON, **download the on-screen map area for offline use**. |
| **Intel** | Incident search, plus links to FireGuard, NIFC AGOL account request, NIFC Open Data, EGP/WildFireSA, IMSR and IAA. |

Everything you collect is stored on the device (IndexedDB), so it works with no signal. The last downloaded NIFC layers are also kept for offline viewing. Long-press / right-click the map to read a coordinate.

## Crew sign-in

The app opens with a sign-in screen asking for name, crew/resource and a shared crew passcode. Each device stays signed in (so it opens offline), and the name is stamped on everything collected. Sign out is under **Data**.

To change the passcode (this signs everyone out):

```bash
python set_passcode.py "new-passcode"
```

Then commit and push. Only a salted hash is stored in `config.js`. **This is a casual gate, not real security:** the site and its code are public, so a determined person can get past it. Don't put anything sensitive in the app on the strength of the passcode alone.

## Run it

Service workers need a web server (not `file://`). From this folder:

```bash
python -m http.server 8080
```

Then open http://localhost:8080. To use it on a phone, host the folder on any HTTPS static host (GitHub Pages, Netlify, an agency web server) and "Add to Home Screen". GPS and offline mode require HTTPS on phones.

## Limits

- **FireGuard, NIFS editing and the National Structure Triage layer** need a NIFC ArcGIS Online login, so this public app can't read or write them. Export GeoJSON here and load it into your NIFC org / Field Maps map to share with the incident.
- Basemap tile downloads are capped at 2,500 tiles per area. Check each tile provider's terms before bulk caching for an operation.
- GPS tracking only records while the app is open (browser limitation).

## Files

`index.html` (layout) · `styles.css` · `app.js` (all app logic) · `db.js` (on-device storage) · `sw.js` (offline cache) · `manifest.webmanifest`, `icon.svg` (installable app).
