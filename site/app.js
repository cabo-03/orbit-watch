/* Orbit Watch — live tracker for satellites, the Moon, planets, asteroids and comets.
   Data files in ./data are refreshed every 3 hours by the GitHub Action in this repo. */
(function () {
"use strict";

/* ================================================================ constants */
const $ = s => document.querySelector(s);
const RE = 6371, AU_KM = 149597870.7, DEG = Math.PI / 180, LD_KM = 384400, GM_SUN = 1.32712440018e11;
const A = window.Astronomy;
const MOBILE = matchMedia("(max-width: 820px)").matches;

const CATS = [
  { key: "stations", label: "Space stations", color: "#ffb44a", on: true, size: 7 },
  { key: "recent", label: "Launched in last 30 days", color: "#ff8a5c", on: true, size: 4.5 },
  { key: "starlink", label: "Starlink", color: "#7f93b8", on: true, size: 2.4 },
  { key: "oneweb", label: "OneWeb", color: "#b48cf2", on: true, size: 2.8 },
  { key: "kuiper", label: "Amazon Kuiper", color: "#f2d15a", on: true, size: 2.8 },
  { key: "gnss", label: "Navigation (GPS, Galileo…)", color: "#6ee7a0", on: true, size: 4 },
  { key: "weather", label: "Weather", color: "#5cc8ff", on: true, size: 4 },
  { key: "geo", label: "Geostationary", color: "#ff7ab0", on: true, size: 3.4 },
  { key: "science", label: "Science", color: "#4fd1c5", on: true, size: 4 },
  { key: "other", label: "Other active", color: "#aab6ca", on: true, size: 2.4 },
  { key: "debris", label: "Debris clouds", color: "#b07a58", on: false, size: 2.2 },
];
const CAT_INDEX = Object.fromEntries(CATS.map((c, i) => [c.key, i]));
const GROUP_TO_CAT = { "last-30-days": "recent", starlink: "starlink", oneweb: "oneweb",
  kuiper: "kuiper", gnss: "gnss", weather: "weather", geo: "geo", science: "science" };
const CAT_ORDER = ["stations", "recent", "gnss", "weather", "science", "geo", "kuiper", "oneweb", "starlink"];
const CREWED = /^(ISS|CSS|TIANGONG|TIANHE|WENTIAN|MENGTIAN|CREW DRAGON|DRAGON|SOYUZ|PROGRESS|CYGNUS|TIANZHOU|SHENZHOU|STARLINER|HTV|DREAM ?CHASER|AXIOM|HAKUTO)/i;
const DEBRIS_FILES = ["fengyun-1c-debris", "cosmos-2251-debris", "iridium-33-debris", "cosmos-1408-debris"];

const PLANETS = [
  { key: "Mercury", color: "#b9b1a6", r: 2439.7 }, { key: "Venus", color: "#f3d9a4", r: 6051.8 },
  { key: "Earth", color: "#5fb8ff", r: 6371 }, { key: "Mars", color: "#ff8a5c", r: 3389.5 },
  { key: "Jupiter", color: "#e7c49b", r: 69911 }, { key: "Saturn", color: "#f1dc9e", r: 58232 },
  { key: "Uranus", color: "#9fe3ea", r: 25362 }, { key: "Neptune", color: "#7f9bff", r: 24622 },
  { key: "Pluto", color: "#c9b39a", r: 1188.3, dwarf: true },
];
const KIND = {
  sat: { label: "Satellite" }, moon: { label: "Natural satellite", color: "#d7dbe4" }, sun: { label: "Star", color: "#ffd36b" },
  planet: { label: "Planet" }, dwarf: { label: "Dwarf planet" }, asteroid: { label: "Asteroid", color: "#d0ad7c" },
  comet: { label: "Comet", color: "#79f2c8" }, neo: { label: "Near-Earth asteroid flyby", color: "#ff6b6b" },
  launch: { label: "Upcoming launch", color: "#ffb44a" },
};

/* ================================================================ helpers */
const fmt = (v, d = 0) => (v == null || !isFinite(v)) ? "—" : v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const len = v => Math.hypot(v.x, v.y, v.z);
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const jd = ms => ms / 86400000 + 2440587.5;
const T3 = (x, y, z) => new THREE.Vector3(x, z, -y);           // ECI/ecliptic -> three.js (Y up)
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem("orbitwatch." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem("orbitwatch." + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
};
function ago(ms) {
  const m = Math.round(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + " min ago";
  const h = Math.floor(m / 60);
  if (h < 48) return h + " h " + (m % 60) + " min ago";
  return Math.round(h / 24) + " days ago";
}
function dur(ms) {
  const s = Math.max(0, Math.floor(Math.abs(ms) / 1000)), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600),
    m = Math.floor(s % 3600 / 60), ss = s % 60, p = n => String(n).padStart(2, "0");
  return (d ? d + "d " : "") + p(h) + ":" + p(m) + ":" + p(ss);
}
function lightTime(km) { const s = km / 299792.458; return s < 120 ? fmt(s, 1) + " s" : s < 7200 ? fmt(s / 60, 1) + " min" : fmt(s / 3600, 1) + " h"; }
function latlon(lat, lon) { return `${fmt(Math.abs(lat), 2)}° ${lat >= 0 ? "N" : "S"}, ${fmt(Math.abs(lon), 2)}° ${lon >= 0 ? "E" : "W"}`; }
function compass(az) { return ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"][Math.round(((az % 360) + 360) % 360 / 22.5) % 16]; }
const localTime = ms => new Date(ms).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

/* ================================================================ time */
let simMs = Date.now(), rate = 1, live = true, lastReal = performance.now();

/* ================================================================ data */
const DATA = { meta: null, groups: {}, small: [], cad: { approaches: [], orbits: [] }, launches: [], tleText: {} };
async function fetchText(p) { const r = await fetch(p, { cache: "no-cache" }); if (!r.ok) throw new Error(p + " " + r.status); return r.text(); }
async function fetchJSON(p, d) { try { return JSON.parse(await fetchText(p)); } catch (e) { console.warn(e); return d; } }

/* ================================================================ renderer */
const canvas = $("#gl"), mapCanvas = $("#map");
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); }
catch (e) { $("#err").hidden = false; return; }
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0x04060b);
const PR = renderer.getPixelRatio();

function starField(radius, count, seed) {
  let s = seed; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3);
  for (let k = 0; k < count; k++) {
    const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    pos[3 * k] = radius * r * Math.cos(th); pos[3 * k + 1] = radius * u; pos[3 * k + 2] = radius * r * Math.sin(th);
    const b = 0.3 + Math.pow(rnd(), 3) * 0.7, t = rnd();
    col[3 * k] = b * (t > .8 ? 1 : .85); col[3 * k + 1] = b * .9; col[3 * k + 2] = b * (t < .25 ? 1 : .92);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ size: 1.3, sizeAttenuation: false, vertexColors: true, depthWrite: false }));
}
let DOT_TEX = null;
function dotTexture() {
  if (DOT_TEX) return DOT_TEX;
  const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d");
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(.55, "rgba(255,255,255,1)"); g.addColorStop(.75, "rgba(255,255,255,.35)"); g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g; x.fillRect(0, 0, 64, 64); DOT_TEX = new THREE.CanvasTexture(c); return DOT_TEX;
}
// Real sky: 9,096 stars from the Yale Bright Star Catalogue at their J2000 positions and colours
const STAR_DATA = fetch("textures/stars.json").then(r => r.json()).catch(() => null);
function addRealStars(scene, radius, ecliptic) {
  STAR_DATA.then(d => {
    if (!d) { scene.add(starField(radius, 3500, 7)); return; }
    const n = d.length / 6, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n);
    const ce = Math.cos(23.4393 * DEG), se = Math.sin(23.4393 * DEG);
    for (let k = 0; k < n; k++) {
      const ra = d[6 * k] * DEG, dec = d[6 * k + 1] * DEG, mag = d[6 * k + 2];
      let x = Math.cos(dec) * Math.cos(ra), y = Math.cos(dec) * Math.sin(ra), z = Math.sin(dec);
      if (ecliptic) { const y2 = y * ce + z * se, z2 = -y * se + z * ce; y = y2; z = z2; }
      pos[3 * k] = x * radius; pos[3 * k + 1] = z * radius; pos[3 * k + 2] = -y * radius;
      const b = Math.max(0.16, Math.min(1, 1.15 - 0.15 * mag));
      col[3 * k] = d[6 * k + 3] * b; col[3 * k + 1] = d[6 * k + 4] * b; col[3 * k + 2] = d[6 * k + 5] * b;
      size[k] = Math.max(1.6, Math.min(7.5, 6.2 - 0.85 * mag));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.BufferAttribute(col, 3)); g.setAttribute("size", new THREE.BufferAttribute(size, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { pr: { value: PR } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: "attribute vec3 color; attribute float size; uniform float pr; varying vec3 vC; void main(){ vC=color; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_PointSize=size*pr; }",
      fragmentShader: "varying vec3 vC; void main(){ vec2 c=gl_PointCoord-0.5; float r=length(c)*2.0; float a=exp(-r*r*5.0); if(a<0.02) discard; gl_FragColor=vec4(vC*a,1.0); }",
    });
    const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = -1; scene.add(pts);
  });
}
function dotPoint(color, size) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(3), 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ color: new THREE.Color(color), size: size * 1.35, map: dotTexture(), alphaTest: 0.02, sizeAttenuation: false, depthWrite: false, transparent: true }));
}
function setDot(pt, v) { const a = pt.geometry.attributes.position; a.setXYZ(0, v.x, v.y, v.z); a.needsUpdate = true; pt.geometry.computeBoundingSphere(); }
function line(pts, color, opacity) {
  const g = new THREE.BufferGeometry().setFromPoints(pts.length ? pts : [new THREE.Vector3()]);
  return new THREE.Line(g, new THREE.LineBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity, depthWrite: false }));
}
function setLine(l, pts) { l.geometry.dispose(); l.geometry = new THREE.BufferGeometry().setFromPoints(pts.length ? pts : [new THREE.Vector3()]); }
function glowTexture(inner, outer) {
  const c = document.createElement("canvas"); c.width = c.height = 128; const x = c.getContext("2d");
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner); g.addColorStop(.22, outer); g.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = g; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
}
function ringTexture(color) {
  const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d");
  x.strokeStyle = color; x.lineWidth = 4; x.beginPath(); x.arc(32, 32, 24, 0, Math.PI * 2); x.stroke();
  return new THREE.CanvasTexture(c);
}

/* ---------------------------------------------------------------- globe scene (units: Earth radii, ECI) */
const sE = new THREE.Scene();
const camE = new THREE.PerspectiveCamera(42, 1, 0.01, 6000);
camE.position.set(2.6, 1.6, 3.2); if (MOBILE) camE.position.multiplyScalar(1.45);
addRealStars(sE, 2500, false);
const texLoader = new THREE.TextureLoader();
const dayTex = texLoader.load("textures/earth_atmos_2048.jpg");
const nightTex = texLoader.load("textures/earth_lights_2048.png");
const specTex = texLoader.load("textures/earth_specular_2048.jpg");
const MAX_ANISO = renderer.capabilities.getMaxAnisotropy();
[dayTex, nightTex, specTex].forEach(t => { t.anisotropy = MAX_ANISO; });
const earthMat = new THREE.ShaderMaterial({
  uniforms: { dayMap: { value: dayTex }, nightMap: { value: nightTex }, specMap: { value: specTex }, sunDir: { value: new THREE.Vector3(1, 0, 0) }, lightsFloor: { value: new THREE.Vector3(0.11, 0.11, 0.24) } },
  vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vW;
    void main(){ vUv=uv; vN=normalize(mat3(modelMatrix)*normal); vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
  fragmentShader: `uniform sampler2D dayMap; uniform sampler2D nightMap; uniform sampler2D specMap; uniform vec3 sunDir; uniform vec3 lightsFloor;
    varying vec2 vUv; varying vec3 vN; varying vec3 vW;
    void main(){
      vec3 n=normalize(vN); vec3 s=normalize(sunDir); float l=dot(n,s);
      vec3 day=texture2D(dayMap,vUv).rgb; vec3 lights=texture2D(nightMap,vUv).rgb; float spec=texture2D(specMap,vUv).r;
      float d=smoothstep(-0.10,0.20,l);
      vec3 v=normalize(cameraPosition-vW); vec3 r=reflect(-s,n);
      float gl=pow(max(dot(r,v),0.0),28.0)*spec*0.45;
      vec3 dayCol=day*(0.18+0.95*max(l,0.0))+vec3(1.0,0.95,0.85)*gl*max(l,0.0);
      vec3 nightCol=day*0.03+max(lights-lightsFloor,0.0)*vec3(1.0,0.82,0.55)*1.7;
      vec3 col=mix(nightCol,dayCol,d);
      col+=vec3(1.0,0.55,0.3)*exp(-pow(l/0.035,2.0))*0.05;
      gl_FragColor=vec4(col,1.0);
    }`,
});
const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), earthMat);
sE.add(earth);
const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.028, 96, 64), new THREE.ShaderMaterial({
  uniforms: { sunDir: { value: new THREE.Vector3(1, 0, 0) } }, transparent: true, blending: THREE.AdditiveBlending, side: THREE.BackSide, depthWrite: false,
  vertexShader: "varying vec3 vN;varying vec3 vW;void main(){vN=normalize(mat3(modelMatrix)*normal);vec4 w=modelMatrix*vec4(position,1.0);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}",
  fragmentShader: `uniform vec3 sunDir; varying vec3 vN; varying vec3 vW;
    void main(){
      vec3 v=normalize(cameraPosition-vW); vec3 n=normalize(vN);
      float f=pow(1.0-abs(dot(v,n)),2.6);
      float l=dot(n,normalize(sunDir));
      float lit=smoothstep(-0.28,0.25,l);
      vec3 sky=vec3(0.32,0.6,1.0); vec3 dusk=vec3(1.0,0.48,0.2);
      vec3 col=mix(dusk,sky,smoothstep(-0.05,0.35,l));
      float a=f*lit;
      gl_FragColor=vec4(col*a*1.15,a);
    }`,
}));
const haze = new THREE.Mesh(new THREE.SphereGeometry(1.003, 96, 64), new THREE.ShaderMaterial({
  uniforms: { sunDir: { value: new THREE.Vector3(1, 0, 0) } }, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  vertexShader: "varying vec3 vN;varying vec3 vW;void main(){vN=normalize(mat3(modelMatrix)*normal);vec4 w=modelMatrix*vec4(position,1.0);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}",
  fragmentShader: `uniform vec3 sunDir; varying vec3 vN; varying vec3 vW;
    void main(){
      vec3 v=normalize(cameraPosition-vW); vec3 n=normalize(vN);
      float f=pow(1.0-max(dot(v,n),0.0),3.0);
      float l=dot(n,normalize(sunDir));
      float lit=smoothstep(-0.15,0.3,l);
      vec3 col=mix(vec3(1.0,0.5,0.25),vec3(0.38,0.62,1.0),smoothstep(0.0,0.3,l));
      gl_FragColor=vec4(col*f*lit*0.75,1.0);
    }`,
}));
sE.add(haze);
sE.add(atmo);
const sunSpriteE = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture("rgba(255,244,214,1)", "rgba(255,190,90,0.35)"), depthWrite: false, blending: THREE.AdditiveBlending }));
sunSpriteE.scale.set(110, 110, 1); sE.add(sunSpriteE);
const moonMesh = new THREE.Mesh(new THREE.SphereGeometry(1737.4 / RE, 48, 32), new THREE.MeshLambertMaterial({ map: texLoader.load("textures/moon_1024.jpg") }));
sE.add(moonMesh);
const moonLight = new THREE.DirectionalLight(0xffffff, 1.15); sE.add(moonLight); moonLight.target = moonMesh;
sE.add(new THREE.AmbientLight(0x223344, .25));
const moonOrbitLine = line([], "#d7dbe4", .12); sE.add(moonOrbitLine);
const selOrbitE = line([], "#ffffff", .5); sE.add(selOrbitE);
const selDropE = line([new THREE.Vector3(), new THREE.Vector3()], "#ffffff", .35); sE.add(selDropE);
const selRing = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTexture("#ffffff"), depthTest: false, transparent: true, sizeAttenuation: false }));
selRing.scale.set(0.045, 0.045, 1); sE.add(selRing);
const planetDotsE = {};

/* satellites as one point cloud (positions are raw ECI km; the shader converts) */
const satMat = new THREE.ShaderMaterial({
  uniforms: { scale: { value: 1 / RE }, sunDir: { value: new THREE.Vector3(1, 0, 0) }, pr: { value: PR } },
  transparent: true, depthWrite: false,
  vertexShader: `attribute vec3 color; attribute float size; uniform float scale; uniform vec3 sunDir; uniform float pr;
    varying vec3 vC; varying float vA;
    void main(){
      vec3 p=vec3(position.x,position.z,-position.y)*scale;
      if(size<=0.0||length(p)<0.5){ gl_Position=vec4(2.0,2.0,2.0,1.0); gl_PointSize=0.0; return; }
      float d=dot(p,sunDir); bool lit=d>0.0||length(p-d*sunDir)>1.0;
      vA=lit?1.0:0.16; vC=color;
      gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0); gl_PointSize=size*pr;
    }`,
  fragmentShader: `varying vec3 vC; varying float vA;
    void main(){ vec2 c=gl_PointCoord-0.5; float r=length(c); if(r>0.5) discard; gl_FragColor=vec4(vC, vA*smoothstep(0.5,0.25,r)); }`,
});
let satPoints = null;

/* ---------------------------------------------------------------- solar scene (units: 10 per AU, ecliptic J2000) */
const S = 10;
const sS = new THREE.Scene();
const camS = new THREE.PerspectiveCamera(45, 1, 0.05, 12000);
camS.position.set(0, 120, 170);
addRealStars(sS, 5000, true);
const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture("rgba(255,250,230,1)", "rgba(255,180,70,0.5)"), depthWrite: false, blending: THREE.AdditiveBlending }));
sunSprite.scale.set(6, 6, 1); sS.add(sunSprite);
[1, 5, 10, 30].forEach(r => {
  const pts = []; for (let k = 0; k <= 180; k++) { const a = k / 180 * Math.PI * 2; pts.push(new THREE.Vector3(r * S * Math.cos(a), 0, r * S * Math.sin(a))); }
  sS.add(line(pts, "#8391aa", .06));
});
const earthToSel = line([new THREE.Vector3(), new THREE.Vector3()], "#ffb44a", .6); earthToSel.visible = false; sS.add(earthToSel);

/* ---------------------------------------------------------------- controls */
const ctlE = new THREE.OrbitControls(camE, canvas);
Object.assign(ctlE, { enableDamping: true, minDistance: 1.12, maxDistance: 500, enablePan: false, rotateSpeed: .6 });
const ctlS = new THREE.OrbitControls(camS, canvas);
Object.assign(ctlS, { enableDamping: true, minDistance: .3, maxDistance: 3000, enablePan: false, enabled: false });
let view = "globe";

/* ================================================================ labels (with de-cluttering) */
const labelLayer = $("#labels");
const allLabels = new Set();
let wanted = [];
function makeLabel(text, color, onClick, cls) {
  const el = document.createElement("button");
  el.type = "button"; el.className = "lbl" + (cls ? " " + cls : ""); el.textContent = text; el.style.setProperty("--c", color);
  el.hidden = true; el.tabIndex = -1;
  el.addEventListener("click", ev => { ev.stopPropagation(); onClick && onClick(); });
  labelLayer.appendChild(el);
  const L = { el, w: text.length * 6.6 + 20, shown: false };
  allLabels.add(L); return L;
}
function dropLabel(L) { if (!L) return; L.el.remove(); allLabels.delete(L); }
const tmpV = new THREE.Vector3();
function occludedByEarth(world, cam) {
  const C = cam.position, d = world.clone().sub(C), dd = d.lengthSq(), t = -C.dot(d) / dd;
  if (t > 0 && t < 1) { const q = C.clone().addScaledVector(d, t); if (q.length() < 0.995) return true; }
  return false;
}
function wantLabel(L, world, cam, prio, occlude) {
  if (!L) return;
  tmpV.copy(world).project(cam);
  if (tmpV.z > 1 || tmpV.z < -1 || Math.abs(tmpV.x) > 1.05 || Math.abs(tmpV.y) > 1.05) return;
  if (occlude && occludedByEarth(world, cam)) return;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  wanted.push({ L, x: (tmpV.x + 1) / 2 * w, y: (1 - tmpV.y) / 2 * h, prio: prio + (L.shown ? 3 : 0) });
}
function wantLabel2D(L, x, y, prio) { if (L) wanted.push({ L, x, y, prio: prio + (L.shown ? 3 : 0) }); }
function flushLabels() {
  wanted.sort((a, b) => b.prio - a.prio);
  const placed = [], shownNow = new Set();
  for (const c of wanted) {
    const r = { x1: c.x - 8, y1: c.y - 9, x2: c.x - 8 + c.L.w, y2: c.y + 9 };
    if (r.x2 > (canvas.clientWidth || innerWidth) - 4 || r.y1 < 0) continue;
    if (placed.some(p => r.x1 < p.x2 + 3 && r.x2 > p.x1 - 3 && r.y1 < p.y2 + 1 && r.y2 > p.y1 - 1)) continue;
    placed.push(r); shownNow.add(c.L);
    c.L.el.style.transform = `translate(${(c.x - 8).toFixed(1)}px,${(c.y - 9).toFixed(1)}px)`;
  }
  for (const L of allLabels) { const s = shownNow.has(L); if (s !== L.shown) { L.el.hidden = !s; L.shown = s; } }
  wanted = [];
}

/* ================================================================ satellites */
const SAT = { n: 0, gen: 0, names: [], ids: [], l1: [], l2: [], epoch: [], period: [], incl: [], cat: new Uint8Array(0),
  bright: new Uint8Array(0), idx: new Map(), pos: new Float32Array(0), byCat: [], labels: new Map() };
const layerOn = store.get("layers", Object.fromEntries(CATS.map(c => [c.key, c.on])));
CATS.forEach(c => { if (layerOn[c.key] == null) layerOn[c.key] = c.on; });
let debrisLoaded = false;

const worker = new Worker("sgp4-worker.js");
let spare = null, waiting = false;
worker.onmessage = e => {
  const m = e.data;
  if (m.type === "loaded") { if (m.gen === SAT.gen) setupSats(m); return; }
  if (m.type === "pos") {
    waiting = false;
    if (m.gen === SAT.gen && m.buf.length === SAT.n * 3 && satPoints) {
      SAT.pos.set(m.buf);
      satPoints.geometry.attributes.position.needsUpdate = true;
      SAT.posT = m.t;
    }
    spare = m.buf;
  }
};
function requestProp() {
  if (waiting || !SAT.n || SAT.loading) return;
  let b = spare && spare.length === SAT.n * 3 ? spare : new Float32Array(SAT.n * 3);
  spare = null; waiting = true;
  worker.postMessage({ type: "prop", t: simMs, gen: SAT.gen, buf: b }, [b.buffer]);
}
function loadWorker() {
  const sets = [{ source: "active", text: DATA.tleText.active || "" }];
  if (DATA.tleText.stations) sets.unshift({ source: "stations", text: DATA.tleText.stations });
  if (debrisLoaded) DEBRIS_FILES.forEach(f => DATA.tleText[f] && sets.push({ source: "debris", text: DATA.tleText[f] }));
  SAT.gen++; SAT.loading = true;
  worker.postMessage({ type: "load", gen: SAT.gen, sets });
}
function setupSats(m) {
  const keepSel = sel && sel.type === "sat" ? SAT.ids[sel.idx] : null;
  const n = m.ids.length;
  Object.assign(SAT, { n, names: m.names, ids: m.ids, l1: m.l1, l2: m.l2, epoch: m.epoch, period: m.period, incl: m.incl, loading: false });
  SAT.idx = new Map(m.ids.map((id, i) => [id, i]));
  const tag = {};
  for (const [g, ids] of Object.entries(DATA.groups)) { const c = GROUP_TO_CAT[g]; if (c) for (const id of ids) { const k = String(id).replace(/^0+/, ""); (tag[k] = tag[k] || new Set()).add(c); } }
  const vis = new Set((DATA.groups.visual || []).map(id => String(id).replace(/^0+/, "")));
  SAT.cat = new Uint8Array(n); SAT.bright = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    let c = "other";
    if (m.source[i] === "debris") c = "debris";
    else if (m.source[i] === "stations" && CREWED.test(m.names[i])) c = "stations";
    else { const t = tag[m.ids[i]]; if (t) c = CAT_ORDER.find(k => t.has(k)) || "other"; }
    SAT.cat[i] = CAT_INDEX[c]; SAT.bright[i] = vis.has(m.ids[i]) ? 1 : 0;
  }
  SAT.byCat = CATS.map(() => []);
  for (let i = 0; i < n; i++) SAT.byCat[SAT.cat[i]].push(i);
  SAT.pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3), size = new Float32Array(n);
  const cc = CATS.map(c => new THREE.Color(c.color));
  for (let i = 0; i < n; i++) { const c = cc[SAT.cat[i]]; col[3 * i] = c.r; col[3 * i + 1] = c.g; col[3 * i + 2] = c.b; }
  if (satPoints) { sE.remove(satPoints); satPoints.geometry.dispose(); }
  const g = new THREE.BufferGeometry();
  const pa = new THREE.BufferAttribute(SAT.pos, 3); pa.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute("position", pa); g.setAttribute("color", new THREE.BufferAttribute(col, 3)); g.setAttribute("size", new THREE.BufferAttribute(size, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  satPoints = new THREE.Points(g, satMat); satPoints.frustumCulled = false; sE.add(satPoints);
  applyLayers();
  // labels for space stations only (everything else shows on hover)
  for (const L of SAT.labels.values()) dropLabel(L);
  SAT.labels.clear();
  for (const i of SAT.byCat[CAT_INDEX.stations]) {
    const id = SAT.ids[i];
    SAT.labels.set(id, makeLabel(shortName(SAT.names[i]), CATS[0].color, () => selectSat(id, true)));
  }
  waiting = false; spare = null;
  buildLayers(); buildList();
  if (keepSel && SAT.idx.has(keepSel)) selectSat(keepSel, false);
  else if (!sel || sel.type === "sat") {
    const first = SAT.idx.has("25544") ? "25544" : (SAT.byCat[0][0] != null ? SAT.ids[SAT.byCat[0][0]] : SAT.ids[0]);
    if (first != null) selectSat(first, !sel); else if (!sel) select({ type: "moon" }, false);
  }
  requestProp();
}
function shortName(n) { return n.replace(/\s*\(.*?\)\s*/g, " ").replace(/\s+/g, " ").trim().slice(0, 28) || n; }
function applyLayers() {
  if (!satPoints) return;
  const sz = satPoints.geometry.attributes.size.array;
  for (let i = 0; i < SAT.n; i++) { const c = CATS[SAT.cat[i]]; sz[i] = layerOn[c.key] ? c.size * (SAT.bright[i] && c.size < 4 ? 1.35 : 1) : 0; }
  satPoints.geometry.attributes.size.needsUpdate = true;
}
async function setLayer(key, on) {
  layerOn[key] = on; store.set("layers", layerOn);
  if (key === "debris" && on && !debrisLoaded) {
    await Promise.all(DEBRIS_FILES.map(async f => { try { DATA.tleText[f] = await fetchText(`data/tle/${f}.txt`); } catch (e) { /* not yet published */ } }));
    debrisLoaded = true; loadWorker(); return;
  }
  applyLayers(); buildLayers();
}
function satECI(i) { return { x: SAT.pos[3 * i], y: SAT.pos[3 * i + 1], z: SAT.pos[3 * i + 2] }; }
function satVisible(i) { return layerOn[CATS[SAT.cat[i]].key] && (SAT.pos[3 * i] || SAT.pos[3 * i + 1] || SAT.pos[3 * i + 2]); }

/* ================================================================ astronomy */
const ROT_EQJ_ECL = A.Rotation_EQJ_ECL();
const st = {};   // per-frame shared state
function computeCommon() {
  const date = new Date(simMs), t = A.MakeTime(date);
  st.date = date; st.t = t; st.J = jd(simMs); st.gmst = satellite.gstime(date);
  const rot = A.Rotation_EQJ_EQD(t);
  st.rot = rot;
  const sunEqd = A.RotateVector(rot, A.GeoVector(A.Body.Sun, t, true));
  const sl = len(sunEqd);
  st.sunKm = { x: sunEqd.x * AU_KM, y: sunEqd.y * AU_KM, z: sunEqd.z * AU_KM };
  st.sunDir = { x: sunEqd.x / sl, y: sunEqd.y / sl, z: sunEqd.z / sl };
  const m = A.RotateVector(rot, A.GeoMoon(t));
  st.moonKm = { x: m.x * AU_KM, y: m.y * AU_KM, z: m.z * AU_KM };
}
function helioEcl(body, t) { return A.RotateVector(ROT_EQJ_ECL, A.HelioVector(A.Body[body], t)); }
function geoDistAU(body, t) { return len(A.GeoVector(A.Body[body], t, true)); }

/* two-body propagation for asteroids and comets (heliocentric ecliptic J2000, AU) */
// Kepler's equation, solved with Newton steps kept inside a bracket so it always converges
// (plain Newton is unstable for very eccentric orbits near aphelion, e.g. Halley today).
function keplerE(M, e) {
  let lo = -Math.PI, hi = Math.PI, E = e < 0.8 ? M : (M < 0 ? -Math.PI : Math.PI) * 0.75 + M * 0.25;
  for (let k = 0; k < 100; k++) {
    const f = E - e * Math.sin(E) - M;
    if (Math.abs(f) < 1e-14) break;
    if (f > 0) hi = E; else lo = E;
    let En = E - f / (1 - e * Math.cos(E));
    if (!(En > lo && En < hi)) En = (lo + hi) / 2;
    if (Math.abs(En - E) < 1e-14) { E = En; break; }
    E = En;
  }
  return E;
}
function keplerH(M, e) {
  const s = M < 0 ? -1 : 1, m = Math.abs(M);
  let lo = 0, hi = Math.asinh(m / (e - 1)) + 1, H = Math.min(Math.asinh(m / e), hi);
  for (let k = 0; k < 200; k++) {
    const f = e * Math.sinh(H) - H - m;
    if (Math.abs(f) < 1e-13 * Math.max(1, m)) break;
    if (f > 0) hi = H; else lo = H;
    let Hn = H - f / (e * Math.cosh(H) - 1);
    if (!(Hn > lo && Hn < hi)) Hn = (lo + hi) / 2;
    if (Math.abs(Hn - H) < 1e-14) { H = Hn; break; }
    H = Hn;
  }
  return s * H;
}
function orient(xp, yp, b) {
  const O = b.om * DEG, i = b.i * DEG, w = b.w * DEG;
  const cO = Math.cos(O), sO = Math.sin(O), ci = Math.cos(i), si = Math.sin(i), cw = Math.cos(w), sw = Math.sin(w);
  return { x: (cw * cO - sw * sO * ci) * xp + (-sw * cO - cw * sO * ci) * yp, y: (cw * sO + sw * cO * ci) * xp + (-sw * sO + cw * cO * ci) * yp, z: (sw * si) * xp + (cw * si) * yp };
}
function semiMajor(b) { return b.a != null ? b.a : b.q / (1 - b.e); }
function smallPos(b, J) {
  let e = b.e; const a = semiMajor(b), k = 0.01720209895;
  if (e < 1) {
    const n = k / Math.pow(a, 1.5);
    let M = (b.ma != null && b.epoch != null) ? b.ma * DEG + n * (J - b.epoch) : n * (J - b.tp);
    M = ((M % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
    const E = keplerE(M, e);
    return orient(a * (Math.cos(E) - e), a * Math.sqrt(1 - e * e) * Math.sin(E), b);
  }
  if (e === 1) e = 1.000001;
  const n = k / Math.pow(-a, 1.5), H = keplerH(n * (J - b.tp), e);
  return orient(a * (Math.cosh(H) - e), -a * Math.sqrt(e * e - 1) * Math.sinh(H), b);
}
function smallOrbit(b) {
  const e = b.e, pts = [];
  if (e < 1) { const a = semiMajor(b); for (let k = 0; k <= 360; k++) { const E = k / 360 * 2 * Math.PI; pts.push(orient(a * (Math.cos(E) - e), a * Math.sqrt(1 - e * e) * Math.sin(E), b)); } }
  else { const p = b.q * (1 + e), nuMax = Math.acos(-1 / e) * 0.985; for (let k = 0; k <= 600; k++) { const nu = -nuMax + 2 * nuMax * k / 600, r = p / (1 + e * Math.cos(nu)); if (r > 50) continue; pts.push(orient(r * Math.cos(nu), r * Math.sin(nu), b)); } }
  return pts;
}

/* ================================================================ solar-system bodies */
const SOLAR = [];   // {key,name,kind,color,pt,orbitLine,lbl,getH(t,J)}
const sunLabelS = makeLabel("Sun", "#ffd36b", () => select({ type: "sun" }, true));
function trimText(t, n) { t = String(t || "").trim(); if (t.length <= n) return t; return t.slice(0, t.lastIndexOf(" ", n)).replace(/[,;:.]$/, "") + "…"; }
function cleanName(n) { return String(n || "").trim().replace(/^\((.*)\)$/, "$1"); }
// Planet orbits always show; asteroid and comet orbits stay faint, flyby orbits appear only when selected.
function styleOrbits() {
  for (const o of SOLAR) {
    const on = sel && sel.type === "solar" && sel.key === o.key;
    const base = o.kind === "planet" || o.kind === "dwarf" ? (o.key === "p:Earth" ? .45 : .28) : o.kind === "neo" ? 0 : .07;
    o.orbitLine.visible = on || base > 0;
    o.orbitLine.material.opacity = on ? .85 : base;
  }
}
function addSolarBody(o) {
  o.pt = dotPoint(o.color, o.size); sS.add(o.pt);
  o.orbitLine = line(o.orbitPts().map(v => new THREE.Vector3(v.x * S, v.z * S, -v.y * S)), o.color, o.orbitOpacity); sS.add(o.orbitLine);
  o.lbl = makeLabel(o.name, o.color, () => select({ type: "solar", key: o.key }, true));
  SOLAR.push(o);
}
function initPlanets() {
  const t0 = A.MakeTime(new Date());
  PLANETS.forEach(p => {
    const period = { Mercury: 88, Venus: 225, Earth: 365.26, Mars: 687, Jupiter: 4333, Saturn: 10759, Uranus: 30687, Neptune: 60190, Pluto: 90560 }[p.key];
    addSolarBody({
      key: "p:" + p.key, name: p.key, kind: p.dwarf ? "dwarf" : "planet", color: p.color, radius: p.r, period,
      size: p.r > 20000 ? 10 : p.key === "Earth" ? 9 : 7, orbitOpacity: p.key === "Earth" ? .45 : .3,
      getH: t => helioEcl(p.key, t),
      orbitPts() { const pts = []; for (let k = 0; k <= 240; k++) pts.push(helioEcl(p.key, t0.AddDays(-period / 2 + period * k / 240))); return pts; },
    });
  });
}
function initSmallBodies() {
  for (const o of SOLAR.filter(o => o.small)) { sS.remove(o.pt); sS.remove(o.orbitLine); dropLabel(o.lbl); }
  for (let k = SOLAR.length - 1; k >= 0; k--) if (SOLAR[k].small) SOLAR.splice(k, 1);
  const add = (b, kind) => {
    if (b.e == null || b.q == null || b.i == null || b.om == null || b.w == null) return;
    if (b.e < 1 && b.tp == null && (b.ma == null || b.epoch == null)) return;
    if (b.e >= 1 && b.tp == null) return;
    addSolarBody({
      key: "sb:" + (b.des || b.id), name: cleanName(b.name || b.full), kind, small: true, b,
      color: KIND[kind].color, size: kind === "neo" ? 6 : 5, orbitOpacity: kind === "neo" ? .35 : .22,
      getH: (t, J) => smallPos(b, J), orbitPts: () => smallOrbit(b),
    });
  };
  (DATA.small || []).forEach(b => add(b, b.kind === "comet" ? "comet" : "asteroid"));
  (DATA.cad.orbits || []).forEach(b => { if (!SOLAR.some(o => o.key === "sb:" + b.des)) add(b, "neo"); });
  styleOrbits();
}

/* ================================================================ selection */
let sel = null;            // {type:'sat',idx} | {type:'moon'} | {type:'sun'} | {type:'solar',key} | {type:'launch',i} | {type:'cad',i}
let selRec = null, selOrbitAt = -1e15, selTrack = null, tween = null;
let focusS = null, focusSnap = false, zoomGoal = null;

function selKey(s) { if (!s) return ""; if (s.type === "sat") return "sat:" + SAT.ids[s.idx]; if (s.type === "solar") return s.key; if (s.type === "launch") return "launch:" + s.i; if (s.type === "cad") return "cad:" + s.i; return s.type; }
function selectSat(id, move) { const i = SAT.idx.get(String(id)); if (i == null) return; select({ type: "sat", idx: i }, move); }
function select(s, move) {
  sel = s; selRec = null; selOrbitAt = -1e15; selTrack = null; passCache = null;
  if (s.type === "sat") { try { selRec = satellite.twoline2satrec(SAT.l1[s.idx], SAT.l2[s.idx]); } catch (e) { selRec = null; } }
  const need = (s.type === "solar" || s.type === "sun") ? "solar" : (s.type === "sat" || s.type === "moon" || s.type === "launch" || s.type === "you") ? (view === "solar" ? "globe" : view) : view;
  if (need !== view) setView(need, true);
  if (move) moveCameraTo(s);
  for (const L of allLabels) L.el.classList.remove("sel");
  const L = labelFor(s); if (L) L.el.classList.add("sel");
  document.querySelectorAll("[data-key]").forEach(el => el.setAttribute("aria-current", el.dataset.key === selKey(s) ? "true" : "false"));
  styleOrbits();
  renderReadout();
  if (MOBILE && move) $("#side").dataset.open = "false";
}
function labelFor(s) {
  if (!s) return null;
  if (s.type === "sat") return SAT.labels.get(SAT.ids[s.idx]) || hoverLabel();
  if (s.type === "moon") return moonLabel;
  if (s.type === "sun") return sunLabelS;
  if (s.type === "solar") { const o = SOLAR.find(o => o.key === s.key); return o && o.lbl; }
  if (s.type === "launch") return padLabels[s.i];
  if (s.type === "you") return youLabel;
  return null;
}
let selSatLabel = null;
function hoverLabel() {
  if (!sel || sel.type !== "sat") return null;
  const id = SAT.ids[sel.idx];
  if (!selSatLabel || selSatLabel.id !== id) { dropLabel(selSatLabel); selSatLabel = makeLabel(shortName(SAT.names[sel.idx]), CATS[SAT.cat[sel.idx]].color, null); selSatLabel.id = id; }
  return selSatLabel;
}
function moveCameraTo(s) {
  if (s.type === "sat" || s.type === "moon" || s.type === "launch" || s.type === "you") {
    if (view !== "globe") return;
    let dir;
    if (s.type === "moon") dir = moonMesh.position.clone();
    else if (s.type === "launch") { const L = DATA.launches[s.i]; if (L.lat == null) return; dir = padWorld(L.lat, L.lon); }
    else if (s.type === "you") { const loc = store.get("loc", null); if (!loc) return; dir = padWorld(loc.lat, loc.lon); }
    else { const p = selRec && satellite.propagate(selRec, new Date(simMs)); if (!p || !p.position) return; dir = T3(p.position.x, p.position.y, p.position.z).multiplyScalar(1 / RE); }
    const r = dir.length(); dir.normalize();
    const cur = camE.position.length();
    const dist = s.type === "moon" ? Math.max(90, cur) : Math.min(Math.max(cur, r * 2.2, 2.4), s.type === "sat" && r > 4 ? r * 2.4 : 5);
    tween = { from: camE.position.clone(), to: dir.multiplyScalar(dist).add(new THREE.Vector3(0, dist * .15, 0)), t0: performance.now(), dur: 900 };
  } else if (s.type === "solar" || s.type === "sun") {
    focusS = s; focusSnap = false;
    const o = s.type === "solar" && SOLAR.find(o => o.key === s.key);
    if (s.type === "sun") zoomGoal = 160;
    else if (o.kind === "planet" || o.kind === "dwarf") zoomGoal = o.key === "p:Earth" ? 18 : Math.max(14, Math.min(60, len(o.h || { x: 3, y: 0, z: 0 }) * S * 0.6));
    else zoomGoal = Math.max(12, Math.min(50, len(o.h || { x: 3, y: 0, z: 0 }) * S * 0.45));
  }
}
function focusPosS() {
  if (!focusS || focusS.type === "sun") return new THREE.Vector3();
  const o = SOLAR.find(o => o.key === focusS.key); return o && o.pos3 ? o.pos3.clone() : new THREE.Vector3();
}

/* ================================================================ views */
function setView(v, fromSelect) {
  view = v;
  $("#vGlobe").setAttribute("aria-pressed", v === "globe"); $("#vMap").setAttribute("aria-pressed", v === "map"); $("#vSolar").setAttribute("aria-pressed", v === "solar");
  canvas.hidden = v === "map"; mapCanvas.hidden = v !== "map"; $("#credit").hidden = v === "solar";
  ctlE.enabled = v === "globe"; ctlS.enabled = v === "solar";
  for (const L of allLabels) { L.el.hidden = true; L.shown = false; }
  $("#tip").hidden = true;
  $("#hint").textContent = v === "map" ? "Click any dot · the shaded area is night" : "Drag to rotate · scroll or pinch to zoom · click any dot";
  if (!fromSelect) {
    if (v === "solar" && (!sel || (sel.type !== "solar" && sel.type !== "sun"))) select({ type: "solar", key: "p:Earth" }, true);
    if (v !== "solar" && sel && (sel.type === "solar" || sel.type === "sun")) { const iss = SAT.idx.get("25544"); if (iss != null) select({ type: "sat", idx: iss }, true); }
  }
  resize();
}
$("#vGlobe").onclick = () => setView("globe");
$("#vMap").onclick = () => setView("map");
$("#vSolar").onclick = () => setView("solar");
$("#mobToggle").onclick = () => { const s = $("#side"); s.dataset.open = s.dataset.open === "true" ? "false" : "true"; };

/* ================================================================ globe update */
const moonLabel = makeLabel("Moon", KIND.moon.color, () => select({ type: "moon" }, true));
const sunLabelE = makeLabel("Sun", "#ffd36b", () => select({ type: "sun" }, true));
const planetLabelsE = {};
const PLANET_DIR_KEYS = ["Mercury", "Venus", "Mars", "Jupiter", "Saturn"];
PLANET_DIR_KEYS.forEach(k => {
  const p = PLANETS.find(x => x.key === k);
  planetDotsE[k] = dotPoint(p.color, 6); sE.add(planetDotsE[k]);
  planetLabelsE[k] = makeLabel(k, p.color, () => select({ type: "solar", key: "p:" + k }, true));
});
let planetDirAt = -1e15;
const padGroup = new THREE.Group(); earth.add(padGroup);
let padLabels = [];
function padLocal(lat, lon) { const la = lat * DEG, lo = lon * DEG, r = 1.002; return new THREE.Vector3(r * Math.cos(la) * Math.cos(lo), r * Math.sin(la), -r * Math.cos(la) * Math.sin(lo)); }
function padWorld(lat, lon) { return earth.localToWorld(padLocal(lat, lon)); }
function shortRocket(r) { return (r || "Launch").replace(/\s+(Block|Blk|v\d|FT)\b.*$/i, "").replace(/\s*\(.*\)/, "").slice(0, 18); }
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
// How exact a launch date is. Launch Library marks "sometime in October" as a midnight timestamp;
// we must not present that as a real countdown.
function launchWhen(L) {
  const t = Date.parse(L.net), d = new Date(t);
  let p = (L.precision || "").toLowerCase();
  if (!p) {   // data from before the updater stored precision: midnight UTC + unconfirmed = not a real time
    const midnight = isFinite(t) && d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
    p = midnight && /tb[dc]/i.test(L.status || "") ? "approx" : "exact";
  }
  const exact = /second|minute|hour|exact/.test(p);
  const mon = MONTHS[d.getUTCMonth()], yr = d.getUTCFullYear(), day = d.getUTCDate();
  let label;
  if (exact) label = localTime(t);
  else if (/morning|afternoon|day/.test(p) && !/approx/.test(p)) label = `${mon.slice(0, 3)} ${day} · time not set`;
  else if (/week/.test(p)) label = `Week of ${mon.slice(0, 3)} ${day}`;
  else if (/quarter|q[1-4]/.test(p)) label = `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${yr}`;
  else if (/half/.test(p)) label = `${d.getUTCMonth() < 6 ? "First" : "Second"} half of ${yr}`;
  else if (/year/.test(p)) label = String(yr);
  else label = `${mon} ${yr} · date not set`;   // month precision, or unknown
  return { t, exact, label, short: exact ? whenText(t) : label.replace(/ · .*$/, "").replace(/^(\w{3})\w* (\d{4})$/, "$1 $2") };
}
function inWords(ms) {
  const s = Math.max(0, Math.floor(ms / 1000)), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
  const plural = (n, w) => n + " " + w + (n === 1 ? "" : "s");
  if (d) return plural(d, "day") + " " + h + " h " + m + " min";
  if (h) return h + " h " + m + " min " + sec + " s";
  return m + " min " + sec + " s";
}
function whenText(t) {
  const h = (t - Date.now()) / 3600000;
  if (!isFinite(h)) return "soon"; if (h < 0) return "launched"; if (h < 1) return "within the hour";
  if (h < 36) return "in " + Math.round(h) + " h"; return "in " + Math.round(h / 24) + " days";
}
function buildPads() {
  padGroup.clear(); padLabels.forEach(dropLabel); padLabels = [];
  DATA.launches.forEach((L, i) => {
    if (L.lat == null || L.lon == null || i > 5) { padLabels.push(null); return; }
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.009), new THREE.MeshBasicMaterial({ color: 0xffb44a }));
    m.position.copy(padLocal(L.lat, L.lon)); padGroup.add(m);
    padLabels.push(makeLabel(shortRocket(L.rocket) + " · " + launchWhen(L).short, "#ffb44a", () => select({ type: "launch", i }, true), "pad"));
  });
}
let youMarker = null, youLabel = null;
function updateYouMarker() {
  const loc = store.get("loc", null);
  if (youMarker) { earth.remove(youMarker); youMarker = null; }
  if (!loc) { dropLabel(youLabel); youLabel = null; return; }
  youMarker = new THREE.Mesh(new THREE.SphereGeometry(0.008, 12, 8), new THREE.MeshBasicMaterial({ color: 0x5fe39a }));
  youMarker.position.copy(padLocal(loc.lat, loc.lon)); earth.add(youMarker);
  if (!youLabel) youLabel = makeLabel("You", "#5fe39a", () => select({ type: "you" }, true));
}

function updateGlobe() {
  earth.rotation.y = st.gmst; earth.updateMatrixWorld();
  const sd = T3(st.sunDir.x, st.sunDir.y, st.sunDir.z);
  earthMat.uniforms.sunDir.value.copy(sd); atmo.material.uniforms.sunDir.value.copy(sd); haze.material.uniforms.sunDir.value.copy(sd); satMat.uniforms.sunDir.value.copy(sd);
  sunSpriteE.position.copy(sd).multiplyScalar(1800);
  const m = T3(st.moonKm.x, st.moonKm.y, st.moonKm.z).multiplyScalar(1 / RE);
  moonMesh.position.copy(m); moonMesh.lookAt(0, 0, 0); moonMesh.rotateY(-Math.PI / 2); moonLight.position.copy(m).add(sd.clone().multiplyScalar(10));
  if (!moonOrbitLine.userData.J || Math.abs(st.J - moonOrbitLine.userData.J) > 0.5) {
    const pts = []; for (let k = 0; k <= 200; k++) { const t = st.t.AddDays(-13.66 + k / 200 * 27.32); const v = A.RotateVector(st.rot, A.GeoMoon(t)); pts.push(T3(v.x, v.y, v.z).multiplyScalar(AU_KM / RE)); }
    setLine(moonOrbitLine, pts); moonOrbitLine.userData.J = st.J;
  }
  if (Math.abs(simMs - planetDirAt) > 600000) {
    PLANET_DIR_KEYS.forEach(k => { const v = A.RotateVector(st.rot, A.GeoVector(A.Body[k], st.t, true)); const d = T3(v.x, v.y, v.z).normalize().multiplyScalar(1200); setDot(planetDotsE[k], d); planetDotsE[k].userData.dir = d; });
    planetDirAt = simMs;
  }
  // selected satellite: smooth main-thread position, orbit path, drop line
  selOrbitE.visible = selDropE.visible = selRing.visible = false;
  if (sel && sel.type === "sat" && selRec) {
    const pv = satellite.propagate(selRec, st.date);
    if (pv && pv.position) {
      const p = T3(pv.position.x, pv.position.y, pv.position.z).multiplyScalar(1 / RE);
      sel.p = p; sel.pv = pv;
      selRing.position.copy(p); selRing.visible = true; selRing.material.color.set(CATS[SAT.cat[sel.idx]].color);
      const a = selDropE.geometry.attributes.position, s = p.clone().normalize();
      a.setXYZ(0, p.x, p.y, p.z); a.setXYZ(1, s.x, s.y, s.z); a.needsUpdate = true; selDropE.visible = true;
      selDropE.material.color.set(CATS[SAT.cat[sel.idx]].color);
      if (Math.abs(simMs - selOrbitAt) > Math.max(20000, rate * 1500)) {
        const P = SAT.period[sel.idx] * 60000, pts = [];
        for (let k = 0; k <= 200; k++) { const q = satellite.propagate(selRec, new Date(simMs + k / 200 * P)); if (q && q.position) pts.push(T3(q.position.x, q.position.y, q.position.z).multiplyScalar(1 / RE)); }
        setLine(selOrbitE, pts); selOrbitE.material.color.set(CATS[SAT.cat[sel.idx]].color); selOrbitAt = simMs;
      }
      selOrbitE.visible = true;
    }
  }
  // labels
  for (const [id, L] of SAT.labels) { const i = SAT.idx.get(id); if (i == null || !layerOn.stations) continue; const v = satECI(i); if (!v.x && !v.y) continue; wantLabel(L, T3(v.x, v.y, v.z).multiplyScalar(1 / RE), camE, 50, true); }
  if (sel && sel.type === "sat" && sel.p) wantLabel(labelFor(sel), sel.p, camE, 100, true);
  wantLabel(moonLabel, m, camE, 45, true);
  wantLabel(sunLabelE, sunSpriteE.position, camE, 30, true);
  PLANET_DIR_KEYS.forEach(k => planetDotsE[k].userData.dir && wantLabel(planetLabelsE[k], planetDotsE[k].userData.dir, camE, 28, true));
  padLabels.forEach((L, i) => { if (!L) return; const Ln = DATA.launches[i]; wantLabel(L, padWorld(Ln.lat, Ln.lon), camE, sel && sel.type === "launch" && sel.i === i ? 100 : 20, true); });
  if (youLabel) { const loc = store.get("loc", null); if (loc) wantLabel(youLabel, padWorld(loc.lat, loc.lon), camE, 60, true); }
}

/* ================================================================ solar update */
function updateSolar() {
  const t = st.t;
  for (const o of SOLAR) {
    o.h = o.getH(t, st.J);
    o.pos3 = new THREE.Vector3(o.h.x * S, o.h.z * S, -o.h.y * S);
    setDot(o.pt, o.pos3);
  }
  const earthO = SOLAR.find(o => o.key === "p:Earth");
  st.earthH = earthO.h;
  // follow the selected body: glide the target to it, then lock on
  const target = focusPosS();
  const d = target.clone().sub(ctlS.target);
  const k = focusSnap ? 1 : 0.14;
  ctlS.target.addScaledVector(d, k); camS.position.addScaledVector(d, k);
  if (!focusSnap && d.length() < 0.02) focusSnap = true;
  if (zoomGoal) {
    const off = camS.position.clone().sub(ctlS.target), L0 = off.length(), L1 = L0 + (zoomGoal - L0) * 0.12;
    camS.position.copy(ctlS.target).add(off.setLength(L1));
    if (Math.abs(L1 - zoomGoal) < 0.05) zoomGoal = null;
  }
  const so = sel && sel.type === "solar" ? SOLAR.find(o => o.key === sel.key) : null;
  if (so && so.key !== "p:Earth") {
    const a = earthToSel.geometry.attributes.position; a.setXYZ(0, earthO.pos3.x, earthO.pos3.y, earthO.pos3.z); a.setXYZ(1, so.pos3.x, so.pos3.y, so.pos3.z); a.needsUpdate = true;
    earthToSel.geometry.computeBoundingSphere(); earthToSel.visible = true;
  } else earthToSel.visible = false;
  for (const o of SOLAR) {
    const prio = sel && sel.type === "solar" && sel.key === o.key ? 100 : o.key === "p:Earth" ? 80 : o.kind === "planet" ? 60 : o.kind === "dwarf" ? 40 : o.kind === "neo" ? 22 : o.kind === "comet" ? 30 : 25;
    wantLabel(o.lbl, o.pos3, camS, prio, false);
  }
  wantLabel(sunLabelS, new THREE.Vector3(), camS, sel && sel.type === "sun" ? 100 : 70, false);
}

/* ================================================================ 2D map */
const mctx = mapCanvas.getContext("2d");
let mapImg = null;   // canvas or image used as the base layer
function mapRect() {
  const W = mapCanvas.clientWidth, H = mapCanvas.clientHeight, w = Math.min(W, H * 2), h = w / 2;
  return { x0: (W - w) / 2, y0: (H - h) / 2, w, h, W, H };
}
const mx = (R, lon) => R.x0 + ((lon + 180) / 360) * R.w;
const my = (R, lat) => R.y0 + ((90 - lat) / 180) * R.h;
function eciToLatLon(v, gmst) {
  let lon = Math.atan2(v.y, v.x) - gmst; lon = ((lon + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  return { lat: Math.atan2(v.z, Math.hypot(v.x, v.y)) / DEG, lon: lon / DEG };
}
function polyWrap(R, pts) {   // draw lat/lon polyline, breaking at the date line
  let prev = null; mctx.beginPath();
  for (const p of pts) { const x = mx(R, p.lon), y = my(R, p.lat); if (!prev || Math.abs(x - prev) > R.w / 2) mctx.moveTo(x, y); else mctx.lineTo(x, y); prev = x; }
  mctx.stroke();
}
let mapDots = null;
function drawMap() {
  const R = mapRect(), dpr = PR;
  if (mapCanvas.width !== Math.round(R.W * dpr) || mapCanvas.height !== Math.round(R.H * dpr)) { mapCanvas.width = Math.round(R.W * dpr); mapCanvas.height = Math.round(R.H * dpr); }
  mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  mctx.fillStyle = "#04060b"; mctx.fillRect(0, 0, R.W, R.H);
  if (mapImg) mctx.drawImage(mapImg, R.x0, R.y0, R.w, R.h);
  // graticule
  mctx.strokeStyle = "rgba(160,180,220,.10)"; mctx.lineWidth = 1;
  for (let lo = -150; lo <= 150; lo += 30) { mctx.beginPath(); mctx.moveTo(mx(R, lo), R.y0); mctx.lineTo(mx(R, lo), R.y0 + R.h); mctx.stroke(); }
  for (let la = -60; la <= 60; la += 30) { mctx.beginPath(); mctx.moveTo(R.x0, my(R, la)); mctx.lineTo(R.x0 + R.w, my(R, la)); mctx.stroke(); }
  // night
  const sunLL = eciToLatLon(st.sunDir, st.gmst);
  let dec = sunLL.lat * DEG; if (Math.abs(dec) < 1e-3) dec = 1e-3;
  const edgeY = dec > 0 ? R.y0 + R.h : R.y0;
  const night = new Path2D(); night.moveTo(R.x0, edgeY);
  for (let k = 0; k <= 180; k++) { const lon = -180 + k * 2, H = (lon - sunLL.lon) * DEG; const lat = Math.atan(-Math.cos(H) / Math.tan(dec)) / DEG; night.lineTo(mx(R, lon), my(R, lat)); }
  night.lineTo(R.x0 + R.w, edgeY); night.closePath();
  mctx.fillStyle = "rgba(2,5,14,.66)"; mctx.fill(night);
  if (lightsCanvas) { mctx.save(); mctx.clip(night); mctx.globalCompositeOperation = "lighter"; mctx.drawImage(lightsCanvas, R.x0, R.y0, R.w, R.h); mctx.restore(); }
  // satellites
  mapDots = [];
  for (let c = 0; c < CATS.length; c++) {
    if (!layerOn[CATS[c].key] || !SAT.byCat[c]) continue;
    mctx.fillStyle = CATS[c].color; const s = c === 0 ? 4 : CATS[c].size > 3 ? 2.4 : 1.6;
    for (const i of SAT.byCat[c]) {
      const v = satECI(i); if (!v.x && !v.y && !v.z) continue;
      const ll = eciToLatLon(v, st.gmst), x = mx(R, ll.lon), y = my(R, ll.lat);
      mctx.fillRect(x - s / 2, y - s / 2, s, s); if (c === 0 || CATS[c].size >= 4) mapDots.push([x, y, i]); else if ((i & 3) === 0) mapDots.push([x, y, i]);
    }
  }
  // sun & moon sub-points
  const moonLL = eciToLatLon(st.moonKm, st.gmst);
  mctx.fillStyle = "#ffd36b"; mctx.beginPath(); mctx.arc(mx(R, sunLL.lon), my(R, sunLL.lat), 7, 0, 7); mctx.fill();
  mctx.fillStyle = "#d7dbe4"; mctx.beginPath(); mctx.arc(mx(R, moonLL.lon), my(R, moonLL.lat), 5.5, 0, 7); mctx.fill();
  wantLabel2D(sunLabelE, mx(R, sunLL.lon) + 6, my(R, sunLL.lat), 30);
  wantLabel2D(moonLabel, mx(R, moonLL.lon) + 5, my(R, moonLL.lat), 45);
  // launch pads
  padLabels.forEach((L, i) => {
    if (!L) return; const Ln = DATA.launches[i], x = mx(R, Ln.lon), y = my(R, Ln.lat);
    mctx.fillStyle = "#ffb44a"; mctx.save(); mctx.translate(x, y); mctx.rotate(Math.PI / 4); mctx.fillRect(-3.5, -3.5, 7, 7); mctx.restore();
    wantLabel2D(L, x, y, sel && sel.type === "launch" && sel.i === i ? 100 : 20);
  });
  const loc = store.get("loc", null);
  if (loc && youLabel) { mctx.fillStyle = "#5fe39a"; mctx.beginPath(); mctx.arc(mx(R, loc.lon), my(R, loc.lat), 4, 0, 7); mctx.fill(); wantLabel2D(youLabel, mx(R, loc.lon), my(R, loc.lat), 60); }
  for (const [id, L] of SAT.labels) { const i = SAT.idx.get(id); if (i == null || !layerOn.stations) continue; const v = satECI(i); if (!v.x && !v.y) continue; const ll = eciToLatLon(v, st.gmst); wantLabel2D(L, mx(R, ll.lon), my(R, ll.lat), 50); }
  // selected satellite: ground track and coverage circle
  if (sel && sel.type === "sat" && selRec) {
    const color = CATS[SAT.cat[sel.idx]].color;
    if (!selTrack || Math.abs(simMs - selTrack.t) > Math.max(20000, rate * 1500)) {
      const P = SAT.period[sel.idx] * 60000, past = [], fut = [];
      for (let k = -100; k <= 160; k++) {
        const tt = simMs + k / 100 * P, d = new Date(tt), q = satellite.propagate(selRec, d); if (!q || !q.position) continue;
        const g = satellite.eciToGeodetic(q.position, satellite.gstime(d)); const p = { lat: g.latitude / DEG, lon: g.longitude / DEG };
        (k <= 0 ? past : fut).push(p); if (k === 0) fut.push(p);
      }
      selTrack = { t: simMs, past, fut };
    }
    mctx.lineWidth = 1.5; mctx.strokeStyle = color; mctx.globalAlpha = .35; polyWrap(R, selTrack.past);
    mctx.globalAlpha = .9; polyWrap(R, selTrack.fut); mctx.globalAlpha = 1;
    const pv = satellite.propagate(selRec, st.date);
    if (pv && pv.position) {
      const g = satellite.eciToGeodetic(pv.position, st.gmst), lat1 = g.latitude, lon1 = g.longitude;
      const lam = Math.acos(RE / (RE + Math.max(g.height, 1))), circ = [];
      for (let k = 0; k <= 120; k++) {
        const th = k / 120 * 2 * Math.PI, lat2 = Math.asin(Math.sin(lat1) * Math.cos(lam) + Math.cos(lat1) * Math.sin(lam) * Math.cos(th));
        let lon2 = lon1 + Math.atan2(Math.sin(th) * Math.sin(lam) * Math.cos(lat1), Math.cos(lam) - Math.sin(lat1) * Math.sin(lat2));
        lon2 = ((lon2 + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
        circ.push({ lat: lat2 / DEG, lon: lon2 / DEG });
      }
      mctx.setLineDash([4, 4]); mctx.globalAlpha = .6; polyWrap(R, circ); mctx.setLineDash([]); mctx.globalAlpha = 1;
      const x = mx(R, lon1 / DEG), y = my(R, lat1 / DEG);
      mctx.fillStyle = color; mctx.beginPath(); mctx.arc(x, y, 6, 0, 7); mctx.fill();
      mctx.strokeStyle = "#fff"; mctx.lineWidth = 1.5; mctx.beginPath(); mctx.arc(x, y, 10, 0, 7); mctx.stroke();
      wantLabel2D(labelFor(sel), x + 8, y, 100);
    }
  }
}
function buildMapImage(img) {
  const c = document.createElement("canvas"); c.width = 2048; c.height = 1024;
  c.getContext("2d").drawImage(img, 0, 0, 2048, 1024); mapImg = c;
}
// city lights for the map's night side (the texture's navy background is removed once)
let lightsCanvas = null;
const lightsImg = new Image();
lightsImg.onload = () => {
  const c = document.createElement("canvas"); c.width = 2048; c.height = 1024; const x = c.getContext("2d");
  x.drawImage(lightsImg, 0, 0); const d = x.getImageData(0, 0, 2048, 1024), a = d.data;
  for (let k = 0; k < a.length; k += 4) { a[k] = Math.max(0, a[k] - 30) * 1.5; a[k + 1] = Math.max(0, a[k + 1] - 30) * 1.3; a[k + 2] = Math.max(0, a[k + 2] - 62) * 0.9; }
  x.putImageData(d, 0, 0); if (!lightsCanvas) lightsCanvas = c;
};
lightsImg.src = "textures/earth_lights_2048.png";
const baseImg = new Image(); baseImg.onload = () => { if (!mapImg) buildMapImage(baseImg); }; baseImg.src = "textures/earth_atmos_2048.jpg";

/* sharper published imagery: yesterday's real Earth (day) and NASA Black Marble (night) */
function buildLightsCanvas(img, floor) {
  const W = Math.min(img.naturalWidth, 4096), H = W / 2;
  const c = document.createElement("canvas"); c.width = W; c.height = H; const x = c.getContext("2d");
  x.drawImage(img, 0, 0, W, H); const d = x.getImageData(0, 0, W, H), a = d.data;
  for (let k = 0; k < a.length; k += 4) { a[k] = Math.max(0, a[k] - floor[0]) * 1.6; a[k + 1] = Math.max(0, a[k + 1] - floor[1]) * 1.35; a[k + 2] = Math.max(0, a[k + 2] - floor[2]) * 0.8; }
  x.putImageData(d, 0, 0); return c;
}
function loadEarthImagery() {
  const src = (DATA.meta && DATA.meta.sources) || {};
  const big = renderer.capabilities.maxTextureSize >= 8192 && !MOBILE ? "8k" : "4k";
  const v = "?v=" + encodeURIComponent(DATA.meta && DATA.meta.generated || "");
  if (src.earth_image && src.earth_image.ok) {
    texLoader.load(`data/earth_day_${big}.jpg${v}`, tex => {
      tex.anisotropy = MAX_ANISO; earthMat.uniforms.dayMap.value = tex; DATA.imageryDate = src.earth_image.date;
    });
    const im = new Image(); im.onload = () => { mapImg = im; }; im.src = `data/earth_day_4k.jpg${v}`;
  }
  if (src.earth_night && src.earth_night.ok) {
    texLoader.load(`data/earth_night_${big}.jpg${v}`, tex => {
      tex.anisotropy = MAX_ANISO; earthMat.uniforms.nightMap.value = tex; earthMat.uniforms.lightsFloor.value.set(0.06, 0.06, 0.07);
    });
    const im = new Image(); im.onload = () => { lightsCanvas = buildLightsCanvas(im, [16, 16, 18]); }; im.src = `data/earth_night_4k.jpg${v}`;
  }
}

/* ================================================================ picking & hover */
const tip = $("#tip");
function nearestSat(px, py, maxPx) {
  if (!SAT.n) return null;
  if (view === "map") {
    let best = null, bd = maxPx * maxPx;
    for (const [x, y, i] of mapDots || []) { const d = (x - px) ** 2 + (y - py) ** 2; if (d < bd) { bd = d; best = i; } }
    return best;
  }
  if (view !== "globe") return null;
  camE.updateMatrixWorld(); const m = new THREE.Matrix4().multiplyMatrices(camE.projectionMatrix, camE.matrixWorldInverse).elements;
  const W = canvas.clientWidth, H = canvas.clientHeight, C = camE.position;
  let best = null, bd = maxPx * maxPx, bz = Infinity;
  for (let i = 0; i < SAT.n; i++) {
    if (!satVisible(i)) continue;
    const ex = SAT.pos[3 * i] / RE, ey = SAT.pos[3 * i + 2] / RE, ez = -SAT.pos[3 * i + 1] / RE;
    const w = m[3] * ex + m[7] * ey + m[11] * ez + m[15]; if (w <= 0) continue;
    const sx = ((m[0] * ex + m[4] * ey + m[8] * ez + m[12]) / w + 1) / 2 * W, sy = (1 - (m[1] * ex + m[5] * ey + m[9] * ez + m[13]) / w) / 2 * H;
    const d = (sx - px) ** 2 + (sy - py) ** 2; if (d > bd + 4) continue;
    // hidden behind Earth?
    const dx = ex - C.x, dy = ey - C.y, dz = ez - C.z, dd = dx * dx + dy * dy + dz * dz, t = -(C.x * dx + C.y * dy + C.z * dz) / dd;
    if (t > 0 && t < 1) { const qx = C.x + t * dx, qy = C.y + t * dy, qz = C.z + t * dz; if (qx * qx + qy * qy + qz * qz < 0.99) continue; }
    if (d < bd - 4 || w < bz) { bd = Math.min(d, bd); best = i; bz = w; }
  }
  return best;
}
function eventXY(ev) { const r = (view === "map" ? mapCanvas : canvas).getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }
let downAt = null, hoverT = 0;
[canvas, mapCanvas].forEach(cv => {
  cv.addEventListener("pointerdown", ev => { downAt = [ev.clientX, ev.clientY]; tween = null; });
  cv.addEventListener("pointerup", ev => {
    if (!downAt || Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1]) > 5) return;
    const [x, y] = eventXY(ev), i = nearestSat(x, y, ev.pointerType === "touch" ? 18 : 10);
    if (i != null) select({ type: "sat", idx: i }, false);
  });
  cv.addEventListener("pointermove", ev => {
    if (ev.pointerType === "touch" || ev.buttons) { tip.hidden = true; return; }
    const now = performance.now(); if (now - hoverT < 50) return; hoverT = now;
    const [x, y] = eventXY(ev), i = nearestSat(x, y, 8);
    if (i == null) { tip.hidden = true; cv.style.cursor = ""; return; }
    const v = satECI(i), alt = len(v) - RE;
    tip.style.setProperty("--c", CATS[SAT.cat[i]].color);
    tip.innerHTML = `<b>${esc(SAT.names[i])}</b><span>${esc(CATS[SAT.cat[i]].label)} · ${fmt(alt)} km · NORAD ${SAT.ids[i]}</span>`;
    tip.hidden = false; tip.style.left = Math.min(x + 14, innerWidth - tip.offsetWidth - 8) + "px"; tip.style.top = (y + 14) + "px";
    cv.style.cursor = "pointer";
  });
  cv.addEventListener("pointerleave", () => { tip.hidden = true; });
});
ctlS.addEventListener("start", () => { zoomGoal = null; });

/* ================================================================ passes over the viewer */
let passCache = null;
function observerOf(loc) { return { latitude: loc.lat * DEG, longitude: loc.lon * DEG, height: 0.05 }; }
function lookAt(rec, gd, ms) {
  const d = new Date(ms), pv = satellite.propagate(rec, d);
  if (!pv || !pv.position) return null;
  const la = satellite.ecfToLookAngles(gd, satellite.eciToEcf(pv.position, satellite.gstime(d)));
  return { el: la.elevation / DEG, az: la.azimuth / DEG, pos: pv.position };
}
function findPasses(rec, loc, startMs, days, maxN) {
  const gd = observerOf(loc), out = [], step = 20000, end = startMs + days * 86400000;
  const elAt = ms => { const l = lookAt(rec, gd, ms); return l ? l.el : -90; };
  const refine = (a, b, rising) => { for (let k = 0; k < 12; k++) { const m = (a + b) / 2; const up = elAt(m) > 0; if (up === rising) b = m; else a = m; } return (a + b) / 2; };
  let cur = null, prevT = startMs, prevE = elAt(startMs);
  if (prevE > 0) cur = { rise: startMs, inProgress: true, max: prevE, maxT: startMs };
  for (let t = startMs + step; t <= end; t += step) {
    const e = elAt(t);
    if (!cur && e > 0 && prevE <= 0) cur = { rise: refine(prevT, t, true), max: e, maxT: t };
    if (cur) {
      if (e > cur.max) { cur.max = e; cur.maxT = t; }
      if (e <= 0) { cur.set = refine(prevT, t, false); out.push(cur); cur = null; if (out.length >= maxN) break; }
    }
    prevT = t; prevE = e;
  }
  const obs = new A.Observer(loc.lat, loc.lon, 50);
  for (const p of out) {
    const r = lookAt(rec, gd, p.rise), s = lookAt(rec, gd, p.set), top = lookAt(rec, gd, p.maxT);
    p.azRise = r ? r.az : 0; p.azSet = s ? s.az : 0;
    if (!top) { p.visible = false; continue; }
    const t = A.MakeTime(new Date(p.maxT)), eq = A.Equator(A.Body.Sun, t, obs, true, true), sunAlt = A.Horizon(t, obs, eq.ra, eq.dec, "normal").altitude;
    const rot = A.Rotation_EQJ_EQD(t), sv = A.RotateVector(rot, A.GeoVector(A.Body.Sun, t, true)), sl = len(sv);
    const sd = { x: sv.x / sl, y: sv.y / sl, z: sv.z / sl }, q = top.pos, dd = q.x * sd.x + q.y * sd.y + q.z * sd.z;
    const lit = dd > 0 || Math.sqrt(Math.max(0, len(q) ** 2 - dd * dd)) > RE;
    p.visible = lit && sunAlt < -6 && p.max > 10;
    p.sunAlt = sunAlt;
  }
  return out;
}
let locEditing = false;
function locText(loc) { return `${fmt(Math.abs(loc.lat), 2)}° ${loc.lat >= 0 ? "N" : "S"}, ${fmt(Math.abs(loc.lon), 2)}° ${loc.lon >= 0 ? "E" : "W"}`; }
function renderLocEditor(container, loc, intro) {
  container.innerHTML = `<h4>${loc ? "Change your location" : intro.title}</h4>${loc ? "" : `<p class="intro" style="margin:0 0 8px">${intro.text}</p>`}
    <div class="locrow"><button class="btn solid" data-act="gps">Use my location</button></div>
    <div class="locrow" style="margin-top:8px"><input id="locIn" value="${loc ? fmt(loc.lat, 4) + ", " + fmt(loc.lon, 4) : ""}" placeholder="latitude, longitude  e.g. 8.98, -79.52" aria-label="Latitude and longitude">
      <button class="btn ghost" data-act="set">Save</button>${loc ? '<button class="btn" data-act="cancel">Cancel</button>' : ""}</div>
    <p class="intro" id="locMsg" style="margin:6px 0 0">Negative latitude is south of the equator; negative longitude is west of Greenwich.</p>`;
  const msg = container.querySelector("#locMsg");
  container.querySelector('[data-act="gps"]').onclick = () => {
    if (!navigator.geolocation) { msg.textContent = "This browser can't share your location. Type it instead."; return; }
    msg.textContent = "Waiting for your browser to share your location…";
    navigator.geolocation.getCurrentPosition(p => setLoc(p.coords.latitude, p.coords.longitude),
      () => { msg.textContent = "Location was not shared. Allow location for this site in your browser (and for the browser in your system's privacy settings), or type it."; }, { timeout: 15000 });
  };
  const save = () => {
    const m = container.querySelector("#locIn").value.replace(/,/g, " ").trim().match(/^(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)$/);
    if (!m || Math.abs(+m[1]) > 90 || Math.abs(+m[2]) > 180) { msg.textContent = "Use two numbers in degrees: latitude, longitude. For example 8.98, -79.52 for Panama City."; return; }
    setLoc(+m[1], +m[2]);
  };
  container.querySelector('[data-act="set"]').onclick = save;
  container.querySelector("#locIn").addEventListener("keydown", e => { if (e.key === "Enter") save(); });
  const cancel = container.querySelector('[data-act="cancel"]'); if (cancel) cancel.onclick = () => { locEditing = false; renderReadout(); };
}
function renderPasses(container, rec, idx, title) {
  const loc = store.get("loc", null);
  if (!loc || locEditing) { renderLocEditor(container, loc, { title, text: "See when this satellite flies over you and whether you can spot it." }); return; }
  if (!passCache || passCache.idx !== idx || passCache.lat !== loc.lat || passCache.lon !== loc.lon || Math.abs(passCache.t - simMs) > 600000) {
    passCache = { idx, lat: loc.lat, lon: loc.lon, t: simMs, list: rec ? findPasses(rec, loc, simMs, 4, 5) : [] };
  }
  const rows = passCache.list.map(p => `<div class="pass"><div><b>${p.inProgress ? "Overhead now" : localTime(p.rise)}</b><br><span>${compass(p.azRise)} → ${compass(p.azSet)} · ${Math.max(1, Math.round((p.set - p.rise) / 60000))} min</span></div>
     <div style="text-align:right"><b>${fmt(p.max)}°</b><br>${p.visible ? '<span class="chip ok">Visible</span>' : '<span>Not visible</span>'}</div></div>`).join("");
  container.innerHTML = `<div class="lochead"><h4>${title}</h4><span><button class="btn" data-act="edit">Edit</button><button class="btn" data-act="clear">Clear</button></span></div>
    <div class="locline">From ${locText(loc)}</div>
    ${rows || '<p class="intro" style="margin:0">No passes above the horizon in the next 4 days. Its orbit may not reach your latitude.</p>'}
    <p class="intro" style="margin:8px 0 0">Times in your time zone. Height is the highest point in degrees above the horizon. "Visible" means it is sunlit while your sky is dark.</p>`;
  container.querySelector('[data-act="edit"]').onclick = () => { locEditing = true; renderReadout(); };
  container.querySelector('[data-act="clear"]').onclick = () => { store.set("loc", null); locEditing = false; passCache = null; updateYouMarker(); if (sel && sel.type === "you") select({ type: "moon" }, false); else renderReadout(); };
}
function setLoc(lat, lon) { store.set("loc", { lat, lon }); locEditing = false; passCache = null; updateYouMarker(); renderReadout(); }

/* ================================================================ readout */
const ro = $("#readout");
function renderReadout() {
  if (!sel) { ro.hidden = true; return; }
  if (sel.type === "status") { renderStatus(); return; }
  ro.hidden = false;
  let kind, name, color, note = "", sub = "";
  if (sel.type === "sat") {
    const c = CATS[SAT.cat[sel.idx]];
    kind = c.label; name = SAT.names[sel.idx]; color = c.color;
    const intl = SAT.l1[sel.idx].slice(9, 17).trim();
    sub = `NORAD ${SAT.ids[sel.idx]}${intl ? " · launch ID " + esc(intl) : ""} <span id="litChip"></span>`;
    note = `Position from the latest public orbit data (CelesTrak / US Space Force). <a href="https://www.n2yo.com/satellite/?s=${SAT.ids[sel.idx]}" target="_blank" rel="noopener">More on N2YO</a>`;
  } else if (sel.type === "moon") { kind = KIND.moon.label; name = "Moon"; color = KIND.moon.color; note = "Shown at true size and distance from Earth. Zoom out on the globe to find it."; }
  else if (sel.type === "sun") { kind = "Star"; name = "Sun"; color = "#ffd36b"; }
  else if (sel.type === "solar") {
    const o = SOLAR.find(o => o.key === sel.key); if (!o) { ro.hidden = true; return; }
    kind = KIND[o.kind].label; name = o.name; color = o.color;
    if (o.small) {
      const b = o.b;
      sub = `Perihelion ${fmt(b.q, 3)} AU · inclination ${fmt(b.i, 1)}°${b.diameter ? " · about " + fmt(b.diameter, b.diameter < 10 ? 1 : 0) + " km wide" : ""}`;
      note = esc(b.note || (o.kind === "neo" ? "Close-approach object from NASA JPL's list." : "")) + (b.seed ? " Starter orbit; the first data update replaces it with JPL's latest." : " Orbit from NASA JPL's Small-Body Database, refreshed every 3 hours.");
      note += ` <a href="https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=${encodeURIComponent(b.des || b.full || b.name)}" target="_blank" rel="noopener">JPL page</a>`;
    } else {
      sub = `Radius ${fmt(o.radius)} km`;
      note = "Position from the Astronomy Engine planetary model (accurate to under an arcminute).";
    }
  } else if (sel.type === "launch") {
    const L = DATA.launches[sel.i]; kind = KIND.launch.label; name = L.mission || L.name; color = KIND.launch.color;
    sub = esc([L.provider, L.rocket].filter(Boolean).join(" · "));
    note = (launchWhen(L).exact ? "" : "<b>The date is not confirmed yet.</b> The provider has only given a rough timeframe. ") + esc(trimText(L.description, 380)) + (L.link ? ` <a href="${esc(L.link)}" target="_blank" rel="noopener">${/youtu|x\.com|twitter|live/i.test(L.link) ? "Watch" : "More info"}</a>` : "");
  } else if (sel.type === "you") {
    kind = "Your location"; name = "You are here"; color = "#5fe39a";
    note = "Saved only in this browser. Use Edit to change it or Clear to remove it.";
  } else if (sel.type === "cad") {
    const c = DATA.cad.approaches[sel.i]; kind = KIND.neo.label; name = cleanName(c.name); color = KIND.neo.color;
    note = "No orbit was published for this object in the latest update, so it isn't drawn in the solar view.";
  }
  ro.style.setProperty("--c", color);
  ro.innerHTML = `<button class="btn" id="closeRO" aria-label="Close details">✕</button><div class="kind">${esc(kind)}</div><h3></h3>
    <div class="sub">${sub}</div><dl class="kv" id="kv"></dl>${note ? `<div class="note">${note}</div>` : ""}${sel.type === "sat" || sel.type === "you" ? '<div class="passes" id="passes"></div>' : ""}`;
  ro.querySelector("h3").textContent = name;
  ro.querySelector("#closeRO").onclick = () => { ro.hidden = true; };
  updateReadout();
  if (sel.type === "sat") renderPasses(ro.querySelector("#passes"), selRec, sel.idx, "Passes over you");
  if (sel.type === "you") { const i = SAT.idx.get("25544"); let rec = null; try { rec = i != null ? satellite.twoline2satrec(SAT.l1[i], SAT.l2[i]) : null; } catch (e) { rec = null; } renderPasses(ro.querySelector("#passes"), rec, "you", "ISS passes over you"); }
}
function updateReadout() {
  const kv = ro.querySelector("#kv"); if (!kv || ro.hidden || !sel || sel.type === "status") return;
  let rows = "";
  if (sel.type === "sat") {
    const pv = selRec && satellite.propagate(selRec, new Date(simMs));
    if (!pv || !pv.position) rows = `<dt>Status</dt><dd>No position (re-entered or data too old)</dd>`;
    else {
      const g = satellite.eciToGeodetic(pv.position, satellite.gstime(new Date(simMs)));
      const age = (simMs - SAT.epoch[sel.idx]) / 86400000, a = Math.pow(398600.4418 / Math.pow(selRec.no / 60, 2), 1 / 3);
      const apo = a * (1 + selRec.ecco) - RE, peri = a * (1 - selRec.ecco) - RE;
      const sd = st.sunDir, p = pv.position, dd = p.x * sd.x + p.y * sd.y + p.z * sd.z, lit = dd > 0 || Math.sqrt(Math.max(0, len(p) ** 2 - dd * dd)) > RE;
      rows = `<dt>Over</dt><dd>${latlon(g.latitude / DEG, g.longitude / DEG)}</dd><dt>Altitude</dt><dd>${fmt(g.height)} km</dd>
        <dt>Speed</dt><dd>${fmt(len(pv.velocity), 2)} km/s</dd><dt>Orbit</dt><dd>${fmt(SAT.period[sel.idx], 1)} min</dd>
        <dt>Range</dt><dd>${fmt(peri)}–${fmt(apo)} km</dd><dt>Inclination</dt><dd>${fmt(SAT.incl[sel.idx], 2)}°</dd>
        <dt>Data from</dt><dd>${Math.abs(age) < 2 ? fmt(Math.abs(age) * 24, 1) + " h" : fmt(Math.abs(age), 1) + " days"} ${age < 0 ? "ahead" : "ago"}</dd>`;
      const chip = ro.querySelector("#litChip");
      if (chip) chip.innerHTML = (lit ? '<span class="chip sun">Sunlit</span>' : '<span class="chip dark">In Earth\'s shadow</span>') + (Math.abs(age) > 7 ? ' <span class="chip old">Old data</span>' : "");
    }
  } else if (sel.type === "moon") {
    const d = len(st.moonKm), ill = A.Illumination(A.Body.Moon, st.t).phase_fraction, ph = A.MoonPhase(st.t);
    const name = ph < 10 || ph > 350 ? "New moon" : ph < 80 ? "Waxing crescent" : ph < 100 ? "First quarter" : ph < 170 ? "Waxing gibbous" : ph < 190 ? "Full moon" : ph < 260 ? "Waning gibbous" : ph < 280 ? "Last quarter" : "Waning crescent";
    const nf = A.SearchMoonPhase(180, st.t, 40), nn = A.SearchMoonPhase(0, st.t, 40);
    rows = `<dt>Distance</dt><dd>${fmt(d)} km</dd><dt>Phase</dt><dd>${name}</dd><dt>Lit</dt><dd>${fmt(ill * 100)}%</dd>
      <dt>Next full</dt><dd>${nf ? localTime(nf.date.getTime()) : "—"}</dd><dt>Next new</dt><dd>${nn ? localTime(nn.date.getTime()) : "—"}</dd><dt>Light time</dt><dd>${lightTime(d)}</dd>`;
  } else if (sel.type === "sun") {
    const d = len(st.sunKm);
    rows = `<dt>Distance</dt><dd>${fmt(d / AU_KM, 4)} AU</dd><dt></dt><dd>${fmt(d / 1e6, 2)} million km</dd><dt>Light time</dt><dd>${lightTime(d)}</dd>`;
  } else if (sel.type === "solar") {
    const o = SOLAR.find(o => o.key === sel.key); if (!o || !o.h) return;
    const eH = st.earthH || helioEcl("Earth", st.t);
    const r = len(o.h);
    let de, v;
    if (!o.small) {
      de = o.key === "p:Earth" ? 0 : geoDistAU(o.key.slice(2), st.t);
      const h2 = helioEcl(o.key.slice(2), st.t.AddDays(1 / 24)); v = len(sub(h2, o.h)) * AU_KM / 3600;
    } else {
      de = len(sub(o.h, eH)); const a = semiMajor(o.b); v = Math.sqrt(GM_SUN * (2 / (r * AU_KM) - 1 / (a * AU_KM)));
    }
    rows = (o.key === "p:Earth" ? "" : `<dt>From Earth</dt><dd>${fmt(de, 3)} AU</dd><dt></dt><dd>${fmt(de * AU_KM / 1e6, 1)} million km</dd>`) +
      `<dt>From Sun</dt><dd>${fmt(r, 3)} AU</dd><dt>Speed</dt><dd>${fmt(v, 1)} km/s</dd>` + (o.key === "p:Earth" ? "" : `<dt>Light time</dt><dd>${lightTime(de * AU_KM)}</dd>`);
    if (!o.small) rows += `<dt>Year</dt><dd>${o.period < 1000 ? fmt(o.period) + " days" : fmt(o.period / 365.25, 1) + " years"}</dd>`;
    else rows += o.b.e < 1 ? `<dt>Orbit</dt><dd>${fmt(Math.pow(semiMajor(o.b), 1.5), 2)} years</dd>` : `<dt>Orbit</dt><dd>Escaping (e = ${fmt(o.b.e, 3)})</dd>`;
    if (o.kind === "neo") { const c = DATA.cad.approaches.find(c => c.des === o.b.des); if (c) rows += cadRows(c); }
  } else if (sel.type === "launch") {
    const L = DATA.launches[sel.i], w = launchWhen(L), now = Date.now();
    const count = !w.exact ? "Not set yet" : w.t > now ? "in " + inWords(w.t - now) : "Scheduled " + ago(now - w.t).replace(" ago", "") + " ago";
    rows = `<dt>Launch</dt><dd>${esc(w.label)}</dd><dt>Countdown</dt><dd>${count}</dd>${w.exact && L.window_end && L.window_end !== L.window_start ? `<dt>Window closes</dt><dd>${localTime(Date.parse(L.window_end))}</dd>` : ""}
      <dt>Status</dt><dd>${esc(L.status || "—")}</dd><dt>Orbit</dt><dd>${esc(L.orbit || "—")}</dd><dt>Pad</dt><dd>${esc(L.pad || "—")}</dd><dt>Site</dt><dd>${esc(L.location || "—")}</dd>`;
  } else if (sel.type === "cad") rows = cadRows(DATA.cad.approaches[sel.i]);
  else if (sel.type === "you") {
    const loc = store.get("loc", null);
    if (!loc) rows = `<dt>Location</dt><dd>Not set</dd>`;
    else {
      const obs = new A.Observer(loc.lat, loc.lon, 50), eq = A.Equator(A.Body.Sun, st.t, obs, true, true), alt = A.Horizon(st.t, obs, eq.ra, eq.dec, "normal").altitude;
      const sky = alt > 0 ? "Daylight" : alt > -6 ? "Twilight" : alt > -18 ? "Getting dark" : "Dark night";
      rows = `<dt>Position</dt><dd>${locText(loc)}</dd><dt>Sun</dt><dd>${fmt(Math.abs(alt), 1)}° ${alt >= 0 ? "above" : "below"} horizon</dd><dt>Sky</dt><dd>${sky}</dd>`;
    }
  }
  kv.innerHTML = rows;
}
function cadRows(c) {
  const t = (c.jd - 2440587.5) * 86400000;
  return `<dt>Closest</dt><dd>${localTime(t)}</dd><dt>Miss distance</dt><dd>${fmt(c.ld, 2)} × Moon</dd><dt></dt><dd>${fmt(c.au * AU_KM)} km</dd>
    <dt>Speed vs Earth</dt><dd>${fmt(c.v, 1)} km/s</dd><dt>Size</dt><dd>${c.diameter ? fmt(c.diameter * 1000) + " m" : estSize(c.H)}</dd>`;
}
function estSize(H) { if (H == null) return "—"; const lo = 1329 / Math.sqrt(0.25) * Math.pow(10, -H / 5) * 1000, hi = 1329 / Math.sqrt(0.05) * Math.pow(10, -H / 5) * 1000; return `${fmt(lo)}–${fmt(hi)} m (est.)`; }

/* ================================================================ side panel */
function buildLayers() {
  const el = $("#layers"); el.innerHTML = "";
  CATS.forEach((c, k) => {
    const n = SAT.byCat[k] ? SAT.byCat[k].length : 0;
    if (!n && c.key !== "debris") return;
    const b = document.createElement("button"); b.className = "chip-t"; b.type = "button"; b.style.setProperty("--c", c.color);
    b.setAttribute("aria-pressed", layerOn[c.key] ? "true" : "false");
    b.innerHTML = `<i></i>${esc(c.label)} <span>${c.key === "debris" && !debrisLoaded ? "" : fmt(n)}</span>`;
    b.onclick = () => setLayer(c.key, !layerOn[c.key]);
    el.appendChild(b);
  });
  $("#satTotal").textContent = SAT.n ? fmt(SAT.n) + " tracked" : "";
}
function itemBtn(key, color, name, value, onClick, subline) {
  const b = document.createElement("button"); b.className = "item" + (subline ? " two" : ""); b.type = "button"; b.dataset.key = key; b.style.setProperty("--c", color);
  b.innerHTML = `<span class="dot"></span><span class="n"></span><span class="v"></span>`;
  b.querySelector(".n").textContent = name; b.querySelector(".v").textContent = value || "";
  if (subline) { const s = document.createElement("span"); s.className = "s"; s.textContent = subline; b.querySelector(".n").appendChild(s); }
  b.setAttribute("aria-current", selKey(sel) === key ? "true" : "false");
  b.onclick = onClick; return b;
}
function grp(parent, label, count) { const g = document.createElement("div"); g.className = "grp"; g.innerHTML = `<span>${esc(label)}</span><span>${count ?? ""}</span>`; parent.appendChild(g); }
function buildList() {
  const el = $("#list"); el.innerHTML = "";
  const st0 = (SAT.byCat[CAT_INDEX.stations] || []).slice().sort((a, b) => (SAT.ids[a] === "25544" ? -1 : SAT.ids[b] === "25544" ? 1 : SAT.names[a].localeCompare(SAT.names[b])));
  if (st0.length) { grp(el, "Space stations & crew craft", st0.length); st0.slice(0, 40).forEach(i => el.appendChild(itemBtn("sat:" + SAT.ids[i], CATS[0].color, SAT.names[i], "", () => select({ type: "sat", idx: i }, true)))); }
  grp(el, "Moon & Sun");
  el.appendChild(itemBtn("moon", KIND.moon.color, "Moon", "", () => select({ type: "moon" }, true)));
  el.appendChild(itemBtn("sun", "#ffd36b", "Sun", "", () => select({ type: "sun" }, true)));
  const sections = [["Planets", o => o.kind === "planet" && o.key !== "p:Earth"], ["Dwarf planets", o => o.kind === "dwarf"], ["Asteroids", o => o.kind === "asteroid"], ["Comets", o => o.kind === "comet"], ["Flyby asteroids", o => o.kind === "neo"]];
  for (const [label, f] of sections) {
    const items = SOLAR.filter(f); if (!items.length) continue; grp(el, label, items.length);
    items.forEach(o => el.appendChild(itemBtn(o.key, o.color, o.name, "", () => select({ type: "solar", key: o.key }, true))));
  }
}
function refreshListValues() {
  document.querySelectorAll("#list .item, #results .item").forEach(b => {
    const k = b.dataset.key, v = b.querySelector(".v");
    if (k.startsWith("sat:")) { const i = SAT.idx.get(k.slice(4)); if (i != null) { const p = satECI(i); v.textContent = p.x || p.y ? fmt(len(p) - RE) + " km" : "—"; } }
    else if (k === "moon") v.textContent = fmt(len(st.moonKm) / 1000) + "k km";
    else if (k === "sun") v.textContent = fmt(len(st.sunKm) / AU_KM, 3) + " AU";
    else if (k.startsWith("p:")) v.textContent = fmt(geoDistAU(k.slice(2), st.t), 2) + " AU";
    else if (k.startsWith("sb:")) { const o = SOLAR.find(o => o.key === k); if (o && o.h && st.earthH) v.textContent = fmt(len(sub(o.h, st.earthH)), 2) + " AU"; else if (o) { const eH = helioEcl("Earth", st.t); v.textContent = fmt(len(sub(smallPos(o.b, st.J), eH)), 2) + " AU"; } }
  });
}
$("#search").addEventListener("input", () => {
  const q = $("#search").value.trim().toLowerCase(), el = $("#results"); el.innerHTML = "";
  if (!q) return;
  const res = [];
  if (/^\d+$/.test(q)) { if (SAT.idx.has(q)) res.push(SAT.idx.get(q)); for (let i = 0; i < SAT.n && res.length < 20; i++) if (SAT.ids[i].startsWith(q) && SAT.ids[i] !== q) res.push(i); }
  else for (let i = 0; i < SAT.n && res.length < 25; i++) if (SAT.names[i].toLowerCase().includes(q)) res.push(i);
  const solarHits = SOLAR.filter(o => o.name.toLowerCase().includes(q)).slice(0, 8);
  if (!res.length && !solarHits.length && !"moon".includes(q)) { el.innerHTML = `<div class="empty">Nothing matches “${esc(q)}”. Try a NORAD number, or switch on more layers.</div>`; return; }
  if ("moon".startsWith(q)) el.appendChild(itemBtn("moon", KIND.moon.color, "Moon", "", () => select({ type: "moon" }, true)));
  solarHits.forEach(o => el.appendChild(itemBtn(o.key, o.color, o.name, KIND[o.kind].label, () => select({ type: "solar", key: o.key }, true))));
  res.forEach(i => el.appendChild(itemBtn("sat:" + SAT.ids[i], CATS[SAT.cat[i]].color, SAT.names[i], "#" + SAT.ids[i], () => {
    const c = CATS[SAT.cat[i]].key; if (!layerOn[c]) setLayer(c, true); select({ type: "sat", idx: i }, true);
  })));
});
function buildFlybys() {
  const el = $("#flyList"); el.innerHTML = "";
  const list = (DATA.cad.approaches || []).map((c, i) => ({ c, i })).sort((a, b) => a.c.jd - b.c.jd);
  $("#flyCount").textContent = list.length ? list.length : "";
  if (!list.length) { el.innerHTML = `<div class="empty">${DATA.cad.generated ? "No close flybys in the next 60 days." : "Flyby data arrives with the first automatic update."}</div>`; return; }
  for (const { c, i } of list) {
    const t = (c.jd - 2440587.5) * 86400000, days = (t - Date.now()) / 86400000;
    const when = days < 1 ? "in " + fmt(days * 24) + " h" : "in " + fmt(days) + " days";
    const sizeTxt = c.diameter ? fmt(c.diameter * 1000) + " m" : c.H != null ? "~" + fmt(Math.round(1329 / Math.sqrt(0.14) * Math.pow(10, -c.H / 5) * 1000 / 5) * 5) + " m" : "";
    const b = itemBtn("cad:" + i, KIND.neo.color, cleanName(c.name), fmt(c.ld, 1) + " LD", () => {
      const o = SOLAR.find(o => o.key === "sb:" + c.des);
      if (o) select({ type: "solar", key: o.key }, true); else select({ type: "cad", i }, false);
    }, `${when} · ${fmt(c.v, 1)} km/s${sizeTxt ? " · " + sizeTxt : ""}${c.ld < 1 ? " · closer than the Moon" : ""}`);
    el.appendChild(b);
  }
}
function buildLaunches() {
  const el = $("#launchList"); el.innerHTML = "";
  $("#launchCount").textContent = DATA.launches.length || "";
  if (!DATA.launches.length) { el.innerHTML = `<div class="empty">Launch schedule arrives with the first automatic update.</div>`; return; }
  DATA.launches.forEach((L, i) => {
    const parts = (L.name || "").split("|").map(s => s.trim());
    const w = launchWhen(L);
    const b = itemBtn("launch:" + i, KIND.launch.color, parts[1] || L.name, "", () => select({ type: "launch", i }, true), `${w.label} · ${parts[0] || L.rocket || ""} · ${L.location || ""}`);
    b.querySelector(".v").dataset.i = i; if (!w.exact) b.classList.add("tbd"); el.appendChild(b);
  });
}
function tickLaunchCountdowns() {
  document.querySelectorAll("#launchList .v").forEach(v => { const L = DATA.launches[+v.dataset.i]; if (!L) return; const w = launchWhen(L); v.textContent = w.exact ? whenText(w.t) : "TBD"; });
}
const tabs = { tabObj: "pObj", tabFly: "pFly", tabLaunch: "pLaunch" };
Object.entries(tabs).forEach(([t, p]) => { $("#" + t).onclick = () => { Object.entries(tabs).forEach(([t2, p2]) => { $("#" + t2).setAttribute("aria-selected", t2 === t); $("#" + p2).hidden = t2 !== t; }); }; });

/* ================================================================ time controls */
const rateBtns = [...document.querySelectorAll("#timebar [data-rate]")], liveBtn = $("#liveBtn");
function setRate(r, isLive) {
  rate = r; live = !!isLive; if (live) simMs = Date.now();
  liveBtn.setAttribute("aria-pressed", live);
  rateBtns.forEach(b => b.setAttribute("aria-pressed", !live && +b.dataset.rate === r ? "true" : "false"));
  selOrbitAt = -1e15; selTrack = null;
}
liveBtn.onclick = () => setRate(1, true);
rateBtns.forEach(b => b.onclick = () => setRate(+b.dataset.rate, false));

/* ================================================================ freshness & auto-refresh */
// next run of the "17 */3 * * *" schedule (UTC)
function nextScheduled(from) {
  const d = new Date(from); d.setUTCMinutes(17, 0, 0);
  while (d.getTime() <= from || d.getUTCHours() % 3 !== 0) d.setUTCHours(d.getUTCHours() + 1, 17, 0, 0);
  return d.getTime();
}
const SOURCE_INFO = [
  ["satellites", "Satellite orbits", "CelesTrak", v => fmt(v.count) + " satellites"],
  ["debris", "Debris clouds", "CelesTrak", () => "4 clouds"],
  ["smallbodies", "Asteroids and comets", "NASA JPL", v => fmt(v.count) + " objects"],
  ["closeapproach", "Asteroid flybys", "NASA JPL", v => fmt(v.count) + " in next 60 days"],
  ["launches", "Launch schedule", "Launch Library 2", v => fmt(v.count) + " launches"],
  ["earth_image", "Earth daytime imagery", "NASA VIIRS", v => v.date ? "photos from " + imgDate(v.date) : ""],
  ["earth_night", "City lights", "NASA Black Marble", () => "fixed image"],
];
function imgDate(s) { const d = new Date(s + "T12:00:00Z"); return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
function renderStatus() {
  const m = DATA.meta || {}, src = m.sources || {}, now = Date.now();
  const gen = m.generated ? Date.parse(m.generated) : null;
  const rows = SOURCE_INFO.map(([k, label, from, detail]) => {
    const v = src[k];
    const state = !v ? '<span class="chip">Waiting</span>' : v.ok ? '<span class="chip ok">OK</span>' : '<span class="chip old">Failed</span>';
    return `<div class="srcrow"><div><b>${label}</b><span>${from}${v && v.ok && detail(v) ? " · " + detail(v) : ""}${v && !v.ok ? " · showing the last good copy" : ""}</span></div><div>${state}</div></div>`;
  }).join("");
  const hist = (m.history || []).slice().reverse().slice(0, 8).map(h => `<div class="histrow"><span>${localTime(Date.parse(h.at))}</span><span>${esc(h.trigger)}</span><span>${h.ok}/${h.total} OK</span></div>`).join("");
  const sched = (m.history || []).some(h => h.trigger === "scheduled");
  ro.hidden = false; ro.style.setProperty("--c", "var(--ok)");
  ro.innerHTML = `<button class="btn" id="closeRO" aria-label="Close data status">✕</button><div class="kind">Data status</div><h3>${gen ? "Updated " + ago(now - gen) : "Waiting for first update"}</h3>
    <div class="sub">${gen ? localTime(gen) + (m.trigger ? " · started by " + esc(m.trigger) : "") : ""}</div>
    <dl class="kv"><dt>Next update</dt><dd>about ${new Date(nextScheduled(now)).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</dd><dt>Schedule</dt><dd>every 3 hours</dd></dl>
    <div class="passes"><h4>Sources in the last update</h4>${rows}</div>
    ${hist ? `<div class="passes"><h4>Recent updates</h4>${hist}${sched ? "" : '<p class="intro" style="margin:6px 0 0">No scheduled update has run yet. GitHub can delay the first scheduled runs of a new workflow.</p>'}</div>` : ""}
    <div class="note">Positions are calculated live in your browser from this data. An open page checks for new data every 15 minutes. GitHub can start scheduled updates up to an hour late.${m.run_url ? ` <a href="${esc(m.run_url)}" target="_blank" rel="noopener">Log of the last update</a>` : ""}</div>`;
  ro.querySelector("#closeRO").onclick = () => { ro.hidden = true; sel = null; };
}
$("#fresh").addEventListener("click", () => { sel = { type: "status" }; for (const L of allLabels) L.el.classList.remove("sel"); renderStatus(); if (MOBILE) $("#side").dataset.open = "false"; });
function updateFreshness() {
  const el = $("#fresh"), m = DATA.meta;
  if (!m || !m.generated) { el.textContent = "starter data · first update pending"; el.className = "warn"; $("#credit").textContent = "Earth: NASA Blue Marble · night lights: NASA Black Marble"; return; }
  const age = Date.now() - Date.parse(m.generated);
  const sat = m.sources && m.sources.satellites;
  el.textContent = "data updated " + ago(age) + (sat && !sat.ok ? " · satellite feed down, using last copy" : "");
  el.className = age < 6 * 3600000 ? "ok" : age < 30 * 3600000 ? "warn" : "bad";
  const img = m.sources && m.sources.earth_image;
  $("#credit").textContent = img && img.ok && img.date ? `Earth: NASA satellite photos from ${imgDate(img.date)} · night lights: NASA Black Marble` : "Earth: NASA Blue Marble · night lights: NASA Black Marble";
}
async function loadAll(first) {
  const [meta, groups, small, cad, launches] = await Promise.all([
    fetchJSON("data/meta.json", null), fetchJSON("data/groups.json", {}), fetchJSON("data/smallbodies.json", { bodies: [] }),
    fetchJSON("data/closeapproach.json", { approaches: [], orbits: [] }), fetchJSON("data/launches.json", { launches: [] }),
  ]);
  DATA.meta = meta; DATA.groups = groups || {}; DATA.small = (small && small.bodies) || [];
  DATA.cad = cad || { approaches: [], orbits: [] }; DATA.cad.approaches = DATA.cad.approaches || []; DATA.cad.orbits = DATA.cad.orbits || [];
  DATA.launches = ((launches && launches.launches) || []).filter(L => !L.net || Date.parse(L.net) > Date.now() - 6 * 3600000);
  try { DATA.tleText.stations = await fetchText("data/tle/stations.txt"); } catch (e) { DATA.tleText.stations = ""; }
  try { DATA.tleText.active = await fetchText("data/tle/active.txt"); } catch (e) { DATA.tleText.active = ""; }
  if (debrisLoaded) await Promise.all(DEBRIS_FILES.map(async f => { try { DATA.tleText[f] = await fetchText(`data/tle/${f}.txt`); } catch (e) { /* skip */ } }));
  initSmallBodies(); buildPads(); buildFlybys(); buildLaunches(); updateFreshness(); loadEarthImagery();
  loadWorker();
  if (!first) buildList();
  if (sel && sel.type === "status") renderStatus();
}
setInterval(async () => {   // pick up new data while the page stays open
  const m = await fetchJSON("data/meta.json", null);
  if (m && m.generated && (!DATA.meta || m.generated !== DATA.meta.generated)) loadAll(false);
}, 15 * 60000);

/* ================================================================ main loop */
function resize() {
  const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
  renderer.setSize(w, h, false); camE.aspect = camS.aspect = w / h; camE.updateProjectionMatrix(); camS.updateProjectionMatrix();
}
addEventListener("resize", resize);
const utcEl = $("#utc"), modeEl = $("#mode");
let lastUI = 0, lastList = 0;
function frame(now) {
  const dt = Math.min(now - lastReal, 250); lastReal = now;
  if (live) simMs = Date.now(); else simMs += dt * rate;
  computeCommon();
  if (tween) {
    const k = Math.min(1, (now - tween.t0) / tween.dur), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    camE.position.lerpVectors(tween.from, tween.to, e); if (k >= 1) tween = null;
  }
  if (view === "globe") { updateGlobe(); ctlE.update(); renderer.render(sE, camE); }
  else if (view === "solar") { updateSolar(); ctlS.update(); renderer.render(sS, camS); }
  else drawMap();
  if (view !== "solar" && !st.earthH) st.earthH = helioEcl("Earth", st.t);
  flushLabels();
  requestProp();
  if (now - lastUI > 500) {
    lastUI = now;
    utcEl.textContent = st.date.toISOString().replace("T", " ").slice(0, 19) + " UTC";
    if (live) { modeEl.textContent = "LIVE"; modeEl.className = "live"; }
    else { const d = (simMs - Date.now()) / 86400000; modeEl.textContent = (rate === 0 ? "PAUSED " : "SIM ") + (Math.abs(d) < 1 ? (d >= 0 ? "+" : "") + fmt(d * 24, 1) + " h" : (d >= 0 ? "+" : "") + fmt(d, 1) + " d"); modeEl.className = "warp"; }
    updateReadout(); tickLaunchCountdowns();
    if (view !== "solar") st.earthH = helioEcl("Earth", st.t);
  }
  if (now - lastList > 2000) { lastList = now; refreshListValues(); updateFreshness(); }
  requestAnimationFrame(frame);
}

/* ================================================================ start */
resize();
computeCommon();
initPlanets();
updateYouMarker();
buildList();
loadAll(true).then(() => buildList());
requestAnimationFrame(frame);
})();
