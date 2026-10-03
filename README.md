# Orbit Watch

A live 3D tracker for the ISS, about 12,000 satellites, the Moon, the planets, asteroids, comets and upcoming rocket launches. It runs free on GitHub Pages, and a scheduled job downloads fresh data every 3 hours, so you never update anything by hand.

## What it shows

- **Globe**: every active satellite, colored by type (stations, Starlink, GPS, weather, geostationary and more), on a real NASA image of Earth from yesterday, with day and night and city lights.
- **Map**: a flat world map with the selected satellite's ground track, the area it can see, and the night side.
- **Solar system**: planets, Pluto, famous asteroids, comets, comets currently near the Sun, and asteroids about to pass close to Earth.
- **Passes over you**: when a satellite will fly over your location and whether you'll be able to see it.
- **Flybys**: asteroids passing within about 19 Moon distances of Earth in the next 60 days.
- **Launches**: the next 15 rocket launches worldwide, with countdowns and launch sites on the globe and map.

## Setup (about 10 minutes, no coding)

**Cost:** GitHub Pages and GitHub Actions are free for **public** repositories. The repository must be public; a private one would need a paid plan for Pages.

### 1. Create the repository
1. Sign in at github.com and go to **github.com/new**.
2. Repository name: `orbit-watch` (any name works; it becomes part of your web address).
3. Choose **Public**. Leave every "Add…" box unticked.
4. Click **Create repository**.

### 2. Upload the files
1. On the new, empty repository page, click the link **uploading an existing file**.
2. Open the unzipped `orbit-watch` folder on your computer. Select **everything inside it** (`site`, `scripts`, `setup`, `README.md`) and drag it into the browser.
3. Wait for the files to finish uploading, then click **Commit changes**.

### 3. Add the automatic updater
The updater lives in a hidden folder (`.github`) that your computer probably didn't upload, so create it by hand:
1. In the repository, click **Add file → Create new file**.
2. In the name box, type exactly: `.github/workflows/update.yml` (typing the slashes creates the folders).
3. Open `setup/update.yml` in the repository (or on your computer), copy all of its text, and paste it into the big editor box.
4. Click **Commit changes…**, then **Commit changes** again.

### 4. Turn on GitHub Pages
1. Click **Settings** (top of the repository), then **Pages** in the left menu.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.

### 5. Run the first update
1. Click the **Actions** tab. If GitHub asks you to enable workflows, click the green button to enable them.
2. Click **Update data and publish** on the left, then **Run workflow → Run workflow**.
3. Wait 2–4 minutes until the run shows a green check. (A red X on an earlier run from step 3 is normal; it ran before Pages was turned on.)

### 6. Open your tracker
Your site is at **`https://YOUR-USERNAME.github.io/orbit-watch/`**. The exact link is also shown at **Settings → Pages**. Bookmark it, and it works on your phone too.

From now on the data refreshes every 3 hours by itself. An open page also picks up new data on its own within 15 minutes.

## Good to know

- **Accuracy.** Satellite positions come from orbit data that is at most a few hours old, the same source professional trackers use. The ISS is typically accurate to within a few kilometers. Planets use the Astronomy Engine model (under an arcminute). Asteroids and comets use JPL's latest orbits.
- **If a source is down**, the updater keeps the last good copy, and the top-right corner of the page shows how old the data is (green under 6 hours, amber under 30 hours, red older).
- **60-day pause.** GitHub pauses scheduled jobs in public repositories after 60 days without any change to the repository. GitHub emails you first. To restart, open the Actions tab and click **Enable workflow**, or make any small edit to the repository.
- **Check on the updater** any time in the **Actions** tab. Click a run to see the log, including which sources succeeded.
- **Preview on your own computer:** in the `site` folder run `python3 -m http.server`, then open http://localhost:8000. It uses whatever data is in `site/data`.

## Data sources

| Data | Source | How often |
|---|---|---|
| Satellite orbits | [CelesTrak](https://celestrak.org) (US Space Force data) | every 3 h |
| Asteroids and comets | [NASA JPL Small-Body Database](https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html) | every 3 h |
| Close approaches | [NASA JPL CNEOS](https://cneos.jpl.nasa.gov/ca/) | every 3 h |
| Launches | [Launch Library 2](https://thespacedevs.com/llapi) by The Space Devs | every 3 h |
| Yesterday's Earth image | [NASA GIBS](https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api) (VIIRS true color) | daily |
| Planets, Moon, Sun | [Astronomy Engine](https://github.com/cosinekitty/astronomy) (computed in the page) | live |
| Base Earth textures | NASA Blue Marble and Black Marble, via the three.js examples | bundled |

Libraries bundled in `site/lib`: three.js r128, satellite.js 5.0.0, Astronomy Engine 2.1.19 (all MIT licensed).

## Files

```
site/                  the website GitHub Pages serves
  index.html, style.css, app.js
  sgp4-worker.js       computes satellite positions in the background
  lib/                 bundled libraries
  textures/            Earth day, night and ocean maps
  data/                starter data; replaced on every update
scripts/update_data.py downloads fresh data (runs inside GitHub Actions)
setup/update.yml       copy of the workflow, for step 3 above
.github/workflows/     the workflow itself (after step 3)
```
