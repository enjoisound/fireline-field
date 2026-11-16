# FireLine Field

A simple, offline-first web app for wildland firefighters. It runs in any phone or laptop browser and can be installed to the home screen (PWA).

## What it does

| Tab | Features |
|---|---|
| **Maps** | **Import GeoPDF incident maps from the IAP**: stored on the phone, work offline, show your GPS dot and markup on top, with an opacity slider. **NWS red flag warnings & fire weather watches** (nationwide, with a flashing banner if you're standing in one). Live NIFC data (public, no login): current incidents, current fire perimeters, VIIRS/MODIS hotspots (last 48 h). **Tap a fire for Notes & photos**: a timestamped, signed log anyone on the phone can add to. Basemaps: **USGS Topo** (default, free to download for offline), satellite with roads & labels, clean satellite, USGS shaded relief + streams, Esri Topo, OpenTopoMap, streets. |
| **Mark** | NIFS-style points (drop points, safety zones, helispots, water, hazards, origin…), lines (fire edge, dozer/hand line, escape routes…) and polygons (daily perimeter, heat, divisions…). Tap the map or use **+ GPS**. Shows live length in chains/feet/miles and area in acres. Every point gets its ground elevation automatically. |
| **Nav** | **Spot weather** for your location or any point: NWS alerts, an 18-hour table of temperature, humidity, wind and rain (red-flag-type hours highlighted) and the forecast; saved for offline. **Navigate to any waypoint, marker, incident or typed coordinate**: live distance, true bearing (plus magnetic if you set your declination), elevation climb/descent and average slope. Your position, accuracy, ground elevation and GPS altitude; copy your coordinates. Distance/bearing and area measuring. Breadcrumb tracking (save a walked track as a line). |
| **Triage** | Structure triage using NWCG categories (Prep and Leave, Stand Alone, Prep and Defend, Rescue Drill), plus status, roof, defensible space, access, water, hazards, residents, notes and a photo. Summary counts per category. |
| **Data** | Export **all data, one kind, or a single layer/category** (or your **incident notes**) as **KML** (Google Earth, Avenza, Gaia, CalTopo, ArcGIS), **GPX** (handheld GPS units), **GeoJSON** (ArcGIS, QGIS, NIFS), **CSV**, or a **TAK data package** (ATAK/iTAK/WinTAK: points arrive as TAK markers, lines/areas as an overlay), with or without your track. Share sheet, import GeoJSON, **download the on-screen map area for offline use**. |
| **Intel** | Incident search, plus links to FireGuard, NIFC AGOL account request, NIFC Open Data, EGP/WildFireSA, IMSR and IAA. |

Tap any marker or incident for **Navigate**, **Copy** and **Weather** (coordinates in DDM + decimal). Long-press / right-click the map anywhere for the coordinate, its elevation, Navigate and Copy.

The **moon button** (top right) switches to **red-light night mode**, which turns the whole screen, map included, dim red on black to protect night vision.

Everything you collect is stored on the device (IndexedDB), so it works with no signal. The last downloaded NIFC layers are also kept for offline viewing.

**Notes:** Weather and red flag warnings come from the National Weather Service (US only). Offline map downloads use USGS maps only (public domain); other basemaps are still remembered for areas you've viewed. Incident notes are stored on each phone until live sharing is added. Elevation comes from the USGS 3DEP elevation service (public domain, US only, needs signal; points marked offline get it filled in automatically once you're back in coverage). GeoPDF import reads the ISO/OGC georeferencing that ArcGIS and IAP map products write; older TerraGo-only GeoPDFs need re-exporting. The first GeoPDF import needs signal once to download the PDF reader.

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
