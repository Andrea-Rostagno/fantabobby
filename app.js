"use strict";
const D = window.FANTA;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const f1 = x => x == null || isNaN(x) ? "–" : (+x).toFixed(1);
const f2 = x => x == null || isNaN(x) ? "–" : (+x).toFixed(2);
const avg = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
const sum = a => a.reduce((s, x) => s + x, 0);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const ROLES = { P: "Portieri", D: "Difensori", C: "Centrocampisti", A: "Attaccanti" };
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem("fd-" + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("fd-" + k, JSON.stringify(v)); } catch {} if (SYNC_KEYS.includes(k)) window.cloudSave?.(); },
};
const SYNC_KEYS = ["rosa", "giornate", "ovr"];

// fantamedie attese modificate a mano: { id giocatore: valore }
let OVR = store.get("ovr", {});

// ================================================================ dati
const TEAMS = D ? D.squadre : {};
const P = D ? D.giocatori : [];
const BY = new Map(P.map(p => [p.id, p]));
const NEXT = D?.giornata, LAST = D?.ultimaGiocata;
const tname = s => TEAMS[s]?.nome || s;
const tshort = s => (TEAMS[s]?.nome || s).slice(0, 3).toUpperCase();
const TCOL = { atalanta: "#1d5fb3", bologna: "#a3192a", cagliari: "#a3192a", como: "#1d3d7a", fiorentina: "#5b2a8c", frosinone: "#f7d417", genoa: "#a3192a", inter: "#0a5fb4", juventus: "#555", lazio: "#5fb8e8", lecce: "#e0c400", milan: "#d3141b", monza: "#e3141b", napoli: "#169fdb", parma: "#d9b400", roma: "#8b1c2c", sassuolo: "#00a14b", torino: "#7e1d12", udinese: "#555", venezia: "#f47a20" };
const tcol = s => TCOL[s] || "#6d4ee6";

// stemma e campioncino (immagini di fantacalcio.it, con ripiego se non caricano)
const crest = (s, size = 24) => TEAMS[s]?.logo ? `<img class="crest" style="--c:${size}px" src="${esc(TEAMS[s].logo)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : `<span class="crest" style="--c:${size}px;display:inline-block;border-radius:50%;background:${tcol(s)}"></span>`;
const tlink = (s, size = 22) => `<span class="tname" data-team="${esc(s)}">${crest(s, size)}<span>${esc(tname(s))}</span></span>`;
function av(p, size = 40, role = true) {
  if (!p) return "";
  const ini = (p.nome || "?").replace(/[^A-Za-zÀ-ú ]/g, "").split(" ").map(w => w[0]).join("").slice(0, 2);
  return `<span class="av" style="--s:${size}px"><img src="${esc(D.campioncini)}${p.id}.png" alt="" loading="lazy" onerror="this.parentNode.classList.add('err')"><span class="fb" style="background:${tcol(p.sq)}">${esc(ini)}</span>${role ? `<span class="rb ${p.R}">${p.R}</span>` : ""}</span>`;
}

// ---------------------------------------------------------------- modello
const MATCH = {}; // MATCH[g][slug] = {home, opp, gf, gs, played}
function buildModel() {
  for (const m of D.partite) {
    const played = m.status !== 0 && m.gh != null && m.g <= LAST;
    const extra = { status: m.status, inizio: m.inizio };
    (MATCH[m.g] ??= {})[m.home] = { g: m.g, home: true, opp: m.away, gf: m.gh, gs: m.ga, played, data: m.data, ...extra };
    MATCH[m.g][m.away] = { g: m.g, home: false, opp: m.home, gf: m.ga, gs: m.gh, played, data: m.data, ...extra };
  }
  for (const t of Object.values(TEAMS)) {
    t.res = [];
    for (let g = 1; g <= LAST; g++) { const x = MATCH[g]?.[t.slug]; if (x?.played) t.res.push({ ...x, r: x.gf > x.gs ? "W" : x.gf === x.gs ? "D" : "L" }); }
    t.cs = t.res.filter(r => r.gs === 0).length;
    t.next = [];
    for (let g = NEXT; g <= NEXT + 4; g++) { const x = MATCH[g]?.[t.slug]; if (x) t.next.push(x); }
  }
  const allT = Object.values(TEAMS).filter(t => t.g);
  const L = avg(allT.map(t => t.gf / t.g)) || 1.3;
  D.L = L;
  for (const t of Object.values(TEAMS)) {
    t.gfPg = t.g ? t.gf / t.g : L; t.gsPg = t.g ? t.gs / t.g : L;
    const byG = {};
    P.filter(p => p.sq === t.slug && p.voti).forEach(p => Object.entries(p.voti).forEach(([g, a]) => { if (a[1] != null) (byG[g] ??= []).push(a[1]); }));
    t.fvAvg = avg(Object.values(byG).map(avg));
  }

  // probabili formazioni → info per giocatore
  const PI = new Map(), FLAG = new Map(), BALL = new Map();
  D.probabili.forEach((m, mi) => m.squadre.forEach((sq, si) => {
    sq.titolari.forEach((x, k) => PI.set(x.id, { tit: x.tit, starter: true, mi, k }));
    sq.panchina.forEach(x => PI.set(x.id, { tit: x.tit, starter: false, mi }));
  }));
  D.probabili.forEach(m => {
    [["infortunati", "Infortunato"], ["squalificati", "Squalificato"], ["dubbi", "In dubbio"], ["diffidati", "Diffidato"]].forEach(([k, l]) => m[k].forEach(x => FLAG.set(x.id, { tipo: l, nota: x.nota })));
    m.ballottaggi.forEach(b => b.forEach(x => BALL.set(x.id, b)));
  });
  const playing = new Set(D.probabili.flatMap(m => [m.home, m.away]));
  const defBase = { P: 5.6, D: 5.9, C: 6.0, A: 6.2 };

  for (const p of P) {
    p.vl = Object.entries(p.voti || {}).map(([g, a]) => ({ g: +g, v: a[0], fv: a[1], gol: a[2] || 0, ass: a[3] || 0, gs: a[4] || 0, rp: a[5] || 0, au: a[6] || 0, rsb: a[7] || 0 })).sort((a, b) => a.g - b.g);
    const played = p.vl.filter(x => x.fv != null);
    p.last3 = [LAST - 2, LAST - 1, LAST].filter(g => g > 0).map(g => p.vl.find(x => x.g === g)?.fv ?? null);
    p.formAvg = avg(played.slice(-3).map(x => x.fv));
    const g = Math.max(p.pv, 1);
    p.bonusPg = (p.gol * 3 + p.ass) / g;
    p.malusPg = (p.amm * 0.5 + p.esp) / g;
    p.gsPg = p.R === "P" ? p.gs / g : null;
    p.pctPres = LAST ? Math.round(100 * p.pv / LAST) : 0;
    p.prob = PI.get(p.id) || null;
    p.flag = FLAG.get(p.id) || null;
    p.ballot = BALL.get(p.id) || null;
    p.tit = p.prob ? p.prob.tit : playing.has(p.sq) ? 0 : null;
    // fantamedia attesa: fantamedia "tirata" verso la media del ruolo se le presenze sono poche, + forma, + avversario
    const fmReg = (p.fm * p.pv + defBase[p.R] * 3) / (p.pv + 3);
    const base = 0.65 * fmReg + 0.35 * (p.formAvg ?? fmReg);
    const nx = TEAMS[p.sq]?.next?.[0], opp = nx && TEAMS[nx.opp];
    let adj = 0;
    if (opp) {
      adj = p.R === "A" || p.R === "C" ? (opp.gsPg - L) * (p.R === "A" ? 0.7 : 0.45) : -(opp.gfPg - L) * (p.R === "P" ? 0.9 : 0.5);
      adj += nx.home ? 0.12 : -0.08;
    }
    p.nextOpp = nx || null;
    p.adj = clamp(adj, -1.2, 1.2);
    p.xfvAuto = +clamp(base + p.adj, 4, 11).toFixed(2);
    p.manual = OVR[p.id] != null;
    p.xfv = p.manual ? OVR[p.id] : p.xfvAuto;
    // quanto spesso prende il voto: voti presi sulle partite giocate dalla sua squadra (con poche partite si resta prudenti)
    const giocate = TEAMS[p.sq]?.res.length || 0;
    p.votoPct = giocate ? Math.round(100 * clamp((p.pv + 1) / (giocate + 2), 0, 1)) : null;
    const vot = (p.votoPct ?? 50) / 100;
    // probabilità di avere un voto: il titolare quasi sempre lo prende, la riserva solo se di solito entra e gioca
    p.riserva = !!p.prob && !p.prob.starter;
    p.pVoto = !p.tit ? 0 : (p.tit / 100) * (p.riserva ? 0.85 * (0.3 + 0.7 * vot) : 0.85 + 0.15 * vot);
    p.schRaw = p.pVoto * p.xfv;
  }
  for (const R of "PDCA") {
    const pool = P.filter(p => p.R === R && p.tit > 0).map(p => p.schRaw).sort((a, b) => a - b);
    P.filter(p => p.R === R).forEach(p => {
      p.sch = p.tit > 0 && pool.length ? Math.round(100 * pool.filter(x => x <= p.schRaw).length / pool.length) : 0;
      p.stars = !p.tit ? 0 : p.sch >= 85 ? 5 : p.sch >= 65 ? 4 : p.sch >= 45 ? 3 : p.sch >= 25 ? 2 : 1;
    });
    const byFvm = P.filter(p => p.R === R && p.fvm > 0).sort((a, b) => b.fvm - a.fvm);
    byFvm.forEach((p, i) => { const q = i / byFvm.length; p.fascia = q < .06 ? "Top" : q < .18 ? "SemiTop" : q < .4 ? "Terza" : "Low"; });
  }
}

// pronostico partita con Poisson sui gol medi
function pronostico(h, a) {
  const H = TEAMS[h], A = TEAMS[a], L = D.L;
  if (!H || !A) return null;
  const lh = clamp(L * (H.gfPg / L) * (A.gsPg / L) * 1.1, .2, 4), la = clamp(L * (A.gfPg / L) * (H.gsPg / L) * .9, .2, 4);
  const pois = (l, k) => Math.exp(-l) * l ** k / [1, 1, 2, 6, 24, 120, 720, 5040][k];
  let p1 = 0, px = 0, p2 = 0, best = [0, 0, 0];
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
    const pr = pois(lh, i) * pois(la, j);
    if (i > j) p1 += pr; else if (i === j) px += pr; else p2 += pr;
    if (pr > best[2]) best = [i, j, pr];
  }
  return { gh: best[0], ga: best[1], p1: Math.round(p1 * 100), px: Math.round(px * 100), p2: Math.round(p2 * 100) };
}

// percentili per ruolo
const METRICS = [
  ["fm", "Fantamedia", "PDCA"], ["mv", "Media voto", "PDCA"], ["formAvg", "Forma (ult. 3)", "PDCA"], ["tit", "Titolarità", "PDCA"],
  ["xfv", "FM attesa", "PDCA"], ["pv", "Presenze", "PDCA"], ["gol", "Gol", "DCA"], ["ass", "Assist", "DCA"],
  ["bonusPg", "Bonus / partita", "DCA"], ["gsPg", "Gol subiti / p", "P", true], ["rp", "Rigori parati", "P"],
  ["malusPg", "Malus / partita", "PDCA", true], ["fvm", "FVM", "PDCA"],
];
function computePct(minPv = 2) {
  for (const R of "PDCA") {
    const pool = P.filter(p => p.R === R && p.pv >= minPv);
    for (const [k, , roles, inv] of METRICS) {
      if (!roles.includes(R)) continue;
      const vals = pool.map(p => p[k]).filter(v => v != null).sort((a, b) => a - b);
      for (const p of P) if (p.R === R) {
        p.pct ??= {};
        const x = p[k];
        if (x == null || !vals.length) { p.pct[k] = null; continue; }
        const below = vals.filter(v => inv ? v > x : v < x).length, eq = vals.filter(v => v === x).length;
        p.pct[k] = Math.round(100 * (below + eq / 2) / vals.length);
      }
    }
    for (const p of P) if (p.R === R) {
      let s = 0, w = 0;
      for (const [k] of METRICS) { const v = p.pct[k]; if (v == null) continue; const wt = k === "fm" || k === "xfv" ? 2.5 : k === "formAvg" || k === "tit" ? 1.5 : 1; s += v * wt; w += wt; }
      p.rating = p.pv >= minPv && w ? Math.round(s / w) : null;
    }
  }
}

// ================================================================ frammenti
const lvl = v => v == null ? "sv" : v >= 66 ? "hi" : v >= 40 ? "mid" : "lo";
const tlvl = t => t >= 70 ? "" : t >= 45 ? "mid" : "lo";
const fvCls = v => v == null ? "sv" : v >= 7 ? "hi" : v >= 6 ? "mid" : "lo";
const chipFv = v => `<span class="chip ${fvCls(v)}">${v == null ? "s.v." : f1(v)}</span>`;
const stars = n => `<span class="stars">${"★".repeat(n)}<span class="off">${"★".repeat(5 - n)}</span></span>`;
const fascia = f => f ? `<span class="fascia ${f}">${f === "Terza" ? "Terza f." : f === "Low" ? "Low cost" : f}</span>` : "";
const dots = (res, big) => `<span class="dots ${big ? "big" : ""}">${res.map(r => `<i class="${r.r}" title="G${r.g} ${r.home ? "vs" : "@"} ${esc(tname(r.opp))} ${r.gf}-${r.gs}">${{ W: "V", D: "N", L: "P" }[r.r]}</i>`).join("")}</span>`;
const titBar = t => t == null ? `<span class="dim" style="font-size:11px">–</span>` : `<div class="pl"><span class="pct ${tlvl(t)}">${t}%</span><div class="pbar ${tlvl(t)}"><i style="width:${t}%"></i></div></div>`;
// fascia di colore della fantamedia attesa (sul valore mostrato, a una cifra decimale)
const xfvCls = v => { const r = Math.round(v * 10) / 10; return r >= 8.5 ? "fire" : r >= 7 ? "good" : r >= 6 ? "" : "bad"; };
const idx = (p, sm) => `<span class="idx ${xfvCls(p.xfv)} ${p.tit ? "" : "out"} ${sm ? "sm" : ""} ${p.manual ? "manual" : ""}" data-edit="${p.id}" title="${p.manual ? `Valore manuale (automatico: ${f2(p.xfvAuto)})` : "Fantamedia attesa"} · clic per modificare">${f1(p.xfv)}</span>`;
const ring = (p, label, color, s = 84) => `<div class="ring" style="--p:${p ?? 0};--s:${s}px;--c:${color || (p >= 66 ? "var(--green)" : p >= 40 ? "var(--gold)" : "var(--red)")}"><div><div><b>${p == null ? "–" : p + "%"}</b><small>${label}</small></div></div></div>`;
const title = (t, sub, icon = "") => `<div class="ptitle"><a class="back" href="#probabili">‹</a><h1>${icon} ${t}</h1></div><div class="psub">${sub || ""}</div>`;
const ROLEBTN = (cur, fn, all = true) => `<div style="display:flex;gap:6px">${all ? `<span class="role ${cur ? "off" : ""}" style="background:linear-gradient(180deg,#e8336d,#9d1747);width:auto;padding:0 12px;border-radius:99px" onclick="${fn}('')">Tutti</span>` : ""}${"PDCA".split("").map(R => `<span class="role ${R} ${cur && cur !== R ? "off" : !cur && all ? "off" : ""}" onclick="${fn}('${R}')">${R}</span>`).join("")}</div>`;

// campo in prospettiva: trapezio disegnato in SVG, i giocatori seguono la stessa geometria
const TRAP = { top: 4, bot: 96, lt: 17, lb: 2 };            // y in %, bordo sinistro in alto/in basso
const trapL = y => TRAP.lt + (TRAP.lb - TRAP.lt) * (y - TRAP.top) / (TRAP.bot - TRAP.top);
// colori del campo per squadra: [colore principale, secondo colore, intensità strisce]
const FIELD = {
  atalanta: ["#1a4f9c", "#000000", .7], bologna: ["#9c1b2a", "#13308a", .8], cagliari: ["#9c1b2a", "#13308a", .8], como: ["#1d3d7a", "#4a7fd0"],
  fiorentina: ["#5b2a8c", "#9a6bd4"], frosinone: ["#0b3f91", "#e3c414"], genoa: ["#9c1b2a", "#12329a", .85], inter: ["#0a4fa0", "#000000", .7],
  juventus: ["#1b1b1b", "#ffffff", .55], lazio: ["#3d9ad6", "#ffffff"], lecce: ["#c9a800", "#c8102e"], milan: ["#c0141b", "#000000", .7],
  monza: ["#c8121b", "#ffffff"], napoli: ["#1288c4", "#7fd0f7"], parma: ["#f2c200", "#1b3e9a", .92], roma: ["#8b1c2c", "#f0a830"],
  sassuolo: ["#00873f", "#0b0b0b"], torino: ["#7e1d12", "#c0584a"], udinese: ["#1b1b1b", "#e8e8e8"], venezia: ["#1b1b1b", "#f47a20"],
  verona: ["#0b2e7a", "#ffd200"], empoli: ["#1667c7", "#ffffff"], cremonese: ["#a8102a", "#9a9a9a"], pisa: ["#111111", "#1f4fa3"],
};
function fieldSvg(team) {
  const [c1, c2, op = .22] = FIELD[team] || ["#3f24a8", "#2c1680"], gid = "fg-" + (team || "def");
  const L = y => trapL(y).toFixed(2), R = y => (100 - trapL(y)).toFixed(2);
  const seg = (y, x1, x2) => { const l = trapL(y), w = 100 - 2 * l; return [l + w * x1, l + w * x2]; };
  const box = (y1, y2, x1, x2) => { const [a, b] = seg(y1, x1, x2), [c, d] = seg(y2, x1, x2); return `<polyline points="${a},${y1} ${c},${y2} ${d},${y2} ${b},${y1}" />`; };
  const [cl, cr] = seg(50, .38, .62);
  return `<svg class="fsvg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c1}"/></linearGradient>
      <linearGradient id="${gid}-s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".35"/><stop offset=".6" stop-color="#000" stop-opacity="0"/></linearGradient></defs>
    <polygon points="${L(TRAP.top)},${TRAP.top} ${R(TRAP.top)},${TRAP.top} ${R(TRAP.bot)},${TRAP.bot} ${L(TRAP.bot)},${TRAP.bot}" fill="url(#${gid})"/>
    ${[1, 3, 5, 7].map(k => { const y1 = TRAP.top + (TRAP.bot - TRAP.top) * k / 9, y2 = TRAP.top + (TRAP.bot - TRAP.top) * (k + 1) / 9; return `<polygon points="${L(y1)},${y1} ${R(y1)},${y1} ${R(y2)},${y2} ${L(y2)},${y2}" fill="${c2}" fill-opacity="${op}"/>`; }).join("")}
    <polygon points="${L(TRAP.top)},${TRAP.top} ${R(TRAP.top)},${TRAP.top} ${R(TRAP.bot)},${TRAP.bot} ${L(TRAP.bot)},${TRAP.bot}" fill="url(#${gid}-s)"/>
    <g fill="none" stroke="rgba(255,255,255,.5)" stroke-width=".5" vector-effect="non-scaling-stroke">
      <polygon points="${L(TRAP.top)},${TRAP.top} ${R(TRAP.top)},${TRAP.top} ${R(TRAP.bot)},${TRAP.bot} ${L(TRAP.bot)},${TRAP.bot}"/>
      <line x1="${L(50)}" x2="${R(50)}" y1="50" y2="50"/>
      <ellipse cx="50" cy="50" rx="${((cr - cl) / 2).toFixed(2)}" ry="7"/>
      ${box(TRAP.bot, TRAP.bot - 15, .24, .76)}${box(TRAP.bot, TRAP.bot - 6, .38, .62)}
      <polyline points="${seg(TRAP.top, .27, .73)[0]},${TRAP.top} ${seg(TRAP.top + 12, .27, .73)[0]},${TRAP.top + 12} ${seg(TRAP.top + 12, .27, .73)[1]},${TRAP.top + 12} ${seg(TRAP.top, .27, .73)[1]},${TRAP.top}"/>
    </g></svg>`;
}
function pitch(modulo, players, opts = {}) {
  const lines = (modulo || "4-3-3").split("-").map(Number).filter(Boolean);
  let rows;
  if (opts.byRole) {
    // ogni giocatore nella linea del suo ruolo; i posti non coperti restano vuoti
    const need = { P: 1, D: lines[0], C: lines[1], A: lines[2] };
    rows = "PDCA".split("").map(R => { const got = players.filter(x => (BY.get(x.id) || x).R === R).slice(0, need[R]); while (got.length < need[R]) got.push({ empty: true, R }); return got; });
  } else {
    rows = [[players[0]]]; let k = 1;
    for (const n of lines) { rows.push(players.slice(k, k + n)); k += n; }
  }
  const R = rows.length, h = opts.h || 480;
  const teams = new Set(players.filter(x => x && !x.empty).map(x => (BY.get(x.id) || x).sq).filter(Boolean));
  const team = opts.byRole ? null : opts.team || (teams.size === 1 ? [...teams][0] : null);   // la mia rosa: campo neutro
  let html = `<div class="ppitch" style="--h:${h}px">${fieldSvg(team)}`;
  rows.forEach((row, r) => {
    const depth = r / (R - 1 || 1);               // 0 = portiere (vicino), 1 = attacco (lontano)
    const top = 87 - depth * 74, l = trapL(top), w = 100 - 2 * l;
    const items = row.filter(Boolean), n = items.length;
    items.forEach((x, i) => {
      const left = l + w * (i + 1) / (n + 1);
      if (x.empty) { html += `<div class="pp ${n >= 5 ? "tight" : ""}" style="left:${left.toFixed(2)}%;top:${top.toFixed(2)}%"><span class="slot ${x.R}">${x.R}</span><div class="nm" style="opacity:.7">vuoto</div></div>`; return; }
      const p = BY.get(x.id) || x, t = x.tit ?? p.tit;
      const warn = p.flag && p.flag.tipo !== "Diffidato";
      const badge = typeof opts.badge === "function" ? opts.badge(x, p) : opts.badge === "pct" ? (t != null ? `<span class="badge pc ${tlvl(t)}">${t}%</span>` : "") : (p.xfv ? `<span class="badge ${xfvCls(p.xfv)}">${f1(p.xfv)}</span>` : "");
      html += `<div class="pp ${n >= 5 ? "tight" : ""}" data-pid="${x.id}" style="left:${left.toFixed(2)}%;top:${top.toFixed(2)}%">${badge}${warn ? `<span class="warn" title="${esc(p.flag.tipo)}">!</span>` : ""}${av(p, 46)}<div class="nm">${esc(x.nome || p.nome)}</div></div>`;
    });
  });
  return html + "</div>";
}

function lineChart(p) {
  const n = Math.max(LAST, 2), W = 520, H = 150, padL = 26, padB = 22;
  const pts = p.vl.filter(x => x.fv != null);
  if (!pts.length) return `<div class="empty">Nessun voto</div>`;
  const vals = pts.map(x => x.fv), mn = Math.min(4, ...vals), mx = Math.max(10, ...vals);
  const X = g => padL + (g - 1) / (n - 1) * (W - padL - 10), Y = v => 8 + (1 - (v - mn) / (mx - mn)) * (H - padB - 8);
  const path = pts.map((x, i) => `${i ? "L" : "M"}${X(x.g).toFixed(1)},${Y(x.fv).toFixed(1)}`).join(" ");
  const area = `${path} L${X(pts.at(-1).g)},${H - padB} L${X(pts[0].g)},${H - padB} Z`;
  let grid = "";
  for (const v of [6, 8, 10]) grid += `<line x1="${padL}" x2="${W - 10}" y1="${Y(v)}" y2="${Y(v)}" stroke="rgba(255,255,255,.1)" ${v === 6 ? 'stroke-dasharray="4 4"' : ""}/><text x="2" y="${Y(v) + 4}" fill="#b4a9e6" font-size="10">${v}</text>`;
  for (let g = 1; g <= n; g++) grid += `<text x="${X(g)}" y="${H - 5}" fill="#8578c2" font-size="10" text-anchor="middle">${g}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto"><defs><linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3fd2ff" stop-opacity=".45"/><stop offset="1" stop-color="#3fd2ff" stop-opacity="0"/></linearGradient></defs>${grid}
    <path d="${area}" fill="url(#ga)"/><path d="${path}" fill="none" stroke="#3fd2ff" stroke-width="2.5" stroke-linejoin="round"/>
    ${pts.map(x => `<circle cx="${X(x.g)}" cy="${Y(x.fv)}" r="4.5" fill="${x.fv >= 7 ? "#8fdc2a" : x.fv >= 6 ? "#ffcf33" : "#ff4a5a"}" stroke="#22105e" stroke-width="2"><title>G${x.g}: voto ${f1(x.v)} · FV ${f1(x.fv)}${x.gol ? ` · ${x.gol} gol` : ""}${x.ass ? ` · ${x.ass} assist` : ""}</title></circle>`).join("")}
    ${pts.filter(x => x.gol || x.ass).map(x => `<text x="${X(x.g)}" y="${Y(x.fv) - 9}" font-size="11" text-anchor="middle">${"⚽".repeat(Math.min(x.gol, 3))}${x.ass ? "🅰" : ""}</text>`).join("")}
  </svg>`;
}

// ================================================================ navigazione
const PAGES = [
  ["consigliati", "👍", "Consigliati"], ["storico", "📜", "Storico"], ["probabili", "📋", "Probabili"], ["schierabilita", "⭐", "Schierabilità"], ["listone", "🗂️", "Listone"],
  ["centro", "📊", "Centro Dati"], ["seriea", "🏆", "Serie A"], ["squadre", "🛡️", "Squadre"], ["indisponibili", "🚑", "Indisponibili"],
];
function renderNav(cur) {
  $("#nav").innerHTML = `<div class="logo"><img class="logo-img" src="logo.png" alt=""><span>Fanta<b>Bar</b></span></div>` +
    PAGES.map(([k, ic, l]) => `<a href="#${k}" class="tile-nav ${cur === k ? "on" : ""}"><span class="ic">${ic}</span>${l}</a>`).join("") +
    `<div class="foot">Dati fantacalcio.it<br>${esc(D?.aggiornato || "")}</div>`;
  $("#upd").innerHTML = D ? `Serie A ${esc(D.stagione)} · giornata ${NEXT}<br>aggiornato ${esc(D.aggiornato)}` : "";
}

// ================================================================ pagine
// ---- probabili e indici
function mrow(x, right) {
  const p = BY.get(x.id) || { nome: x.nome, R: x.R, id: x.id };
  const ics = [p.rigTirati > 0 ? `<span class="rig" title="Rigorista: ${p.rigSegnati}/${p.rigTirati}">R</span>` : "", p.flag && p.flag.tipo !== "Diffidato" ? `<span class="warn" title="${esc(p.flag.tipo + ": " + p.flag.nota)}">!</span>` : "", p.flag?.tipo === "Diffidato" ? `<span title="Diffidato" style="background:#c99a10">D</span>` : ""].join("");
  return `<div class="mrow ${right ? "rt" : ""}" data-pid="${x.id}">${av(p, 40)}<div class="nm"><b>${esc(x.nome)}</b>${titBar(x.tit)}</div><div class="ics">${ics}</div>${BY.get(x.id) ? consBtn(x.id) : ""}${p.xfv ? idx({ ...p, tit: x.tit }) : ""}</div>`;
}
function pageProbabili(arg) {
  const i = clamp(+arg || 0, 0, D.probabili.length - 1), m = D.probabili[i];
  const [H, A] = m.squadre, pr = pronostico(m.home, m.away);
  const n = Math.max(H.titolari.length, A.titolari.length), nb = Math.max(H.panchina.length, A.panchina.length);
  let list = "";
  for (let k = 0; k < n; k++) list += (H.titolari[k] ? mrow(H.titolari[k]) : "<div></div>") + (A.titolari[k] ? mrow(A.titolari[k], 1) : "<div></div>");
  list += `<div class="benchlbl">PANCHINA</div>`;
  for (let k = 0; k < nb; k++) list += (H.panchina[k] ? mrow(H.panchina[k]) : "<div></div>") + (A.panchina[k] ? mrow(A.panchina[k], 1) : "<div></div>");
  const side = s => { const sl = s ? "away" : "home"; return ["infortunati", "squalificati", "dubbi", "diffidati"].map(k => m[k].filter(x => x.lato === sl).map(x => ({ ...x, k }))).flat(); };
  const notes = s => side(s).map(x => `<div class="r" data-pid="${x.id}" style="align-items:flex-start"><span class="chip ${x.k === "infortunati" ? "lo" : x.k === "squalificati" ? "mid" : ""}" style="flex:none">${x.k.slice(0, 3).toUpperCase()}</span><div><b>${esc(x.nome)}</b><div class="tip">${esc(x.nota)}</div></div></div>`).join("") || `<div class="tip">Nessuno</div>`;
  const tm = (s, r) => { const t = TEAMS[s] || {}; return `<div class="tm ${r ? "r" : ""}">${r ? "" : crest(s, 46)}<div><b class="tname" data-team="${s}">${esc(tname(s))}</b>${dots((t.res || []).slice(-5))}</div>${r ? crest(s, 46) : ""}</div>`; };
  const nOv = Object.keys(OVR).length;
  return title("Probabili e Indici", `<b>●</b> Indice = fantamedia attesa (clic sul numero per cambiarlo a mano) · % = probabilità di titolarità${nOv ? ` · ${nOv} modificati a mano · <a href="javascript:void 0" onclick="resetOverrides()" style="color:var(--pink)">ripristina tutti</a>` : ""}`, "📋") + `
  <div class="mstrip">${D.probabili.map((x, j) => `<a class="mbtn ${j === i ? "on" : ""}" href="#probabili/${j}" title="${esc(tname(x.home))} - ${esc(tname(x.away))}">${crest(x.home, 24)}${crest(x.away, 24)}</a>`).join("")}</div>
  <div class="tip" style="text-align:center;margin-top:10px">${esc(m.data)} · ${esc(m.stadio)}</div>
  <div class="mhead">${tm(m.home)}<div class="score">pronostico<div class="box"><span>${pr?.gh ?? "-"}</span><span>${pr?.ga ?? "-"}</span></div>${pr ? `<div class="oddbar"><i style="width:${pr.p1}%;background:#3fb24a"></i><i style="width:${pr.px}%;background:#8d86a8"></i><i style="width:${pr.p2}%;background:#e0384a"></i></div>1 ${pr.p1}% · X ${pr.px}% · 2 ${pr.p2}%` : ""}</div>${tm(m.away, 1)}</div>
  <div class="prob3">
    <div class="ppitch-wrap"><div style="text-align:center;font-weight:700;margin-bottom:4px">${esc(H.modulo)}</div>${pitch(H.modulo, H.titolari, { badge: "pct", h: 460 })}</div>
    <div class="mirror">${list}</div>
    <div class="ppitch-wrap"><div style="text-align:center;font-weight:700;margin-bottom:4px">${esc(A.modulo)}</div>${pitch(A.modulo, A.titolari, { badge: "pct", h: 460 })}</div>
  </div>
  <div class="grid g3" style="margin-top:18px">
    <div class="panel pad"><h3>⚔️ Ballottaggi</h3><div class="rows">${m.ballottaggi.map(b => ballot(b)).join("") || '<div class="tip">Nessuno</div>'}</div></div>
    <div class="panel pad"><h3>${crest(m.home, 20)} Indisponibili</h3><div class="rows">${notes(0)}</div></div>
    <div class="panel pad"><h3>${crest(m.away, 20)} Indisponibili</h3><div class="rows">${notes(1)}</div></div>
  </div>
  ${m.commento ? `<div class="panel pad" style="margin-top:16px"><h3>📝 Analisi</h3><p class="muted" style="margin:0;line-height:1.6">${esc(m.commento.replace(/^Presentazione squadre\s*/, ""))}</p></div>` : ""}
  <p class="tip" style="text-align:center">${esc(m.aggiornato)} · fonte fantacalcio.it</p>`;
}
function ballot(b) {
  const [a, c] = b, pa = BY.get(a.id), pc = c && BY.get(c.id);
  return `<div class="ball"><span data-pid="${a.id}">${av(pa || a, 34)}</span><b style="color:var(--green)">${a.pct}%</b><div style="flex:1;min-width:0"><div style="display:flex;justify-content:space-between;font-size:12.5px;font-weight:700"><span data-pid="${a.id}">${esc(a.nome)}</span><span data-pid="${c?.id}" class="muted">${esc(c?.nome || "")}</span></div><div class="bar2"><i style="width:${a.pct}%"></i></div></div><b style="color:var(--red)">${c?.pct ?? ""}%</b><span data-pid="${c?.id}">${c ? av(pc || c, 34) : ""}</span></div>`;
}

// ---- schierabilità
let SCH = store.get("sch", { R: "A", all: false });
function setSchR(R) { SCH.R = R || "A"; store.set("sch", SCH); go(); }
function pageSchierabilita() {
  const rows = P.filter(p => p.R === SCH.R && p.tit != null && (p.tit > 0 || SCH.all)).sort((a, b) => b.sch - a.sch || b.xfv - a.xfv);
  return title("Indice di Schierabilità", `Giornata ${NEXT} · probabilità di prendere il voto × fantamedia attesa contro l'avversario`, "⭐") + `
  <div style="display:flex;justify-content:center;gap:14px;align-items:center;flex-wrap:wrap;margin-bottom:14px">${ROLEBTN(SCH.R, "setSchR", false)}
    <label class="tip"><input type="checkbox" ${SCH.all ? "checked" : ""} onchange="SCH.all=this.checked;store.set('sch',SCH);go()"> anche fuori lista</label></div>
  <div class="twrap"><table class="t"><thead><tr><th>Giocatore</th><th>Avversario</th><th>Titolarità</th><th>Voti presi</th><th>FM stagione</th><th>Ultime 3</th><th>Fattore partita</th><th>FM attesa</th><th>Indice</th><th></th></tr></thead><tbody>
  ${rows.map((p, i) => `<tr data-pid="${p.id}"><td><div class="pn"><span class="dim num" style="width:20px">${i + 1}</span>${av(p, 38)}<div><small>${esc(tname(p.sq))}</small><b>${esc(p.nome)} ${p.flag ? `<span style="color:var(--red)" title="${esc(p.flag.nota)}">●</span>` : ""}</b></div>${fascia(p.fascia)}</div></td>
    <td>${p.nextOpp ? `<span class="tname">${p.nextOpp.home ? "vs" : "@"} ${crest(p.nextOpp.opp, 20)} ${esc(tname(p.nextOpp.opp))}</span>` : "–"}</td>
    <td><div style="display:flex;align-items:center;gap:8px;justify-content:center"><div class="pbar ${tlvl(p.tit)}"><i style="width:${p.tit}%"></i></div><b>${p.tit}%</b>${p.riserva ? '<span class="chip lo" title="Riserva nella probabile formazione">RIS</span>' : ""}</div></td>
    <td class="num" title="Partite con voto sulle partite giocate dalla squadra">${p.votoPct == null ? "–" : `<span style="color:${p.votoPct >= 80 ? "var(--green)" : p.votoPct >= 50 ? "var(--orange)" : "var(--red)"}">${p.votoPct}%</span>`}</td>
    <td class="num">${f2(p.fm)}</td><td>${p.last3.map(chipFv).join(" ")}</td>
    <td class="num" style="color:${p.adj > 0.05 ? "var(--green)" : p.adj < -0.05 ? "var(--red)" : "var(--muted)"}">${p.adj > 0 ? "+" : ""}${f2(p.adj)}</td>
    <td>${idx(p)}</td><td><span class="chip ${lvl(p.sch)}" style="font-size:14px;height:28px;min-width:42px">${p.sch}</span></td><td>${stars(p.stars)} ${consBtn(p.id)}</td></tr>`).join("") || `<tr><td colspan="10" class="empty">Nessun giocatore</td></tr>`}
  </tbody></table></div>
  <p class="tip">FM attesa = 65% fantamedia stagionale (con poche presenze avvicinata alla media del ruolo) + 35% media delle ultime 3 giocate, corretta per gol fatti/subiti dall'avversario e fattore campo. Indice 0-100 = percentile nel ruolo di (probabilità di prendere il voto × FM attesa). La probabilità parte dalla titolarità: un titolare la tiene quasi intera, una riserva (RIS) perde molto e ancora di più se in stagione prende di rado il voto (colonna "Voti presi").</p>`;
}

// ---- listone
let LT = store.get("lt", { R: "P", team: "", q: "", sort: "fvm", dir: -1 });
const setLtR = R => { LT.R = R; store.set("lt", LT); go(); };
const LCOLS = [["qa", "Qt"], ["fvm", "FVM"], ["mv", "MV"], ["fm", "FMV"], ["pv", "Pres."], ["gol", "Gol"], ["ass", "Assist"], ["amm", "Amm."], ["last3", "Ultime 3"], ["tit", "Titolarità"], ["xfv", "Indice"], ["rating", "Rating"]];
function pageListone() {
  computePct(2);
  let rows = P.filter(p => (!LT.R || p.R === LT.R) && (!LT.team || p.sq === LT.team) && (!LT.q || p.nome.toLowerCase().includes(LT.q)));
  const key = LT.sort === "last3" ? (p => p.formAvg) : (p => p[LT.sort]);
  rows.sort((a, b) => ((key(a) ?? -99) - (key(b) ?? -99)) * LT.dir);
  const teams = Object.values(TEAMS).sort((a, b) => a.nome.localeCompare(b.nome));
  return title("Listone Giocatori", `${rows.length} giocatori · Serie A ${esc(D.stagione)}`, "🗂️") + `
  <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;justify-content:center;margin-bottom:10px">
    <input class="input" id="lq" placeholder="CERCA GIOCATORE" value="${esc(LT.q)}" oninput="LT.q=this.value.toLowerCase();go(true)" style="width:220px">
    ${ROLEBTN(LT.R, "setLtR")}
  </div>
  <div class="mstrip" style="justify-content:center">${`<a class="mbtn ${!LT.team ? "on" : ""}" onclick="LT.team='';go()">Tutte</a>`}${teams.map(t => `<a class="mbtn ${LT.team === t.slug ? "on" : ""}" title="${esc(t.nome)}" onclick="LT.team='${t.slug}';go()">${crest(t.slug, 26)}</a>`).join("")}</div>
  <div class="twrap"><table class="t"><thead><tr><th>Nome</th>${LCOLS.map(([k, l]) => `<th data-lsort="${k}" class="${LT.sort === k ? "s" : ""}">${l}${LT.sort === k ? (LT.dir < 0 ? " ▾" : " ▴") : ""}</th>`).join("")}<th></th></tr></thead><tbody>
  ${rows.slice(0, 300).map(p => `<tr data-pid="${p.id}"><td><div class="pn">${av(p, 40)}<div><small>${esc(tname(p.sq))}</small><b>${esc(p.nome)}</b></div>${fascia(p.fascia)}${p.flag && p.flag.tipo !== "Diffidato" ? `<span style="color:var(--red)" title="${esc(p.flag.tipo + ": " + p.flag.nota)}">●</span>` : ""}</div></td>
    <td><small>Qt</small><span class="big">${p.qa ?? "–"}</span></td><td><small>FVM</small><span class="big">${p.fvm ?? "–"}</span></td>
    <td><small>MV</small><b>${f2(p.mv)}</b></td><td><small>FMV</small><b>${f2(p.fm)}</b></td><td><small>Pres.</small><b>${p.pv}</b></td>
    <td><small>Gol</small><b>${p.gol}</b></td><td><small>Assist</small><b>${p.ass}</b></td><td><small>Amm.</small><b>${p.amm}</b></td>
    <td>${p.last3.map(chipFv).join(" ")}</td>
    <td>${p.tit == null ? '<span class="dim">–</span>' : `<span class="chip ${lvl(p.tit)}">${p.tit}%</span>`}</td>
    <td>${idx(p, 1)}</td><td>${p.rating == null ? '<span class="dim">–</span>' : `<span class="chip ${lvl(p.rating)}">${p.rating}</span>`}</td>
    <td>${consBtn(p.id)} ${scomBtn(p.id)}</td></tr>`).join("") || `<tr><td colspan="14" class="empty">Nessun giocatore</td></tr>`}
  </tbody></table></div>`;
}

// ---- centro dati (statistiche ricalcolate dai voti di ogni giornata)
let CD = store.get("cd", { tab: "g", team: "", min: 3, R: "", from: 1, to: 38, venue: "", stats: ["mv", "fmv", "gol", "ass", "bonus", "trend"], tstats: ["gf", "gs", "cs", "pts", "fv", "bonus"] });
const PSTATS = {
  mv: ["MV", "Media voto", 2], fmv: ["FMV", "Fantamedia", 2], gol: ["⚽ Gol totali", "Gol", 0], ass: ["🅰️ Assist totali", "Assist", 0],
  bonus: ["Bonus totali", "Gol×3 + assist", 0], ga: ["Gol + Assist", "", 0], pres: ["Presenze", "", 0], pct7: ["FV ≥ 7", "% partite con fantavoto ≥ 7", 0, "%"],
  pctB: ["% partite con bonus", "", 0, "%"], trend: ["📈 Trend forma", "media ultime 3 − media periodo", 2, "", true], best: ["Miglior fantavoto", "", 1],
  cost: ["Costanza", "deviazione standard FV (più bassa = più costante)", 2, "", false, true], fvHome: ["FMV in casa", "", 2], fvAway: ["FMV in trasferta", "", 2],
  gsP: ["Gol subiti / partita (P)", "solo portieri", 2, "", false, true], csP: ["Porta inviolata (P)", "solo portieri", 0],
};
const TSTATS = {
  pts: ["Punti", 0], gf: ["⚽ Gol fatti", 0], gs: ["Gol subiti", 0, true], cs: ["Clean sheet", 0], gfPg: ["Gol fatti / partita", 2], gsPg: ["Gol subiti / partita", 2, true],
  fv: ["Media fantavoto squadra", 2], bonus: ["Bonus totali giocatori", 0], ass: ["🅰️ Assist totali", 0], win: ["% vittorie", 0],
};
function playerRange(p) {
  const v = p.vl.filter(x => x.g >= CD.from && x.g <= CD.to && x.fv != null && (!CD.venue || (MATCH[x.g]?.[p.sq]?.home === (CD.venue === "casa"))));
  if (!v.length) return null;
  const fvs = v.map(x => x.fv), m = avg(fvs);
  const home = v.filter(x => MATCH[x.g]?.[p.sq]?.home), away = v.filter(x => MATCH[x.g]?.[p.sq] && !MATCH[x.g][p.sq].home);
  return {
    pres: v.length, mv: avg(v.map(x => x.v)), fmv: m, gol: sum(v.map(x => x.gol)), ass: sum(v.map(x => x.ass)),
    bonus: sum(v.map(x => x.gol * 3 + x.ass)), ga: sum(v.map(x => x.gol + x.ass)),
    pct7: Math.round(100 * fvs.filter(x => x >= 7).length / v.length), pctB: Math.round(100 * v.filter(x => x.gol || x.ass).length / v.length),
    trend: v.length >= 4 ? avg(fvs.slice(-3)) - m : null, best: Math.max(...fvs),
    cost: v.length >= 3 ? Math.sqrt(avg(fvs.map(x => (x - m) ** 2))) : null,
    fvHome: home.length ? avg(home.map(x => x.fv)) : null, fvAway: away.length ? avg(away.map(x => x.fv)) : null,
    gsP: p.R === "P" ? avg(v.map(x => x.gs)) : null, csP: p.R === "P" ? v.filter(x => x.gs === 0).length : null,
  };
}
function teamRange(t) {
  const res = t.res.filter(r => r.g >= CD.from && r.g <= CD.to && (!CD.venue || r.home === (CD.venue === "casa")));
  if (!res.length) return null;
  const pl = P.filter(p => p.sq === t.slug).flatMap(p => p.vl.filter(x => res.some(r => r.g === x.g) && x.fv != null));
  return {
    pts: sum(res.map(r => r.r === "W" ? 3 : r.r === "D" ? 1 : 0)), gf: sum(res.map(r => r.gf)), gs: sum(res.map(r => r.gs)), cs: res.filter(r => r.gs === 0).length,
    gfPg: avg(res.map(r => r.gf)), gsPg: avg(res.map(r => r.gs)), fv: avg(pl.map(x => x.fv)), bonus: sum(pl.map(x => x.gol * 3 + x.ass)), ass: sum(pl.map(x => x.ass)),
    win: Math.round(100 * res.filter(r => r.r === "W").length / res.length),
  };
}
const setCdR = R => { CD.R = R; saveCd(); };
const saveCd = () => { store.set("cd", CD); go(true); };
function pageCentro() {
  const maxG = LAST || 1; CD.to = Math.min(CD.to, maxG); CD.from = Math.min(CD.from, CD.to);
  const filt = `<div class="panel pad" style="margin-bottom:18px"><div class="filters">
    <div class="fgroup"><select class="input" onchange="CD.team=this.value;saveCd()"><option value="">Tutte</option>${Object.values(TEAMS).sort((a, b) => a.nome.localeCompare(b.nome)).map(t => `<option value="${t.slug}" ${CD.team === t.slug ? "selected" : ""}>${esc(t.nome)}</option>`).join("")}</select><label>Squadra</label></div>
    ${CD.tab === "g" ? `<div class="fgroup"><div class="stepper"><button onclick="CD.min=Math.max(0,CD.min-1);saveCd()">−</button><b>${CD.min}</b><button onclick="CD.min++;saveCd()">+</button></div><label>Min. partite giocate</label></div>
    <div class="fgroup">${ROLEBTN(CD.R, "setCdR")}<label>Ruolo</label></div>` : ""}
    <div class="fgroup"><div class="seg">${[["", "Tutte"], ["casa", "Casa"], ["trasferta", "Trasferta"]].map(([k, l]) => `<button class="${CD.venue === k ? "on" : ""}" onclick="CD.venue='${k}';saveCd()">${l}</button>`).join("")}</div><label>Casa / Trasferta</label></div>
    <div class="fgroup"><label>Range giornate: <b style="color:#fff">${CD.from} – ${CD.to}</b></label><div class="range2"><div class="track"><i style="left:${(CD.from - 1) / Math.max(maxG - 1, 1) * 100}%;right:${100 - (CD.to - 1) / Math.max(maxG - 1, 1) * 100}%"></i></div>
      <input type="range" min="1" max="${maxG}" value="${CD.from}" oninput="CD.from=Math.min(+this.value,CD.to);saveCd()"><input type="range" min="1" max="${maxG}" value="${CD.to}" oninput="CD.to=Math.max(+this.value,CD.from);saveCd()"></div></div>
  </div></div>`;
  const tabs = `<div style="display:flex;justify-content:center;margin:-8px 0 18px"><div class="seg"><button class="${CD.tab === "g" ? "on" : ""}" onclick="CD.tab='g';saveCd()">Giocatori</button><button class="${CD.tab === "s" ? "on" : ""}" onclick="CD.tab='s';saveCd()">Squadre</button></div></div>`;
  let body = "";
  if (CD.tab === "g") {
    const pool = P.filter(p => (!CD.R || p.R === CD.R) && (!CD.team || p.sq === CD.team)).map(p => ({ p, s: playerRange(p) })).filter(x => x.s && x.s.pres >= CD.min);
    const top = (k, inv) => pool.filter(x => x.s[k] != null).sort((a, b) => (inv ? a.s[k] - b.s[k] : b.s[k] - a.s[k]));
    const fmt = (k, v) => { const d = PSTATS[k]; return v == null ? "–" : (d[2] ? (+v).toFixed(d[2]) : v) + (d[3] || "") ; };
    const perf = ["fmv", "gol", "ass", "trend", "pct7", "cost"].map(k => { const x = top(k, PSTATS[k][5])[0]; return x ? `<div class="perf" data-pid="${x.p.id}">${av(x.p, 44)}<div style="min-width:0"><div><span class="rk">1°</span> <b>${PSTATS[k][0]}</b></div><div class="tip">${esc(x.p.nome)} · ${fmt(k, x.s[k])}</div></div></div>` : ""; }).join("");
    body = `<div class="h2">📊 Top Performer</div><div class="hcards">${perf}</div>
      <div style="display:flex;align-items:center;margin:26px 0 12px"><div class="h2" style="margin:0">🏅 Statistiche</div><div class="spacer"></div>
        <select class="addstat" onchange="if(this.value){CD.stats.push(this.value);saveCd()}"><option value="">+ Aggiungi statistiche</option>${Object.entries(PSTATS).filter(([k]) => !CD.stats.includes(k)).map(([k, d]) => `<option value="${k}">${d[0]}</option>`).join("")}</select></div>
      <div class="statcards">${CD.stats.filter(k => PSTATS[k]).map(k => `<div class="scard"><h4>${PSTATS[k][0]}<button class="x" onclick="CD.stats=CD.stats.filter(s=>s!=='${k}');saveCd()">×</button></h4>${PSTATS[k][1] ? `<div class="tip" style="margin:-6px 0 8px">${PSTATS[k][1]}</div>` : ""}
        ${top(k, PSTATS[k][5]).slice(0, 10).map((x, i) => `<div class="srow" data-pid="${x.p.id}"><span class="rk">${i + 1}.</span>${crest(x.p.sq, 18)}<span>${esc(x.p.nome)}</span><b>${fmt(k, x.s[k])}</b></div>`).join("") || '<div class="tip">Nessun dato</div>'}</div>`).join("")}</div>`;
  } else {
    const pool = Object.values(TEAMS).filter(t => !CD.team || t.slug === CD.team).map(t => ({ t, s: teamRange(t) })).filter(x => x.s);
    const fmt = (k, v) => v == null ? "–" : TSTATS[k][1] ? (+v).toFixed(TSTATS[k][1]) : v;
    body = `<div style="display:flex;align-items:center;margin:8px 0 12px"><div class="h2" style="margin:0">🏅 Statistiche squadre</div><div class="spacer"></div>
      <select class="addstat" onchange="if(this.value){CD.tstats.push(this.value);saveCd()}"><option value="">+ Aggiungi statistiche</option>${Object.entries(TSTATS).filter(([k]) => !CD.tstats.includes(k)).map(([k, d]) => `<option value="${k}">${d[0]}</option>`).join("")}</select></div>
      <div class="statcards">${CD.tstats.filter(k => TSTATS[k]).map(k => `<div class="scard"><h4>${TSTATS[k][0]}<button class="x" onclick="CD.tstats=CD.tstats.filter(s=>s!=='${k}');saveCd()">×</button></h4>
        ${pool.slice().sort((a, b) => TSTATS[k][2] ? a.s[k] - b.s[k] : b.s[k] - a.s[k]).slice(0, 10).map((x, i) => `<div class="srow" data-team="${x.t.slug}" style="cursor:pointer"><span class="rk">${i + 1}.</span>${crest(x.t.slug, 18)}<span>${esc(x.t.nome)}</span><b>${fmt(k, x.s[k])}</b></div>`).join("")}</div>`).join("")}</div>`;
  }
  return title("Centro Dati", "Statistiche calcolate dai voti di ogni giornata", "📊") + tabs + filt + body;
}

// ---- serie a
let SA = { g: LAST || 1, sel: 0 };
function pageSerieA() {
  const table = Object.values(TEAMS).filter(t => t.pos).sort((a, b) => a.pos - b.pos);
  const maxG = Math.max(...D.partite.map(m => m.g));
  const ms = D.partite.filter(m => m.g === SA.g);
  const m = ms[SA.sel] || ms[0];
  let detail = "";
  if (m) {
    const played = m.status !== 0 && m.g <= LAST;
    const scorers = s => P.filter(p => p.sq === s).map(p => ({ p, x: p.vl.find(v => v.g === m.g) })).filter(o => o.x && o.x.gol > 0);
    const best = P.filter(p => p.sq === m.home || p.sq === m.away).map(p => ({ p, x: p.vl.find(v => v.g === m.g) })).filter(o => o.x?.fv != null).sort((a, b) => b.x.fv - a.x.fv).slice(0, 6);
    detail = `<div class="panel pad" style="margin-top:16px"><div style="display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:center;margin-bottom:10px"><b style="text-align:right">${esc(tname(m.home))}</b><span class="idx" style="background:linear-gradient(180deg,#2f80ed,#1d4aa0);border-color:#7fb5ff;box-shadow:none">${played ? `${m.gh} - ${m.ga}` : "vs"}</span><b>${esc(tname(m.away))}</b></div>
      ${played ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:13px"><div style="text-align:right">${scorers(m.home).map(o => `<div data-pid="${o.p.id}">${esc(o.p.nome)} ${"⚽".repeat(o.x.gol)}</div>`).join("") || '<span class="dim">–</span>'}</div><div>${scorers(m.away).map(o => `<div data-pid="${o.p.id}">${"⚽".repeat(o.x.gol)} ${esc(o.p.nome)}</div>`).join("") || '<span class="dim">–</span>'}</div></div>
      <h3 style="margin-top:14px">Migliori fantavoti</h3><div class="rows">${best.map(o => `<div class="r" data-pid="${o.p.id}">${av(o.p, 30)}<span style="flex:1">${esc(o.p.nome)}</span>${crest(o.p.sq, 18)}${chipFv(o.x.fv)}</div>`).join("")}</div>` : `<div class="tip" style="text-align:center">${esc(m.data)}</div>`}</div>`;
  }
  return title("Classifica e Risultati", `Serie A ${esc(D.stagione)}`, "🏆") + `
  <div class="grid split" style="--a:1.35fr;--b:1fr">
    <div class="panel pad"><h3>☰ Classifica</h3><div class="twrap"><table class="t" style="min-width:560px"><thead><tr><th></th><th>Pt.</th><th>G</th><th>V</th><th>N</th><th>S</th><th>GF</th><th>GS</th><th>+/-</th><th></th></tr></thead><tbody>
      ${table.map(t => `<tr data-team="${t.slug}" style="cursor:pointer"><td><span class="dim num" style="display:inline-block;width:20px">${t.pos}</span>${tlink(t.slug, 20)}</td><td><b>${t.pt}</b></td><td>${t.g}</td><td>${t.v}</td><td>${t.n}</td><td>${t.p}</td><td>${t.gf}</td><td>${t.gs}</td><td>${t.gf - t.gs}</td><td>${dots(t.res.slice(-5))}</td></tr>`).join("")}
    </tbody></table></div></div>
    <div><div class="panel pad"><h3>📅 Calendario</h3>
      <div style="display:flex;justify-content:center;align-items:center;gap:18px;margin-bottom:10px;font-weight:800;font-size:17px"><button onclick="SA.g=Math.max(1,SA.g-1);SA.sel=0;go(true)">‹</button>GIORNATA ${SA.g}<button onclick="SA.g=Math.min(${maxG},SA.g+1);SA.sel=0;go(true)">›</button></div>
      ${ms.map((x, i) => { const pl = x.status !== 0 && x.g <= LAST; return `<div class="cal-m ${i === SA.sel ? "on" : ""}" onclick="SA.sel=${i};go(true)"><span style="text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(tname(x.home))}</span>${crest(x.home, 22)}<span class="sc ${pl ? "" : "fut"}">${pl ? `${x.gh} - ${x.ga}` : esc(x.data)}</span>${crest(x.away, 22)}<span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(tname(x.away))}</span></div>`; }).join("")}
    </div>${detail}</div>
  </div>`;
}

// ---- squadre / formazioni tipo
function pageSquadre(slug) {
  const teams = Object.values(TEAMS).sort((a, b) => a.nome.localeCompare(b.nome));
  slug = TEAMS[slug] ? slug : store.get("team", teams[0]?.slug);
  store.set("team", slug);
  const t = TEAMS[slug];
  const mi = D.probabili.findIndex(m => m.home === slug || m.away === slug), m = D.probabili[mi];
  const sq = m ? m.squadre[m.home === slug ? 0 : 1] : null;
  const roster = P.filter(p => p.sq === slug).sort((a, b) => "PDCA".indexOf(a.R) - "PDCA".indexOf(b.R) || (b.tit ?? -1) - (a.tit ?? -1) || (b.fvm || 0) - (a.fvm || 0));
  const W = 30 * Math.max(t.res.length, 1);
  const gchart = `<svg viewBox="0 0 ${W} 100" style="width:100%;max-width:${Math.max(W, 260)}px">${t.res.map((r, i) => `<rect x="${i * 30 + 5}" y="${48 - r.gf * 10}" width="9" height="${r.gf * 10}" rx="3" fill="#8fdc2a"><title>G${r.g} gol fatti ${r.gf}</title></rect><rect x="${i * 30 + 16}" y="48" width="9" height="${r.gs * 10}" rx="3" fill="#ff4a5a"><title>gol subiti ${r.gs}</title></rect><text x="${i * 30 + 15}" y="97" fill="#8578c2" font-size="9" text-anchor="middle">G${r.g}</text>`).join("")}<line x1="0" x2="${W}" y1="48" y2="48" stroke="rgba(255,255,255,.3)"/></svg>`;
  const kpi = (l, v, s) => `<div class="panel pad" style="text-align:center"><div class="tip">${l}</div><div style="font:800 28px Rubik">${v}</div><div class="tip">${s}</div></div>`;
  return title("Formazioni Tipo", `probabile formazione della giornata ${NEXT}`, "🧩") + `
  <div class="mstrip" style="flex-wrap:wrap;justify-content:center;border:0">${teams.map(x => `<a class="mbtn ${x.slug === slug ? "on" : ""}" href="#squadre/${x.slug}" title="${esc(x.nome)}" style="padding:7px">${crest(x.slug, 30)}</a>`).join("")}</div>
  <div style="text-align:center;margin:12px 0 4px"><span style="display:inline-flex;align-items:center;gap:10px;font-size:28px;font-weight:700">${crest(slug, 34)} ${esc(t.nome)}</span><div class="tip">${esc(sq?.modulo || "")} · ${t.pos}ª in classifica · ${t.pt} pt · ${dots(t.res.slice(-5), 1)}</div></div>
  <div class="grid split" style="--a:1fr;--b:1fr;margin-top:10px">
    <div>${sq ? pitch(sq.modulo, sq.titolari, { badge: "pct" }) : '<div class="empty">Probabile formazione non disponibile</div>'}
      ${t.next.length ? `<div class="h2">📅 Prossime partite</div><div class="rows">${t.next.map(n => `<div class="r"><span class="dim num">G${n.g}</span><span style="flex:1">${n.home ? "vs" : "@"} ${tlink(n.opp, 20)}</span><span class="tip">${esc(n.data)}</span><span class="chip ${TEAMS[n.opp]?.pos <= 6 ? "lo" : TEAMS[n.opp]?.pos <= 13 ? "mid" : "hi"}">${TEAMS[n.opp]?.pos ?? "–"}ª</span></div>`).join("")}</div>` : ""}</div>
    <div>
      <div class="grid g2" style="gap:10px">${kpi("Gol fatti / partita", f2(t.gfPg), `${t.gf} totali · media lega ${f2(D.L)}`)}${kpi("Gol subiti / partita", f2(t.gsPg), `${t.gs} totali · ${t.cs} clean sheet`)}${kpi("Media fantavoto", f2(t.fvAvg), "di tutti i giocatori")}${kpi("Record", `${t.v}-${t.n}-${t.p}`, "V-N-P")}</div>
      <div class="panel pad" style="margin-top:12px"><h3>Gol fatti / subiti per giornata</h3>${gchart}</div>
      <div class="panel pad" style="margin-top:12px"><h3>Risultati</h3><div class="rows">${t.res.slice().reverse().map(r => `<div class="r"><span class="dim num">G${r.g}</span>${dots([r])}<span style="flex:1">${r.home ? "vs" : "@"} ${tlink(r.opp, 18)}</span><b>${r.gf}-${r.gs}</b></div>`).join("")}</div></div>
    </div>
  </div>
  <div class="h2" style="justify-content:center">▦ Rosa Completa</div>
  <div class="twrap"><table class="t" style="min-width:700px"><thead><tr><th>Giocatore</th><th>Titolarità</th><th>MV</th><th>FMV</th><th>Pres.</th><th>Gol</th><th>Ass</th><th>Qt</th><th>Ultime 3</th><th>Indice</th></tr></thead><tbody>
    ${roster.map(p => `<tr data-pid="${p.id}"><td><div class="pn">${av(p, 38)}<b>${esc(p.nome)}</b>${fascia(p.fascia)}${p.flag && p.flag.tipo !== "Diffidato" ? `<span style="color:var(--red)" title="${esc(p.flag.nota)}">●</span>` : ""}</div></td><td>${p.tit == null ? "–" : `<span class="chip ${lvl(p.tit)}">${p.tit}%</span>`}</td><td>${f2(p.mv)}</td><td><b>${f2(p.fm)}</b></td><td>${p.pv}</td><td>${p.gol}</td><td>${p.ass}</td><td>${p.qa ?? "–"}</td><td>${p.last3.map(chipFv).join(" ")}</td><td>${idx(p, 1)}</td></tr>`).join("")}
  </tbody></table></div>`;
}

// ---- indisponibili
function pageIndisponibili() {
  const by = {};
  D.probabili.forEach(m => [["infortunati", "Infortunato", "lo"], ["squalificati", "Squalificato", "mid"], ["dubbi", "In dubbio", ""], ["diffidati", "Diffidato", "sv"]].forEach(([k, l, c]) =>
    m[k].forEach(x => { const s = x.lato === "home" ? m.home : m.away; (by[s] ??= []).push({ ...x, l, c }); })));
  const order = Object.keys(by).sort((a, b) => tname(a).localeCompare(tname(b)));
  return title("Indisponibili", `Infortunati, squalificati, in dubbio e diffidati · giornata ${NEXT}`, "🚑") + `
  <div class="grid g3">${order.map(s => `<div class="panel pad"><h3>${tlink(s, 24)}</h3><div class="rows">${by[s].map(x => { const p = BY.get(x.id); return `<div class="r" data-pid="${x.id}" style="align-items:flex-start">${p ? av(p, 36) : ""}<div style="flex:1;min-width:0"><div style="display:flex;justify-content:space-between;gap:6px"><b>${esc(x.nome)}</b><span class="chip ${x.c}" style="font-size:10.5px">${x.l}</span></div><div class="tip">${esc(x.nota)}</div></div></div>`; }).join("")}</div></div>`).join("") || '<div class="empty">Nessun indisponibile</div>'}</div>`;
}

// ---- squadre di giornata
const MODULI = ["3-4-3", "3-5-2", "4-3-3", "4-4-2", "4-5-1", "5-3-2", "5-4-1"];
const needOf = modulo => { const [d, c, a] = modulo.split("-").map(Number); return { P: 1, D: d, C: c, A: a }; };
// una "squadra" è { ids, xi, modulo }: "g9" = squadra top della giornata 9, "s9" = consigliati non scontati della giornata 9
const squad = k => k[0] === "s" ? gScom(+k.slice(1)) : gSquad(+k.slice(1));
const saveSquad = () => saveGiornate();
function addToXI(S, id) {
  const p = BY.get(id); if (!p) return false;
  const need = needOf(S.modulo), have = S.xi.filter(i => BY.get(i)?.R === p.R).length;
  if (have < need[p.R]) { S.xi.push(id); return true; }
  return false;
}
// titolari coerenti con lista e modulo: se una linea è troppo piena, in panchina va il meno schierabile
function fitXI(S) {
  const need = needOf(S.modulo);
  S.xi = (S.xi || []).filter(id => S.ids.includes(id) && BY.get(id));
  for (const R of "PDCA") {
    const inRole = S.xi.filter(id => BY.get(id).R === R).sort((a, b) => BY.get(b).schRaw - BY.get(a).schRaw);
    inRole.slice(need[R]).forEach(id => { S.xi = S.xi.filter(i => i !== id); });
  }
}
// titolare <-> panchina; se la linea è piena entra al posto del titolare meno schierabile di quel ruolo
function toggleXI(k, id) {
  if (soloLettura() || !editable(k)) return;
  const S = squad(k);
  if (S.xi.includes(id)) S.xi = S.xi.filter(i => i !== id);
  else if (!addToXI(S, id)) {
    const R = BY.get(id).R, out = S.xi.filter(i => BY.get(i).R === R).sort((a, b) => BY.get(a).schRaw - BY.get(b).schRaw)[0];
    S.xi = S.xi.filter(i => i !== out); S.xi.push(id);
  }
  saveSquad(k); go(true);
}
function setModulo(k, m) { if (soloLettura() || !editable(k)) return; const S = squad(k); S.modulo = m; fitXI(S); saveSquad(k); go(true); }
function applyBest(k, m) { if (soloLettura() || !editable(k)) return; const S = squad(k); if (m) S.modulo = m; S.xi = bestXI(S.ids.map(id => BY.get(id)).filter(Boolean), S.modulo).xi.map(p => p.id); saveSquad(k); go(true); }
const editable = k => !gLocked(+k.slice(1));
function bestXI(players, modulo) {
  const [d, c, a] = modulo.split("-").map(Number), need = { P: 1, D: d, C: c, A: a };
  const pick = {}, bench = [];
  for (const R of "PDCA") { const s = players.filter(p => p.R === R).sort((x, y) => y.schRaw - x.schRaw || y.xfv - x.xfv); pick[R] = s.slice(0, need[R]); bench.push(...s.slice(need[R])); }
  const xi = [...pick.P, ...pick.D, ...pick.C, ...pick.A];
  return { xi, bench: bench.sort((a, b) => b.schRaw - a.schRaw), total: sum(xi.map(p => p.schRaw)) };
}
// ---- scheda giocatore
function openPlayer(id) {
  const p = BY.get(id); if (!p) return;
  if (!p.pct) computePct(2);
  const raw = { fm: f2(p.fm), mv: f2(p.mv), formAvg: f2(p.formAvg), tit: p.tit == null ? "–" : p.tit + "%", xfv: f2(p.xfv), pv: p.pv, gol: p.gol, ass: p.ass, bonusPg: f2(p.bonusPg), gsPg: f2(p.gsPg), rp: p.rp, malusPg: f2(p.malusPg), fvm: p.fvm ?? "–" };
  const t = TEAMS[p.sq] || {};
  $("#mcard").innerHTML = `<button class="close" onclick="closeModal()" aria-label="Chiudi">×</button>
  <div class="phero">${av(p, 118)}
    <div style="flex:1;min-width:230px">
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">${fascia(p.fascia)}<span class="pill" style="padding:3px 10px;cursor:default">${esc(p.Rm || p.R)}</span>${p.ballot ? `<span class="pill" style="padding:3px 10px;cursor:default">⚔️ ballottaggio</span>` : ""}</div>
      <h2>${esc(p.nome)}</h2>
      <div style="margin:8px 0">${stars(p.stars || 0)}</div>
      <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">${tlink(p.sq, 24)}${p.nextOpp ? `<span class="muted">G${p.nextOpp.g}: ${p.nextOpp.home ? "vs" : "@"} <b style="color:#fff">${esc(tname(p.nextOpp.opp))}</b></span>` : ""}</div>
      ${p.flag ? `<div style="margin-top:10px;color:var(--red);font-weight:700">● ${esc(p.flag.tipo)}: <span style="color:#fff;font-weight:400">${esc(p.flag.nota)}</span></div>` : ""}
    </div>
    <div style="display:flex;gap:12px;flex-wrap:wrap">${ring(p.tit, "titolarità")}${ring(p.tit ? p.sch : null, "indice", "var(--orange)")}${ring(p.pctPres, "presenze", "var(--cyan)")}</div>
  </div>
  <div style="padding:6px 24px 24px" class="grid g2">
    <div>
      <div class="kv">
        <div><small>Quot.</small><b>${p.qa ?? "–"}</b></div><div><small>FVM</small><b>${p.fvm ?? "–"}</b></div><div><small>Presenze</small><b>${p.pv}</b></div>
        <div><small>MV</small><b>${f2(p.mv)}</b></div><div><small>FMV</small><b>${f2(p.fm)}</b></div><div><small>FM attesa ${p.manual ? "✎" : ""}</small><b style="color:var(--orange)">${idx(p)}</b></div>
        <div><small>Gol</small><b>${p.gol}</b></div><div><small>Assist</small><b>${p.ass}</b></div><div><small>Rigori</small><b>${p.rigSegnati}/${p.rigTirati}</b></div>
        <div><small>Amm / Esp</small><b>${p.amm}/${p.esp}</b></div>${p.R === "P" ? `<div><small>Gol subiti</small><b>${p.gs}</b></div><div><small>Rig. parati</small><b>${p.rp}</b></div>` : ""}
      </div>
      <div class="calc"><b>Come nasce ${f2(p.xfvAuto)}:</b> fantamedia ${f2(p.fm)} su ${p.pv} presenze, avvicinata alla media del ruolo → ${f2((p.fm * p.pv + ({ P: 5.6, D: 5.9, C: 6.0, A: 6.2 })[p.R] * 3) / (p.pv + 3))}; forma ultime 3: ${f2(p.formAvg)}; partita ${p.nextOpp ? `${p.nextOpp.home ? "in casa" : "in trasferta"} con ${esc(tname(p.nextOpp.opp))}` : "–"}: ${p.adj > 0 ? "+" : ""}${f2(p.adj)}.
        ${p.manual ? `<br><span style="color:var(--orange)">Ora usi il valore manuale ${f2(p.xfv)}.</span> <a href="javascript:void 0" onclick="setOverride(${p.id},'')" style="color:var(--pink);font-weight:700">Ripristina automatico</a>` : `<br><span class="tip">Clic sul numero arancione per metterlo a mano.</span>`}</div>
      ${p.tit ? `<div class="calc"><b>Indice ${p.sch}:</b> titolarità ${p.tit}% da ${p.riserva ? "<b style=\"color:var(--red)\">riserva</b>" : "titolare"}, voto preso nel ${p.votoPct ?? "–"}% delle partite della squadra → probabilità di avere il voto ${Math.round(p.pVoto * 100)}%, × FM attesa ${f2(p.xfv)}, confrontato con gli altri ${ROLES[p.R].toLowerCase()}.</div>` : ""}
      <h3 style="margin:20px 0 4px;font-size:14px">📈 Andamento fantavoti</h3>${lineChart(p)}
      ${p.ballot ? `<h3 style="margin:14px 0 6px;font-size:14px">⚔️ Ballottaggio</h3>${ballot(p.ballot)}` : ""}
      ${t.next?.length ? `<h3 style="margin:14px 0 6px;font-size:14px">📅 Prossime avversarie</h3><div style="display:flex;gap:6px;flex-wrap:wrap">${t.next.map(n => `<span class="chip ${TEAMS[n.opp]?.pos <= 6 ? "lo" : TEAMS[n.opp]?.pos <= 13 ? "mid" : "hi"}" style="height:30px;padding:0 9px;gap:5px;display:inline-flex">${n.home ? "" : "@"}${crest(n.opp, 18)} ${tshort(n.opp)}</span>`).join("")}</div>` : ""}
      ${p.prob ? `<p style="margin-top:14px"><a href="#probabili/${p.prob.mi}" onclick="closeModal()" style="color:var(--pink);font-weight:700">Vedi la probabile formazione →</a></p>` : ""}
    </div>
    <div>
      <h3 style="margin:0 0 6px;font-size:14px">PERCENTILI vs ${ROLES[p.R].toUpperCase()}${p.pv < 2 ? " · poche presenze" : ""}</h3>
      ${METRICS.filter(x => x[2].includes(p.R)).map(([k, l]) => `<div class="prow"><div class="l">${l}<small>${raw[k]}</small></div><div class="pbar ${tlvl(p.pct[k] ?? 0)}"><i style="width:${p.pct[k] ?? 0}%"></i></div><div class="v" style="color:${p.pct[k] >= 66 ? "var(--green)" : p.pct[k] >= 40 ? "var(--gold)" : "var(--red)"}">${p.pct[k] ?? "–"}</div></div>`).join("")}
      ${p.rating != null ? `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;padding-top:12px;border-top:1px solid var(--line)"><b>Rating complessivo</b><span class="chip ${lvl(p.rating)}" style="font-size:16px;height:32px;min-width:46px">${p.rating}</span></div>` : ""}
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px">${consBtn(p.id, 1)}
      ${scomBtn(p.id, 1)}</div>
    </div>
  </div>`;
  $("#modal").classList.add("show");
}
// modifica manuale della fantamedia attesa: clic sul numero arancione
function editIdx(el) {
  if (soloLettura()) return;
  const id = +el.dataset.edit, p = BY.get(id); if (!p) return;
  const inp = document.createElement("input");
  inp.type = "number"; inp.step = "0.1"; inp.min = "1"; inp.max = "20"; inp.className = "idx-edit"; inp.value = f1(p.xfv);
  inp.title = "Invio per salvare · vuoto per tornare al valore automatico · Esc per annullare";
  el.replaceWith(inp); inp.focus(); inp.select();
  let done = false;
  const finish = save => { if (done) return; done = true; if (save) setOverride(id, inp.value); else go(true); };
  inp.addEventListener("keydown", e => { if (e.key === "Enter") finish(true); if (e.key === "Escape") finish(false); e.stopPropagation(); });
  inp.addEventListener("blur", () => finish(true));
  inp.addEventListener("click", e => e.stopPropagation());
}
function setOverride(id, val) {
  if (soloLettura()) return;
  const v = parseFloat(String(val).replace(",", "."));
  const p = BY.get(id);
  if (isNaN(v) || (p && Math.abs(v - p.xfvAuto) < 0.005)) delete OVR[id]; else OVR[id] = +clamp(v, 1, 20).toFixed(2);
  store.set("ovr", OVR);
  buildModel(); computePct(2);
  const open = $("#modal").classList.contains("show");
  go(true);
  if (open) openPlayer(id);
}
function resetOverrides() { if (soloLettura()) return; OVR = {}; store.set("ovr", OVR); buildModel(); computePct(2); go(true); }
function closeModal() { $("#modal").classList.remove("show"); }

// ================================================================ router ed eventi
function go(keep) {
  const fid = keep && document.activeElement?.id, pos = fid && document.activeElement.selectionStart, y = window.scrollY;
  let [page, arg] = (location.hash.slice(1) || "probabili").split("/");
  if (page === "rosa" || page === "giornata") page = "consigliati";   // pagine unite in Consigliati
  renderNav(PAGES.some(x => x[0] === page) ? page : "probabili");
  const V = { storico: pageStorico, probabili: () => pageProbabili(arg), schierabilita: pageSchierabilita, listone: pageListone, centro: pageCentro, seriea: pageSerieA, squadre: () => pageSquadre(arg), indisponibili: pageIndisponibili, consigliati: () => pageConsigliati(arg) }[page] || (() => pageProbabili(arg));
  $("#view").innerHTML = V();
  if (fid) { const el = document.getElementById(fid); if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch {} } }
  window.scrollTo(0, keep ? y : 0);
}
document.addEventListener("click", e => {
  const th = e.target.closest("th[data-lsort]");
  if (th) { const k = th.dataset.lsort; LT.dir = LT.sort === k ? -LT.dir : -1; LT.sort = k; store.set("lt", LT); go(true); return; }
  const ed = e.target.closest("[data-edit]");
  if (ed) { e.stopPropagation(); editIdx(ed); return; }
  if (e.target.closest("button,select,input")) return;
  const pe = e.target.closest("[data-pid]");
  if (pe && pe.dataset.pid !== "undefined") { $("#sres").classList.remove("show"); openPlayer(+pe.dataset.pid); return; }
  const te = e.target.closest("[data-team]");
  if (te) { closeModal(); location.hash = "squadre/" + te.dataset.team; return; }
  if (e.target.id === "modal") closeModal();
  if (!e.target.closest(".search")) $("#sres").classList.remove("show");
});
document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });
window.addEventListener("hashchange", () => go());
$("#gsearch").addEventListener("input", e => {
  const q = e.target.value.toLowerCase().trim(), box = $("#sres");
  if (q.length < 2) { box.classList.remove("show"); return; }
  const r = P.filter(p => p.nome.toLowerCase().includes(q)).sort((a, b) => (b.fvm || 0) - (a.fvm || 0)).slice(0, 8);
  box.innerHTML = r.map(p => `<div data-pid="${p.id}">${av(p, 30)}<b>${esc(p.nome)}</b><span class="tip">${esc(tname(p.sq))}</span></div>`).join("") || `<div class="tip">Nessun risultato</div>`;
  box.classList.add("show");
});

if (!D) {
  $("#view").innerHTML = `<div class="panel pad" style="max-width:640px;margin:60px auto;text-align:center"><h2>Nessun dato</h2><p>Fai doppio clic su <b>aggiorna.bat</b> nella cartella della dashboard: scarica i dati da fantacalcio.it e riapre questa pagina.</p></div>`;
}
// avvio chiamato da cloud.js (dopo l'accesso, se il sito è online)
function bootApp() {
  if (!D) return;
  OVR = store.get("ovr", {});            // i valori manuali servono già per calcolare le stime
  buildModel(); computePct(2);
  loadGiornate();                        // le squadre di giornata usano le stime appena calcolate
  go();
  startAutoRefresh();
}
