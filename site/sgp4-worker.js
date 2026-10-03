/* Orbit Watch: propagates every loaded satellite with SGP4 off the main thread. */
importScripts("lib/satellite.min.js");

let recs = [];

function parseSets(sets) {
  const seen = new Set();
  const out = { names: [], ids: [], l1: [], l2: [], epoch: [], period: [], incl: [], source: [] };
  recs = [];
  for (const set of sets) {
    const L = set.text.split(/\r?\n/).filter(s => s.trim().length);
    for (let k = 0; k < L.length; k++) {
      if (!(L[k].startsWith("1 ") && L[k + 1] && L[k + 1].startsWith("2 "))) continue;
      const prev = k > 0 ? L[k - 1] : "";
      const name = prev && !prev.startsWith("1 ") && !prev.startsWith("2 ")
        ? prev.trim().replace(/^0\s+/, "")
        : "NORAD " + L[k].slice(2, 7).trim();
      const l1 = L[k].trimEnd(), l2 = L[k + 1].trimEnd();
      k++;
      let r;
      try { r = satellite.twoline2satrec(l1, l2); } catch (e) { continue; }
      if (!r || r.error) continue;
      const id = String(r.satnum).trim().replace(/^0+/, "");
      if (seen.has(id)) continue;
      seen.add(id);
      recs.push(r);
      out.names.push(name);
      out.ids.push(id);
      out.l1.push(l1);
      out.l2.push(l2);
      out.epoch.push((r.jdsatepoch + (r.jdsatepochF || 0) - 2440587.5) * 86400000);
      out.period.push((2 * Math.PI) / r.no);
      out.incl.push(r.inclo * 180 / Math.PI);
      out.source.push(set.source);
    }
  }
  return out;
}

onmessage = (e) => {
  const m = e.data;
  if (m.type === "load") {
    const out = parseSets(m.sets);
    postMessage({ type: "loaded", gen: m.gen, ...out });
  } else if (m.type === "prop") {
    const buf = m.buf;
    const date = new Date(m.t);
    const n = Math.min(recs.length, buf.length / 3);
    for (let i = 0; i < n; i++) {
      let ok = false;
      try {
        const pv = satellite.propagate(recs[i], date);
        const p = pv && pv.position;
        if (p && isFinite(p.x) && isFinite(p.y) && isFinite(p.z)) {
          buf[3 * i] = p.x; buf[3 * i + 1] = p.y; buf[3 * i + 2] = p.z;
          ok = true;
        }
      } catch (err) { /* decayed or invalid: hide */ }
      if (!ok) { buf[3 * i] = 0; buf[3 * i + 1] = 0; buf[3 * i + 2] = 0; }
    }
    postMessage({ type: "pos", t: m.t, gen: m.gen, buf }, [buf.buffer]);
  }
};
