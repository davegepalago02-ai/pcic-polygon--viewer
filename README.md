# PCIC GeoRef Polygon Viewer — GitHub Pages Package

A ready-to-publish, static geographic farm-polygon viewer for **Abkir, Vintar, Ilocos Norte**. It is built from the source `Abkir-Vintar-FarmPoly_10312026_maturityNDVI_10062026.gpkg` and contains **45 polygons**.

## Features

- Farm geometry and GeoRef IDs are **hard-coded/pre-embedded** in `data/farms.js` (not uploaded at runtime).
- Uses a **true georeferenced, offline WGS84 grid basemap** (native SVG; no Google Maps, OpenStreetMap tile connection, remote scripts, or other third-party requests).
- Search by exact GeoRef ID (e.g. `R01-28-23-001-000084`), common `RO1` spelling (e.g. `RO1-28-23-001-000084`), six-digit suffix (`000084`) or numeric suffix (`84`).
- Zoom to a parcel, select/highlight, reset map extent, show/hide GeoRef ID labels, pan by dragging, zoom with the mouse wheel or buttons.
- Map labels show only the GeoRef ID: shortened to its six-digit final group at overview scale to avoid collisions, and full GeoRef IDs on closer zoom or selection. The sidebar always displays full GeoRef IDs.
- Keyboard navigation, mobile layout and a small offline cache for subsequent offline visits to a previously loaded GitHub Pages URL.
- The published data includes **only GeoRef ID and polygon coordinates**. Other attributes of the original GeoPackage are intentionally omitted.

## Publish using GitHub Pages

1. Sign in to [GitHub](https://github.com) and create a repository, for example `pcic-farm-viewer`.
2. **Unzip this package.** Upload **all extracted files and folders** to the **root** of the repository (do not upload the ZIP file itself). Keep `index.html`, `app.js`, `style.css`, `sw.js`, `favicon.svg`, `.nojekyll`, and the `data/` folder at the same relative paths. Upload the `tools/` folder only if you wish to retain the optional future data-conversion tool.
3. In the repository, open **Settings → Pages → Build and deployment**. Choose **Deploy from a branch**, choose `main` and `/(root)`, then **Save**.
4. Open `https://YOUR-USERNAME.github.io/pcic-farm-viewer/` after publishing. The page displays automatically without a file upload.

**Important privacy note:** GitHub Pages is public by default, and visitors can access the published farm IDs and geometry. Do not publish these polygons unless you are permitted to share the underlying location data. A private GitHub repository by itself does not necessarily make its published Pages website private. For access-controlled maps, use a hosting solution with authentication instead.

## Test locally before publishing

Double-click `index.html` in an extracted folder; the viewer works even without an internet connection. You can also start a test web server by running:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Replace the hard-coded GeoPackage in the future

The application **does not read `.gpkg` files in the browser**. The source GeoPackage was converted into `data/farms.js` during development. To replace it, install `geopandas` in Python and use:

```bash
python tools/convert_gpkg.py "C:/path/to/updated_farms.gpkg"
```

The script automatically converts to WGS84 and rewrites `data/farms.js`, preserving only the `Georef ID` and polygon geometry. Commit the new data file to GitHub. If the site was opened before, clear its site storage/cache or increment the version string in `sw.js` (for example `v2`) to make users download the updated file. A full repo build is **not** needed.

## Meaning of offline basemap

The background is an **accurate coordinate reference grid** with a north arrow and scale bar. It is **not** satellite imagery or a detailed street map, because neither imagery nor local road layers were included with the supplied GeoPackage. It never calls remote basemap services. If you need aerial photography or roads behind the parcels, supply authorized, georeferenced orthophotos or offline basemap tiles and they can be added locally to the bundle.

## Technical notes

- Site technology: HTML, CSS, and JavaScript with SVG. No database, PHP, Python server, Leaflet download or npm build is necessary for hosting.
- Coordinates: GeoPackage EPSG:4326, drawn with a locally scaled equirectangular projection (suitable at this small locality). Map distances/scalebar are approximate, not survey measurements.
- Polygon IDs are matched without case sensitivity, and `RO1`, `RO01`, `R1`, or `R01` prefixes are normalized to `R01`.
- All files are relative paths so the site works as a GitHub project site under a repository-name URL.
