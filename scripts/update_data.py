#!/usr/bin/env python3
"""
Orbit Watch data updater.

Downloads fresh orbit and event data and writes it into site/data/ so the
GitHub Pages site always serves current numbers. Runs inside GitHub Actions
every few hours (see .github/workflows/update.yml). Standard library only.

Sources
  CelesTrak            satellite orbits (two-line element sets)
  JPL SBDB             asteroid and comet orbits
  JPL SBDB query       comets currently near the Sun
  JPL CNEOS CAD        asteroids passing close to Earth in the next 60 days
  Launch Library 2     upcoming rocket launches
  NASA GIBS            yesterday's real satellite images of Earth, and night lights

If a source fails, the script keeps the previously published file (it
downloads it back from the live site) so one outage never blanks the map.
"""
import datetime as dt
import json
import os
import sys
import time
import urllib.parse
import urllib.request

OUT = sys.argv[1] if len(sys.argv) > 1 else "site/data"
SITE_URL = os.environ.get("SITE_URL", "").rstrip("/")
UA = "OrbitWatch/2.0 (personal tracker on GitHub Pages)"
NOW = dt.datetime.now(dt.timezone.utc)
STATUS = {}


def log(*a):
    print(*a, flush=True)


def get(url, timeout=90, tries=3):
    last = None
    for k in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            last = e
            log(f"  retry {k + 1}/{tries} for {url[:90]}: {e}")
            time.sleep(4 * (k + 1))
    raise last


def write(rel, data):
    path = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    mode = "wb" if isinstance(data, bytes) else "w"
    with open(path, mode) as f:
        f.write(data)


def keep_previous(rel):
    """Fall back to the copy currently live on the site, if there is one."""
    if not SITE_URL:
        return False
    try:
        data = get(f"{SITE_URL}/data/{rel}", tries=1)
        write(rel, data)
        log(f"  kept previous {rel} from live site")
        return True
    except Exception as e:  # noqa: BLE001
        log(f"  no previous {rel}: {e}")
        return False


def jd_now():
    return NOW.timestamp() / 86400 + 2440587.5


# ---------------------------------------------------------------- satellites
CELESTRAK = "https://celestrak.org/NORAD/elements/gp.php?GROUP={}&FORMAT=tle"
# Groups used only to colour satellites by type (we keep their NORAD ids).
TAG_GROUPS = ["stations", "visual", "starlink", "oneweb", "kuiper", "gnss",
              "weather", "geo", "science", "last-30-days"]
# Debris clouds are not in "active", so they get their own files.
DEBRIS_GROUPS = ["fengyun-1c-debris", "cosmos-2251-debris", "iridium-33-debris",
                 "cosmos-1408-debris"]


def count_tle(text):
    return sum(1 for ln in text.splitlines() if ln.startswith("1 "))


def ids_from_tle(text):
    return [ln[2:7].strip() for ln in text.splitlines() if ln.startswith("1 ")]


def fetch_tle(group):
    text = get(CELESTRAK.format(group)).decode("utf-8", "replace")
    if count_tle(text) == 0:
        raise ValueError(f"no TLEs in response: {text[:120]!r}")
    return text


def update_satellites():
    # Everything active, in one file.
    try:
        text = fetch_tle("active")
        if count_tle(text) < 1000:
            raise ValueError(f"only {count_tle(text)} satellites, expected thousands")
        write("tle/active.txt", text)
        STATUS["satellites"] = {"ok": True, "count": count_tle(text)}
        log(f"active: {count_tle(text)} satellites")
    except Exception as e:  # noqa: BLE001
        STATUS["satellites"] = {"ok": False, "error": str(e)[:200]}
        keep_previous("tle/active.txt")

    groups = {}
    for g in TAG_GROUPS:
        try:
            text = fetch_tle(g)
            groups[g] = ids_from_tle(text)
            if g == "stations":  # small file the page loads first
                write("tle/stations.txt", text)
            log(f"{g}: {len(groups[g])}")
        except Exception as e:  # noqa: BLE001
            log(f"{g}: failed ({e})")
        time.sleep(1)
    if groups:
        write("groups.json", json.dumps(groups, separators=(",", ":")))
    else:
        keep_previous("groups.json")

    debris_ok = 0
    for g in DEBRIS_GROUPS:
        try:
            write(f"tle/{g}.txt", fetch_tle(g))
            debris_ok += 1
        except Exception as e:  # noqa: BLE001
            log(f"{g}: failed ({e})")
            keep_previous(f"tle/{g}.txt")
        time.sleep(1)
    STATUS["debris"] = {"ok": debris_ok == len(DEBRIS_GROUPS)}


# -------------------------------------------------------------- small bodies
SBDB = "https://ssd-api.jpl.nasa.gov/sbdb.api?"
SBDB_QUERY = "https://ssd-api.jpl.nasa.gov/sbdb_query.api?"

FIXED_BODIES = [
    # (search string, display name, note)
    ("1", "Ceres", "Dwarf planet, the largest body in the main asteroid belt."),
    ("2", "Pallas", "Third-largest main-belt asteroid, on a steeply tilted orbit."),
    ("4", "Vesta", "Second-largest main-belt asteroid, mapped by NASA's Dawn."),
    ("16", "Psyche", "Metal-rich asteroid. NASA's Psyche spacecraft arrives in 2029."),
    ("433", "Eros", "First asteroid orbited and landed on, by NEAR Shoemaker in 2001."),
    ("101955", "Bennu", "OSIRIS-REx brought a sample of it to Earth in 2023."),
    ("162173", "Ryugu", "Hayabusa2 returned a sample of it in 2020."),
    ("99942", "Apophis", "About 340 m wide. Passes 32,000 km from Earth on 13 April 2029."),
    ("65803", "Didymos", "Its moon Dimorphos was struck by NASA's DART in 2022."),
    ("2024 YR4", "2024 YR4", "Briefly rated the riskiest asteroid known in early 2025; Earth impact later ruled out."),
    ("1P", "Halley", "Last perihelion February 1986, next in July 2061."),
    ("2P", "Encke", "Shortest known comet period, 3.3 years."),
    ("12P", "Pons–Brooks", "The 'devil comet' that brightened in 2024."),
    ("29P", "Schwassmann–Wachmann 1", "Circles beyond Jupiter and has frequent outbursts."),
    ("67P", "Churyumov–Gerasimenko", "Explored by ESA's Rosetta and Philae, 2014–2016."),
    ("C/2023 A3", "Tsuchinshan–ATLAS", "Bright naked-eye comet of October 2024."),
    ("3I", "3I/ATLAS", "Third known interstellar object, perihelion October 2025."),
]


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def sbdb(sstr):
    q = urllib.parse.urlencode({"sstr": sstr, "phys-par": "1"})
    d = json.loads(get(SBDB + q))
    if "object" not in d or "orbit" not in d:
        raise ValueError(d.get("message") or "ambiguous or unknown object")
    obj, orb = d["object"], d["orbit"]
    el = {x["name"]: x.get("value") for x in orb.get("elements", [])}
    phys = {x["name"]: x.get("value") for x in d.get("phys_par", []) or []}
    kind = "comet" if str(obj.get("kind", "")).startswith("c") else "asteroid"
    return {
        "id": str(obj.get("spkid") or sstr),
        "full": obj.get("fullname", sstr),
        "kind": kind,
        "neo": bool(obj.get("neo")),
        "pha": bool(obj.get("pha")),
        "e": num(el.get("e")), "q": num(el.get("q")), "a": num(el.get("a")),
        "i": num(el.get("i")), "om": num(el.get("om")), "w": num(el.get("w")),
        "ma": num(el.get("ma")), "tp": num(el.get("tp")),
        "epoch": num(orb.get("epoch")),
        "diameter": num(phys.get("diameter")), "H": num(phys.get("H")),
    }


def active_comets(skip_names):
    """Comets within ~5 months of perihelion and inside 2.5 AU, brightest first."""
    j = jd_now()
    cdata = json.dumps({"AND": ["q|LT|2.5", f"tp|RG|{j - 150:.1f}|{j + 150:.1f}"]})
    q = urllib.parse.urlencode({
        "fields": "full_name,e,q,i,om,w,tp,epoch,M1",
        "sb-kind": "c", "sb-cdata": cdata,
    })
    d = json.loads(get(SBDB_QUERY + q))
    fields = d["fields"]
    rows = [dict(zip(fields, r)) for r in d.get("data", [])]
    rows = [r for r in rows if num(r.get("M1")) is not None]
    rows.sort(key=lambda r: num(r["M1"]))
    out = []
    for r in rows:
        full = (r["full_name"] or "").strip()
        if any(s in full for s in skip_names):
            continue
        out.append({
            "id": "c:" + full, "full": full, "name": full,
            "kind": "comet", "e": num(r["e"]), "q": num(r["q"]), "i": num(r["i"]),
            "om": num(r["om"]), "w": num(r["w"]), "tp": num(r["tp"]), "epoch": num(r["epoch"]),
            "ma": None, "a": None, "M1": num(r["M1"]),
            "note": "Comet currently near the Sun, picked automatically from JPL's database.",
            "auto": True,
        })
        if len(out) >= 8:
            break
    return out


def update_small_bodies():
    bodies, failed = [], []
    for sstr, name, note in FIXED_BODIES:
        try:
            b = sbdb(sstr)
            b.update(name=name, note=note)
            bodies.append(b)
        except Exception as e:  # noqa: BLE001
            failed.append(name)
            log(f"sbdb {sstr}: {e}")
        time.sleep(0.4)
    try:
        bodies += active_comets([b["full"] for b in bodies] + ["C/2023 A3", "12P", "2P"])
    except Exception as e:  # noqa: BLE001
        log(f"active comets: {e}")
    if len(bodies) >= len(FIXED_BODIES) // 2:
        write("smallbodies.json", json.dumps({"generated": NOW.isoformat(), "bodies": bodies}, indent=0))
        STATUS["smallbodies"] = {"ok": not failed, "count": len(bodies), "failed": failed}
    else:
        STATUS["smallbodies"] = {"ok": False, "failed": failed}
        keep_previous("smallbodies.json")


# ------------------------------------------------------------ close approaches
CAD = "https://ssd-api.jpl.nasa.gov/cad.api?"
LD_AU = 0.00256955529  # one lunar distance in AU


def update_close_approaches():
    try:
        q = urllib.parse.urlencode({
            "date-min": "now", "date-max": "+60", "dist-max": "0.05",
            "diameter": "true", "fullname": "true", "sort": "date",
        })
        d = json.loads(get(CAD + q))
        fields = d.get("fields", [])
        rows = [dict(zip(fields, r)) for r in d.get("data", [])]
        approaches = []
        for r in rows:
            au = num(r.get("dist"))
            approaches.append({
                "des": r.get("des"), "name": (r.get("fullname") or r.get("des") or "").strip(),
                "jd": num(r.get("jd")), "date": r.get("cd"),
                "au": au, "ld": au / LD_AU if au else None,
                "v": num(r.get("v_rel")), "H": num(r.get("h")),
                "diameter": num(r.get("diameter")),
            })
        # Orbits for the closest dozen so they can be drawn in the solar view.
        orbits = []
        for a in sorted(approaches, key=lambda a: a["au"] or 9)[:12]:
            try:
                b = sbdb(a["des"])
                b.update(name=a["name"], des=a["des"])
                orbits.append(b)
            except Exception as e:  # noqa: BLE001
                log(f"cad orbit {a['des']}: {e}")
            time.sleep(0.4)
        write("closeapproach.json", json.dumps(
            {"generated": NOW.isoformat(), "approaches": approaches, "orbits": orbits}, indent=0))
        STATUS["closeapproach"] = {"ok": True, "count": len(approaches)}
        log(f"close approaches: {len(approaches)}")
    except Exception as e:  # noqa: BLE001
        STATUS["closeapproach"] = {"ok": False, "error": str(e)[:200]}
        keep_previous("closeapproach.json")


# ------------------------------------------------------------------ launches
LL2 = ["https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=15&mode=normal",
       "https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=15&mode=normal"]


def pick(d, *path):
    for p in path:
        if not isinstance(d, dict):
            return None
        d = d.get(p)
    return d


def update_launches():
    last = None
    for url in LL2:
        try:
            d = json.loads(get(url, tries=2))
            out = []
            for r in d.get("results", []):
                vids = r.get("vid_urls") or r.get("vidURLs") or []
                info = r.get("info_urls") or r.get("infoURLs") or []
                link = (vids[0].get("url") if vids and isinstance(vids[0], dict) else None) or \
                       (info[0].get("url") if info and isinstance(info[0], dict) else None)
                out.append({
                    "name": r.get("name"), "net": r.get("net"),
                    "precision": pick(r, "net_precision", "name"),
                    "window_start": r.get("window_start"), "window_end": r.get("window_end"),
                    "status": pick(r, "status", "abbrev") or pick(r, "status", "name"),
                    "provider": pick(r, "launch_service_provider", "name"),
                    "rocket": pick(r, "rocket", "configuration", "full_name") or pick(r, "rocket", "configuration", "name"),
                    "mission": pick(r, "mission", "name"),
                    "orbit": pick(r, "mission", "orbit", "name"),
                    "description": (pick(r, "mission", "description") or "")[:400],
                    "pad": pick(r, "pad", "name"),
                    "location": pick(r, "pad", "location", "name"),
                    "lat": num(pick(r, "pad", "latitude")), "lon": num(pick(r, "pad", "longitude")),
                    "link": link,
                })
            if not out:
                raise ValueError("no launches in response")
            write("launches.json", json.dumps({"generated": NOW.isoformat(), "launches": out}, indent=0))
            STATUS["launches"] = {"ok": True, "count": len(out)}
            log(f"launches: {len(out)}")
            return
        except Exception as e:  # noqa: BLE001
            last = e
            log(f"launches via {url[:50]}: {e}")
    STATUS["launches"] = {"ok": False, "error": str(last)[:200]}
    keep_previous("launches.json")


LL2_RECENT = "https://ll.thespacedevs.com/2.3.0/launches/previous/?limit=12&mode=normal"


def update_recent_launches():
    """Launches from the last few weeks, with the international designator that links them to satellites."""
    try:
        d = json.loads(get(LL2_RECENT, tries=2))
        out = []
        for r in d.get("results", []):
            out.append({
                "name": r.get("name"), "net": r.get("net"),
                "status": pick(r, "status", "abbrev") or pick(r, "status", "name"),
                "provider": pick(r, "launch_service_provider", "name"),
                "rocket": pick(r, "rocket", "configuration", "full_name") or pick(r, "rocket", "configuration", "name"),
                "mission": pick(r, "mission", "name"), "orbit": pick(r, "mission", "orbit", "name"),
                "description": (pick(r, "mission", "description") or "")[:400],
                "location": pick(r, "pad", "location", "name"),
                "lat": num(pick(r, "pad", "latitude")), "lon": num(pick(r, "pad", "longitude")),
                "designator": r.get("launch_designator"),
            })
        write("recentlaunches.json", json.dumps({"generated": NOW.isoformat(), "launches": out}, indent=0))
        STATUS["recentlaunches"] = {"ok": True, "count": len(out)}
        log(f"recent launches: {len(out)}")
    except Exception as e:  # noqa: BLE001
        STATUS["recentlaunches"] = {"ok": False, "error": str(e)[:200]}
        keep_previous("recentlaunches.json")


# ------------------------------------------------------------ tropical storms
NHC = "https://www.nhc.noaa.gov/CurrentStorms.json"
GDACS = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=TC"
NHC_TYPES = {"TD": "Tropical depression", "TS": "Tropical storm", "HU": "Hurricane", "STD": "Subtropical depression",
             "STS": "Subtropical storm", "PTC": "Potential tropical cyclone", "TY": "Typhoon", "PC": "Post-tropical cyclone"}


def update_storms():
    storms, ok = [], 0
    # US National Hurricane Center: Atlantic and Eastern/Central Pacific, with advisories every 6 hours
    try:
        d = json.loads(get(NHC, tries=2))
        for r in d.get("activeStorms", []):
            adv = r.get("publicAdvisory") or {}
            storms.append({
                "id": r.get("id"), "name": (r.get("name") or "").title(), "source": "NHC",
                "type": NHC_TYPES.get(r.get("classification"), r.get("classification")),
                "wind_kt": num(r.get("intensity")), "pressure": num(r.get("pressure")),
                "lat": num(r.get("latitudeNumeric")), "lon": num(r.get("longitudeNumeric")),
                "move_dir": num(r.get("movementDir")), "move_kt": num(r.get("movementSpeed")),
                "updated": r.get("lastUpdate"),
                "link": adv.get("url") or "https://www.nhc.noaa.gov/",
            })
        ok += 1
    except Exception as e:  # noqa: BLE001
        log(f"nhc: {e}")
    # GDACS (EU/UN): every ocean basin, used for storms the NHC does not cover
    try:
        d = json.loads(get(GDACS, tries=2))
        cutoff = NOW - dt.timedelta(hours=30)
        have = {s["name"].lower() for s in storms}
        for f in d.get("features", []):
            p = f.get("properties", {})
            if str(p.get("iscurrent")).lower() != "true":
                continue
            try:
                to = dt.datetime.fromisoformat(p.get("todate")).replace(tzinfo=dt.timezone.utc)
            except Exception:  # noqa: BLE001
                continue
            if to < cutoff:
                continue
            name = (p.get("eventname") or "").rsplit("-", 1)[0].replace("-", " ").title()
            if name.lower() in have:
                continue
            coords = (f.get("geometry") or {}).get("coordinates") or [None, None]
            sev = p.get("severitydata") or {}
            kmh = num(sev.get("severity"))
            storms.append({
                "id": f"gdacs{p.get('eventid')}", "name": name, "source": "GDACS",
                "type": sev.get("severitytext") or "Tropical cyclone",
                "wind_kt": kmh / 1.852 if kmh else None, "pressure": None,
                "lat": num(coords[1]), "lon": num(coords[0]), "move_dir": None, "move_kt": None,
                "updated": p.get("todate") + "Z" if p.get("todate") else None,
                "alert": p.get("alertlevel"),
                "link": f"https://www.gdacs.org/report.aspx?eventtype=TC&eventid={p.get('eventid')}",
            })
        ok += 1
    except Exception as e:  # noqa: BLE001
        log(f"gdacs: {e}")
    if ok:
        write("storms.json", json.dumps({"generated": NOW.isoformat(), "storms": storms}, indent=0))
        STATUS["storms"] = {"ok": True, "count": len(storms)}
        log(f"storms: {len(storms)}")
    else:
        STATUS["storms"] = {"ok": False}
        keep_previous("storms.json")


# ------------------------------------------------------- Earth imagery
# Day: yesterday's real true-colour photos from three NASA/NOAA VIIRS satellites, stacked so
# each one fills the gaps between the others' strips; any gap left is filled with Blue Marble.
# Night: NASA Black Marble city lights (static, downloaded once and then reused).
GIBS = ("https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap"
        "&VERSION=1.3.0&LAYERS={layer}&STYLES=&CRS=EPSG:4326&BBOX=-90,-180,90,180"
        "&WIDTH={w}&HEIGHT={h}&FORMAT=image/jpeg{time}")
DAY_LAYERS = ["VIIRS_NOAA21_CorrectedReflectance_TrueColor",   # bottom of the stack
              "VIIRS_SNPP_CorrectedReflectance_TrueColor",
              "VIIRS_NOAA20_CorrectedReflectance_TrueColor"]   # top of the stack
BASE_LAYER = "BlueMarble_NextGeneration"
NIGHT_LAYER = "VIIRS_Black_Marble"
BIG, SMALL = 8192, 4096


def pillow():
    try:
        from PIL import Image  # noqa: F401
    except ImportError:
        import subprocess
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "pillow"], check=True)
    from PIL import Image, ImageFilter
    Image.MAX_IMAGE_PIXELS = None
    return Image, ImageFilter


def gibs_image(layer, date=None):
    """Fetch a whole-Earth image at 8192 px, falling back to 4096 px scaled up."""
    from io import BytesIO
    Image, _ = pillow()
    t = f"&TIME={date}" if date else ""
    for w in (BIG, SMALL):
        try:
            data = get(GIBS.format(layer=layer, w=w, h=w // 2, time=t), timeout=300, tries=2)
            if data[:3] != b"\xff\xd8\xff":
                raise ValueError("not a JPEG: " + data[:120].decode("utf-8", "replace"))
            img = Image.open(BytesIO(data)).convert("RGB")
            return img if img.width == BIG else img.resize((BIG, BIG // 2), Image.LANCZOS)
        except Exception as e:  # noqa: BLE001
            log(f"gibs {layer} {date or ''} at {w}px: {e}")
    raise RuntimeError(f"{layer} unavailable")


def save_pair(img, stem):
    Image, _ = pillow()
    os.makedirs(OUT, exist_ok=True)
    img.save(os.path.join(OUT, f"{stem}_8k.jpg"), quality=84, optimize=True, progressive=True)
    img.resize((SMALL, SMALL // 2), Image.LANCZOS).save(
        os.path.join(OUT, f"{stem}_4k.jpg"), quality=86, optimize=True, progressive=True)


def previous_meta():
    if not SITE_URL:
        return {}
    try:
        return json.loads(get(f"{SITE_URL}/data/meta.json", tries=1)).get("sources", {})
    except Exception:  # noqa: BLE001
        return {}


def update_earth_images():
    prev = previous_meta()
    Image, ImageFilter = pillow()

    # night lights: static, so reuse the published copy when there is one
    if prev.get("earth_night", {}).get("ok") and keep_previous("earth_night_8k.jpg") and keep_previous("earth_night_4k.jpg"):
        STATUS["earth_night"] = prev["earth_night"]
    else:
        try:
            save_pair(gibs_image(NIGHT_LAYER), "earth_night")
            STATUS["earth_night"] = {"ok": True, "layer": NIGHT_LAYER}
            log("night lights: saved")
        except Exception as e:  # noqa: BLE001
            STATUS["earth_night"] = {"ok": False, "error": str(e)[:200]}

    # day imagery: once per day is enough
    for back in (1, 2):
        date = (NOW - dt.timedelta(days=back)).strftime("%Y-%m-%d")
        p = prev.get("earth_image", {})
        if p.get("ok") and p.get("date") == date and keep_previous("earth_day_8k.jpg") and keep_previous("earth_day_4k.jpg"):
            STATUS["earth_image"] = p
            log(f"day imagery for {date} already published, reused")
            return
        layers = []
        for layer in DAY_LAYERS:
            try:
                layers.append((layer, gibs_image(layer, date)))
            except Exception as e:  # noqa: BLE001
                log(str(e))
        if not layers:
            continue
        try:
            result = gibs_image(BASE_LAYER)
        except Exception:  # noqa: BLE001
            result = layers[0][1]
        for name, img in layers:
            # no-data pixels are black; grow the mask a little to swallow the dark JPEG fringe
            # no-data = pure black areas between orbit strips. Drop isolated dark pixels (real dark ocean),
            # grow the area a little to cover the JPEG fringe, then blur it so strips blend without blocks.
            dark = img.convert("L").point(lambda v: 255 if v < 5 else 0)
            gap = dark.filter(ImageFilter.MinFilter(9)).filter(ImageFilter.MaxFilter(17)).filter(ImageFilter.GaussianBlur(6))
            result = Image.composite(result, img, gap)
        save_pair(result, "earth_day")
        STATUS["earth_image"] = {"ok": True, "date": date, "layers": [n for n, _ in layers]}
        log(f"day imagery {date}: composited {len(layers)} satellites")
        return
    STATUS["earth_image"] = {"ok": False}
    if keep_previous("earth_day_8k.jpg") and keep_previous("earth_day_4k.jpg"):
        STATUS["earth_image"] = prev.get("earth_image", {"ok": False})


def main():
    os.makedirs(OUT, exist_ok=True)
    for step in (update_satellites, update_small_bodies, update_close_approaches,
                 update_launches, update_recent_launches, update_storms, update_earth_images):
        log(f"== {step.__name__}")
        try:
            step()
        except Exception as e:  # noqa: BLE001  never let one source stop the deploy
            log(f"{step.__name__} crashed: {e}")
    trigger = {"schedule": "scheduled", "push": "file upload", "workflow_dispatch": "manual run"}.get(
        os.environ.get("GITHUB_EVENT_NAME", ""), "local run")
    if trigger == "manual run" and os.environ.get("GITHUB_ACTOR", "").startswith("github-actions"):
        trigger = "automatic"   # started by the built-in 3-hour timer
    run_url = None
    if os.environ.get("GITHUB_RUN_ID"):
        run_url = "{}/{}/actions/runs/{}".format(os.environ.get("GITHUB_SERVER_URL", "https://github.com"),
                                                 os.environ.get("GITHUB_REPOSITORY", ""), os.environ["GITHUB_RUN_ID"])
    history = []
    if SITE_URL:
        try:
            history = json.loads(get(f"{SITE_URL}/data/meta.json", tries=1)).get("history", [])
        except Exception:  # noqa: BLE001
            history = []
    ok = sum(1 for v in STATUS.values() if v.get("ok"))
    history = (history + [{"at": NOW.isoformat(), "trigger": trigger, "ok": ok, "total": len(STATUS)}])[-12:]
    meta = {"generated": NOW.isoformat(), "trigger": trigger, "run_url": run_url,
            "schedule": "17 */3 * * *", "sources": STATUS, "history": history}
    write("meta.json", json.dumps(meta, indent=1))
    log(json.dumps(meta, indent=1))


if __name__ == "__main__":
    main()
