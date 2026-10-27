"use strict";
// Per ogni giornata due squadre: la "squadra top" (i consigliati 👍) e i "consigliati non scontati" 🎲 (giocatori non
// da prima fascia che possono sorprendere). Si bloccano al primo fischio d'inizio, poi si seguono live e finiscono nello storico.
// Usa le variabili globali di app.js (D, P, BY, TEAMS, MATCH, NEXT, LAST, store, ...).

const MAX_CAMBI = 3;   // sostituzioni automatiche dalla panchina, come nel fantacalcio classico
// { giornata: { ids, xi, modulo, snap, salvato, sc: { ids, xi, modulo, snap } } }
// snap = { id: {nome, R, sq, xfv, tit, sch} }: la fotografia dei giocatori fissata al blocco della giornata
let GIORN = {};
const nuovaSquadra = () => ({ ids: [], xi: [], modulo: "3-4-3", snap: {} });
const gSquad = g => (GIORN[g] ??= nuovaSquadra());
const gScom = g => (gSquad(g).sc ??= nuovaSquadra());
const squadOf = (g, tipo) => tipo === "sc" ? GIORN[g]?.sc : GIORN[g];
const TIPI = { top: { nome: "Squadra top", icona: "⭐" }, sc: { nome: "Consigliati non scontati", icona: "🎲" } };

// la giornata si blocca al fischio d'inizio della prima partita
function gLockTime(g) {
  const t = D.partite.filter(m => m.g === g && m.inizio).map(m => new Date(m.inizio).getTime());
  return t.length ? Math.min(...t) : null;
}
const gLocked = g => { const t = gLockTime(g); return t != null && Date.now() >= t; };

function loadGiornate() {
  GIORN = store.get("giornate", {});
  const libera = !gLocked(NEXT);
  // consigliati salvati prima che esistessero le giornate
  const old = store.get("cons", null);
  if (old?.length && libera && !GIORN[NEXT]?.ids?.length) { const S = gSquad(NEXT); S.ids = old.filter(id => BY.get(id)); S.ids.forEach(id => addToXI(S, id)); }
  // la vecchia "La mia rosa" diventa i consigliati non scontati della prossima giornata
  const rosa = store.get("rosa", null);
  if (rosa?.ids?.length && libera && !GIORN[NEXT]?.sc?.ids?.length) {
    const S = gScom(NEXT); S.ids = rosa.ids.filter(id => BY.get(id)); S.modulo = MODULI.includes(rosa.modulo) ? rosa.modulo : S.modulo;
    S.xi = (rosa.xi || []).filter(id => S.ids.includes(id));
    S.ids.filter(id => !S.xi.includes(id)).forEach(id => addToXI(S, id));   // posti liberi: titolari
  }
  for (const [g, S] of Object.entries(GIORN)) for (const X of [S, S.sc].filter(Boolean)) {
    X.snap ??= {}; X.xi ??= [];
    if (!MODULI.includes(X.modulo)) X.modulo = "3-4-3";   // il modulo finisce nella pagina: solo valori previsti
    if (!gLocked(+g)) fitXI(X);
  }
  if (old || rosa) { saveGiornate(); try { localStorage.removeItem("fd-cons"); localStorage.removeItem("fd-rosa"); } catch {} }
}
// prima del blocco la fotografia segue i dati; dopo il blocco resta quella dell'ultimo salvataggio
function saveGiornate() {
  const foto = S => { const snap = {}; S.ids.forEach(id => { const p = BY.get(id); if (p) snap[id] = { nome: p.nome, R: p.R, sq: p.sq, xfv: p.xfv, tit: p.tit, sch: +p.schRaw.toFixed(3) }; }); S.snap = snap; };
  for (const [g, S] of Object.entries(GIORN)) {
    if (gLocked(+g)) continue;
    foto(S); if (S.sc) foto(S.sc);
    S.salvato = new Date().toISOString();
  }
  store.set("giornate", GIORN);
}

// modalità ospite: si guarda tutto, non si modifica niente
function soloLettura() {
  if (!window.FB_GUEST) return false;
  toast("Modalità ospite: puoi solo guardare");
  return true;
}
function toast(msg) {
  let t = $("#toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add("show");
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 3200);
}

// ---------------------------------------------------------------- aggiungere e togliere giocatori
function toggleIn(tipo, id) {
  if (soloLettura()) return;
  if (gLocked(NEXT)) { toast(`La giornata ${NEXT} è già iniziata: le squadre sono bloccate.`); return; }
  const S = tipo === "sc" ? gScom(NEXT) : gSquad(NEXT);
  if (S.ids.includes(id)) { S.ids = S.ids.filter(i => i !== id); S.xi = S.xi.filter(i => i !== id); }
  else { S.ids.push(id); addToXI(S, id); }
  saveGiornate();
  const open = $("#modal").classList.contains("show");
  go(true);
  if (open) openPlayer(id);
}
const toggleCons = id => toggleIn("top", id);
const toggleScom = id => toggleIn("sc", id);
function removeFrom(tipo, g, id) {
  if (soloLettura() || gLocked(g)) return;
  const S = squadOf(g, tipo); if (!S) return;
  S.ids = S.ids.filter(i => i !== id); S.xi = S.xi.filter(i => i !== id);
  saveGiornate(); go(true);
}
function addScom(id) { SCQ = ""; if (!GIORN[NEXT]?.sc?.ids?.includes(id)) toggleScom(id); }
let SCQ = "";   // ricerca nella sezione consigliati non scontati

const isCons = id => !!GIORN[NEXT]?.ids?.includes(id);
const isScom = id => !!GIORN[NEXT]?.sc?.ids?.includes(id);
const consBtn = (id, big) => { const on = isCons(id); return `<button class="cons-btn ${on ? "on" : ""} ${big ? "big" : ""}" title="${on ? "Togli dai consigliati" : "Aggiungi ai consigliati"} della giornata ${NEXT}" onclick="toggleCons(${id})">👍${big ? (on ? " Nei consigliati" : " Aggiungi ai consigliati") : ""}</button>`; };
const scomBtn = (id, big) => { const on = isScom(id); return `<button class="cons-btn scom ${on ? "on" : ""} ${big ? "big" : ""}" title="${on ? "Togli dai non scontati" : "Aggiungi ai consigliati non scontati"} della giornata ${NEXT}" onclick="toggleScom(${id})">🎲${big ? (on ? " Nei non scontati" : " Aggiungi ai non scontati") : ""}</button>`; };

// ---------------------------------------------------------------- calcolo live
function liveCalc(g, tipo = "top") {
  const S = squadOf(g, tipo);
  if (!S || !S.ids.length) return null;
  const info = id => {
    const p = BY.get(id), sn = S.snap?.[id] || {};
    const sq = p?.sq || sn.sq, R = p?.R || sn.R, m = MATCH[g]?.[sq], e = p?.vl.find(x => x.g === g);
    const stato = !m ? "riposo" : m.status === 0 ? "prog" : m.status === 4 ? "fine" : "live";
    return { id, p, nome: p?.nome || sn.nome || "?", R, sq, m, e, stato, fv: e?.fv ?? null, v: e?.v ?? null, pre: sn.xfv ?? p?.xfv ?? null, tit: sn.tit ?? p?.tit, sch: sn.sch ?? p?.schRaw ?? 0 };
  };
  const ord = (a, b) => "PDCA".indexOf(a.R) - "PDCA".indexOf(b.R);
  const xi = S.xi.map(info).sort(ord);
  const bench = S.ids.filter(id => !S.xi.includes(id)).map(info).sort((a, b) => b.sch - a.sch);
  // sostituzioni: titolare a partita finita senza voto -> primo panchinaro dello stesso ruolo con voto
  const used = new Set(), eff = [];
  let cambi = 0;
  for (const t of xi) {
    if (t.stato === "fine" && t.fv == null && cambi < MAX_CAMBI) {
      const b = bench.find(x => x.R === t.R && x.fv != null && !used.has(x.id));
      if (b) { used.add(b.id); cambi++; t.esce = true; b.entra = t.nome; eff.push(b); continue; }
    }
    eff.push(t);
  }
  const totale = sum(eff.filter(x => x.fv != null).map(x => x.fv));
  const daGiocare = eff.filter(x => x.fv == null && (x.stato === "prog" || x.stato === "live"));
  const proiezione = totale + sum(daGiocare.map(x => x.pre || 6));
  const stima = sum(xi.map(x => x.pre || 0));
  const partite = D.partite.filter(m => m.g === g), finite = partite.filter(m => m.status === 4).length;
  const conclusa = partite.length > 0 && finite === partite.length;
  // a giochi fatti: la miglior formazione possibile con i giocatori scelti
  let ideale = null;
  const giocati = [...xi, ...bench].filter(x => x.fv != null);
  if (finite) {
    for (const mod of MODULI) {
      const need = needOf(mod), pick = [];
      for (const R of "PDCA") pick.push(...giocati.filter(x => x.R === R).sort((a, b) => b.fv - a.fv).slice(0, need[R]));
      const tot = sum(pick.map(x => x.fv));
      if (!ideale || tot > ideale.tot) ideale = { mod, tot, ids: pick.map(x => x.id) };
    }
  }
  const mvp = giocati.slice().sort((a, b) => b.fv - a.fv)[0];
  return { S, xi, bench, eff, cambi, totale, proiezione, stima, finite, nPartite: partite.length, conclusa, ideale, mvp, partite };
}

const fvBox = (x, big) => {
  if (x.fv != null) return `<span class="idx ${xfvCls(x.fv)} ${big ? "" : "sm"}" style="cursor:default">${f1(x.fv)}</span>`;
  if (x.stato === "fine") return `<span class="idx bad ${big ? "" : "sm"}" style="cursor:default;opacity:.75">s.v.</span>`;
  return `<span class="idx out ${big ? "" : "sm"}" style="cursor:default" title="Stima pre-giornata">${f1(x.pre)}</span>`;
};
const bonusIcons = x => {
  const e = x.e; if (!e) return "";
  return [e.gol ? `<span title="Gol">⚽${e.gol > 1 ? "×" + e.gol : ""}</span>` : "", e.ass ? `<span title="Assist">🅰️${e.ass > 1 ? "×" + e.ass : ""}</span>` : "",
    e.rp ? `<span title="Rigore parato">🧤${e.rp > 1 ? "×" + e.rp : ""}</span>` : "", e.rsb ? `<span title="Rigore sbagliato">❌</span>` : "",
    e.au ? `<span title="Autogol" style="color:var(--red)">AG</span>` : "", x.R === "P" && e.gs ? `<span title="Gol subiti" style="color:var(--red)">−${e.gs}</span>` : ""].join("");
};
const matchChip = x => {
  const m = x.m; if (!m) return `<span class="mchip">riposo</span>`;
  const opp = `${m.home ? "vs" : "@"} ${crest(m.opp, 16)}`;
  if (x.stato === "prog") return `<span class="mchip">${opp} ${esc((m.data || "").replace(/^\S+\s/, ""))}</span>`;
  if (x.stato === "live") return `<span class="mchip live">${opp} <b>${m.gf}-${m.gs}</b> LIVE</span>`;
  return `<span class="mchip">${opp} <b>${m.gf}-${m.gs}</b></span>`;
};
function liveRow(x) {
  return `<div class="lrow ${x.esce ? "esce" : ""} ${x.entra ? "entra" : ""}" data-pid="${x.id}">
    <span class="role ${x.R}" style="width:24px;height:24px;font-size:11px">${x.R}</span>${x.p ? av(x.p, 36, false) : ""}
    <div class="ln"><b>${esc(x.nome)}${x.esce ? ' <span class="sub out">⬇ esce</span>' : ""}${x.entra ? ` <span class="sub in">⬆ per ${esc(x.entra)}</span>` : ""}</b>
      <div class="lm">${crest(x.sq, 16)} ${matchChip(x)}</div></div>
    <div class="lb">${bonusIcons(x)}</div>
    <div class="lv"><small>voto</small>${x.v != null ? f1(x.v) : "–"}</div>${fvBox(x)}</div>`;
}

// ---------------------------------------------------------------- blocchi riutilizzati
function defaultGiornata() {
  const g = D.inCorso, ms = D.partite.filter(m => m.g === g);
  return ms.some(m => m.status !== 0) && ms.some(m => m.status !== 4) ? g : NEXT;
}
function fmtCountdown(ms) {
  const m = Math.max(0, Math.round(ms / 60000)), d = Math.floor(m / 1440), h = Math.floor(m % 1440 / 60), mi = m % 60;
  return d ? `${d}g ${h}h` : h ? `${h}h ${mi}m` : `${mi} min`;
}
const lockLabel = g => { const t = gLockTime(g); return t ? new Date(t).toLocaleString("it-IT", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "–"; };
const gnav = (g, page) => { const maxG = Math.max(...D.partite.map(m => m.g)); return `<div class="gnav"><a href="#${page}/${Math.max(1, g - 1)}">‹</a><span>GIORNATA ${g}</span><a href="#${page}/${Math.min(maxG, g + 1)}">›</a></div>`; };

// campo con titolari e panchina di una squadra non ancora bloccata
function squadPitch(S, k, editabile) {
  const mine = S.ids.map(id => BY.get(id)).filter(Boolean);
  const xi = S.xi.map(id => BY.get(id)).filter(Boolean), bench = mine.filter(p => !S.xi.includes(p.id)).sort((a, b) => b.schRaw - a.schRaw);
  const best = editabile && mine.length >= 11 ? MODULI.map(m => ({ m, ...bestXI(mine, m) })).sort((a, b) => b.total - a.total)[0] : null;
  return `
    <div style="display:flex;align-items:center;gap:10px;justify-content:center;margin-bottom:6px;flex-wrap:wrap">
      ${editabile ? `<select class="input" onchange="setModulo('${k}',this.value)">${MODULI.map(m => `<option ${m === S.modulo ? "selected" : ""}>${m}</option>`).join("")}</select>` : `<span class="pill" style="cursor:default">${esc(S.modulo)}</span>`}
      <span class="tip">titolari ${xi.length}/11 · stima <b style="color:var(--orange)">${f1(sum(xi.map(p => p.xfv)))}</b></span></div>
    ${best ? `<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-bottom:8px"><button class="xi-auto" onclick="applyBest('${k}')">⚡ Migliori 11 (${S.modulo})</button>${best.m !== S.modulo ? `<button class="xi-auto alt" onclick="applyBest('${k}','${best.m}')">Modulo migliore: ${best.m}</button>` : ""}</div>` : ""}
    ${pitch(S.modulo, xi.map(p => ({ id: p.id, nome: p.nome })), { byRole: true })}
    <div class="h2">🪑 Riserve</div><div class="rows">${bench.map((p, i) => `<div class="r"><span class="dim num">${i + 1}</span><span data-pid="${p.id}">${av(p, 30)}</span><span style="flex:1" data-pid="${p.id}">${esc(p.nome)}</span><span class="chip ${lvl(p.tit)}">${p.tit ?? 0}%</span>${idx(p, 1)}${editabile ? `<button class="xi-btn" onclick="toggleXI('${k}',${p.id})">PAN</button>` : ""}</div>`).join("") || '<div class="tip">Nessuna riserva</div>'}</div>`;
}
// lista per scegliere titolari e panchina
function squadList(S, k, g, tipo) {
  const mine = S.ids.map(id => BY.get(id)).filter(Boolean);
  const row = p => { const t = S.xi.includes(p.id); return `<div class="r"><span data-pid="${p.id}">${av(p, 34)}</span><div data-pid="${p.id}" style="flex:1;min-width:0"><b>${esc(p.nome)}</b> ${fascia(p.fascia)} <span class="tip">${esc(tname(p.sq))}${p.nextOpp ? ` · ${p.nextOpp.home ? "vs" : "@"} ${esc(tname(p.nextOpp.opp))}` : ""}</span>${p.flag && p.flag.tipo !== "Diffidato" ? `<div style="color:var(--red);font-size:12px">● ${esc(p.flag.tipo)}</div>` : ""}</div><span class="chip ${lvl(p.tit)}">${p.tit ?? 0}%</span>${idx(p, 1)}<button class="xi-btn ${t ? "on" : ""}" title="${t ? "Manda in panchina" : "Metti titolare"}" onclick="toggleXI('${k}',${p.id})">${t ? "TIT" : "PAN"}</button><button class="xbtn" title="Togli" onclick="removeFrom('${tipo}',${g},${p.id})">×</button></div>`; };
  return `<div class="rows">${"PDCA".split("").map(R => mine.filter(p => p.R === R).sort((a, b) => S.xi.includes(b.id) - S.xi.includes(a.id) || b.schRaw - a.schRaw).map(row).join("")).join("")}</div>`;
}
// vista live di una squadra bloccata
function liveBlock(g, tipo, conPartite) {
  const L = liveCalc(g, tipo);
  const partiteHtml = D.partite.filter(m => m.g === g).map(m => `<div class="cal-m" style="cursor:default"><span style="text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(tname(m.home))}</span>${crest(m.home, 20)}<span class="sc ${m.status === 0 ? "fut" : ""} ${m.status !== 0 && m.status !== 4 ? "live" : ""}">${m.status === 0 ? esc(m.data) : `${m.gh} - ${m.ga}`}</span>${crest(m.away, 20)}<span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(tname(m.away))}</span></div>`).join("");
  const partitePanel = conPartite ? `<div class="panel pad" style="margin-top:12px"><h3>Partite</h3>${partiteHtml}</div>` : "";
  if (!L) return `<div class="panel pad empty">Per la giornata ${g} non c'era nessun giocatore in ${TIPI[tipo].nome}.</div>${partitePanel}`;
  const stato = L.conclusa ? `<span class="gbadge done">✅ CONCLUSA</span>` : L.finite || L.partite.some(m => m.status !== 0) ? `<span class="gbadge live">🔴 IN CORSO</span>` : `<span class="gbadge">🔒 BLOCCATA</span>`;
  const badge = x => x.fv != null ? `<span class="badge ${xfvCls(x.fv)}">${f1(x.fv)}</span>` : x.stato === "fine" ? `<span class="badge bad">s.v.</span>` : x.stato === "live" ? `<span class="badge pc lo">LIVE</span>` : "";
  const byId = new Map([...L.xi, ...L.bench].map(x => [x.id, x]));
  return `
  <div class="gsum">
    <div class="tot ${tipo === "sc" ? "sc" : ""}">${stato}<b>${f1(L.totale)}</b><small>fantapunti</small></div>
    <div><small>Proiezione</small><b>${f1(L.proiezione)}</b><span class="tip">con le stime per chi deve giocare</span></div>
    <div><small>Stima pre-giornata</small><b style="color:var(--orange)">${f1(L.stima)}</b><span class="tip">${L.conclusa ? (L.totale >= L.stima ? "🟢 +" : "🔴 ") + f1(L.totale - L.stima) + " rispetto alla stima" : "somma FM attese"}</span></div>
    <div><small>Partite finite</small><b>${L.finite}/${L.nPartite}</b><span class="tip">cambi usati ${L.cambi}/${MAX_CAMBI}</span></div>
    ${L.ideale ? `<div><small>Formazione ideale</small><b style="color:var(--cyan)">${f1(L.ideale.tot)}</b><span class="tip">${L.ideale.mod} con questi giocatori</span></div>` : ""}
  </div>
  <div class="grid split" style="--a:1fr;--b:1.15fr">
    <div>${pitch(L.S.modulo, L.eff.map(x => ({ id: x.id, nome: x.nome })), { byRole: true, badge: x => badge(byId.get(x.id) || {}) })}${partitePanel}</div>
    <div class="panel pad"><h3>⚽ Titolari</h3><div class="rows">${L.xi.map(x => liveRow(x) + (x.esce ? liveRow(L.bench.find(b => b.entra === x.nome)) : "")).join("")}</div>
      <h3 style="margin-top:16px">🪑 Riserve</h3><div class="rows">${L.bench.filter(b => !b.entra).map(liveRow).join("") || '<div class="tip">Nessuna</div>'}</div>
      ${L.mvp ? `<p class="tip" style="margin-top:12px">⭐ Migliore: <b style="color:#fff">${esc(L.mvp.nome)}</b> ${f1(L.mvp.fv)}</p>` : ""}
    </div>
  </div>`;
}

// ---------------------------------------------------------------- pagina Consigliati: le due formazioni + la lista
// lista in sola lettura di tutti i consigliati della giornata (ospiti e giornate già giocate)
function consList(g) {
  const S = GIORN[g] || nuovaSquadra(), C = S.sc || nuovaSquadra();
  const tutti = [...new Set([...S.ids, ...C.ids])].map(id => BY.get(id)).filter(Boolean)
    .sort((a, b) => "PDCA".indexOf(a.R) - "PDCA".indexOf(b.R) || b.schRaw - a.schRaw);
  const row = p => {
    const dove = [S.ids.includes(p.id) ? `<span class="ctag top">⭐ ${S.xi.includes(p.id) ? "titolare" : "riserva"}</span>` : "", C.ids.includes(p.id) ? `<span class="ctag sc">🎲 ${C.xi.includes(p.id) ? "titolare" : "riserva"}</span>` : ""].join("");
    return `<div class="r" data-pid="${p.id}"><span class="role ${p.R}" style="width:24px;height:24px;font-size:11px">${p.R}</span>${av(p, 34)}<div style="flex:1;min-width:0"><b>${esc(p.nome)}</b> ${fascia(p.fascia)} <span class="tip">${esc(tname(p.sq))}${p.nextOpp ? ` · ${p.nextOpp.home ? "vs" : "@"} ${esc(tname(p.nextOpp.opp))}` : ""}</span><div>${dove}</div></div><span class="chip ${lvl(p.tit)}">${p.tit ?? 0}%</span>${idx(p, 1)}</div>`;
  };
  return tutti.length ? `<div class="rows">${tutti.map(row).join("")}</div>` : '<div class="empty">Nessun consigliato per questa giornata.</div>';
}
// una formazione non ancora bloccata
function formazione(g, tipo, ed) {
  const S = squadOf(g, tipo), k = (tipo === "sc" ? "s" : "g") + g;
  const titolo = tipo === "sc" ? "🎲 CONSIGLIATI NON SCONTATI" : "⭐ SQUADRA TOP";
  const body = S?.ids?.length ? squadPitch(S, k, ed) : `<div class="empty">Formazione non ancora pronta.</div>`;
  return `<div class="panel pad form-panel ${tipo}"><h2 class="form-title ${tipo}">${titolo}</h2>${body}</div>`;
}
function pageConsigliati(arg) {
  const g = clamp(+arg || defaultGiornata(), 1, 38), locked = gLocked(g), lock = gLockTime(g);
  const ed = g === NEXT && !locked && !window.FB_GUEST;
  const head = title("Consigliati", locked ? "Giornata iniziata: formazioni bloccate, punteggi aggiornati man mano che escono i voti" : "Le due formazioni della giornata: si bloccano al primo fischio d'inizio", "👍") + gnav(g, "consigliati");
  const S = GIORN[g], C = S?.sc;
  if (locked) {
    return head + `
    <h2 class="form-title big top">⭐ SQUADRA TOP</h2>${liveBlock(g, "top", false)}
    <h2 class="form-title big sc">🎲 CONSIGLIATI NON SCONTATI</h2>${liveBlock(g, "sc", true)}
    <p class="tip" style="text-align:center">Dati aggiornati ${esc(D.aggiornato)} · la pagina si aggiorna da sola · voti fantacalcio.it appena pubblicati</p>`;
  }
  if (!ed && !S?.ids?.length && !C?.ids?.length) return head + `<div class="panel pad empty">Le formazioni della giornata ${g} non sono ancora pronte.${g !== NEXT ? `<br><a href="#consigliati/${NEXT}" style="color:var(--pink)">Vai alla giornata ${NEXT}</a>` : ""}</div>`;
  const stima = X => X ? f1(sum(X.xi.map(id => BY.get(id)?.xfv || 0))) : "–";
  const riepilogo = `
  <div class="gsum">
    <div><small>Si blocca</small><b>${lockLabel(g)}</b><span class="tip">${lock ? "tra " + fmtCountdown(lock - Date.now()) : ""}</span></div>
    <div><small>⭐ Squadra top</small><b>${S?.ids?.length || 0}</b><span class="tip">titolari ${S?.xi?.length || 0}/11 · stima ${stima(S)}</span></div>
    <div><small>🎲 Non scontati</small><b>${C?.ids?.length || 0}</b><span class="tip">titolari ${C?.xi?.length || 0}/11 · stima ${stima(C)}</span></div>
  </div>`;
  const campi = `<div class="grid form-grid">${formazione(g, "top", ed)}${formazione(g, "sc", ed)}</div>`;
  if (!ed) return head + riepilogo + campi + `<div class="panel pad" style="margin-top:22px"><h3>👍 Tutti i consigliati della giornata</h3>${consList(g)}</div>`;

  // modifica: solo con l'account e prima del fischio d'inizio
  const T = gSquad(g), X = gScom(g);
  const results = SCQ.length >= 2 ? P.filter(p => p.nome.toLowerCase().includes(SCQ) && !X.ids.includes(p.id)).slice(0, 30) : [];
  // suggerimenti: non da prima fascia, titolari probabili, indice alto
  const sugg = P.filter(p => p.tit >= 65 && !p.riserva && p.fascia !== "Top" && p.fascia !== "SemiTop" && !X.ids.includes(p.id)).sort((a, b) => b.schRaw - a.schRaw).slice(0, 10);
  return head + riepilogo + campi + `
  <div class="h2" style="margin-top:26px">👍 Tutti i consigliati</div>
  <div class="grid form-grid">
    <div class="panel pad">
      <h3>⭐ Squadra top (${T.ids.length})</h3>
      <p class="tip" style="margin-top:-6px">Aggiungili con 👍 da Probabili, Schierabilità o Listone.</p>
      ${T.ids.length ? squadList(T, "g" + g, g, "top") : '<div class="empty">Nessun consigliato. Vai sulle <a href="#probabili" style="color:var(--pink)">Probabili</a> e premi 👍.</div>'}
    </div>
    <div class="panel pad scom-panel">
      <h3>🎲 Consigliati non scontati (${X.ids.length})</h3>
      <p class="tip" style="margin-top:-6px">Giocatori non da prima fascia che possono sorprendere. Aggiungili da qui, con 🎲 nel Listone o dalla scheda del giocatore.</p>
      <input class="input" id="scq" placeholder="Aggiungi un giocatore…" value="${esc(SCQ)}" oninput="SCQ=this.value.toLowerCase();go(true)" style="width:100%">
      ${results.length ? `<div class="sel-list">${results.map(p => `<div onclick="addScom(${p.id})">${av(p, 30)} <b>${esc(p.nome)}</b> ${fascia(p.fascia)} <span class="muted">${esc(tname(p.sq))}</span><span class="spacer"></span>${idx(p, 1)}</div>`).join("")}</div>` : ""}
      ${sugg.length ? `<div class="tip" style="margin:12px 0 6px">💡 Suggeriti: titolari probabili, non Top, con indice alto</div><div class="sugg">${sugg.map(p => `<button class="sugg-chip" onclick="addScom(${p.id})" title="${esc(tname(p.sq))}">${av(p, 22, false)} ${esc(p.nome)} <b>${f1(p.xfv)}</b> +</button>`).join("")}</div>` : ""}
      <div style="margin-top:12px">${X.ids.length ? squadList(X, "s" + g, g, "sc") : '<div class="empty">Ancora nessun giocatore.</div>'}</div>
    </div>
  </div>`;
}

// ---------------------------------------------------------------- Storico
function pageStorico() {
  const gs = Object.keys(GIORN).map(Number).filter(g => (GIORN[g].ids?.length || GIORN[g].sc?.ids?.length) && gLocked(g)).sort((a, b) => b - a);
  const rows = gs.map(g => ({ g, L: liveCalc(g, "top"), C: liveCalc(g, "sc") })).filter(x => x.L || x.C);
  const conclusa = x => (x.L || x.C).conclusa;
  const done = rows.filter(conclusa);
  const mediaOf = k => { const v = done.map(x => x[k]?.totale).filter(t => t != null); return v.length ? avg(v) : null; };
  const best = done.filter(x => x.L).sort((a, b) => b.L.totale - a.L.totale)[0];
  // grafico: squadra top, non scontati e stima della squadra top
  const ch = done.slice().reverse();
  let chart = "";
  if (ch.length >= 2) {
    const W = 600, H = 170, vals = ch.flatMap(x => [x.L?.totale, x.L?.stima, x.C?.totale]).filter(v => v != null), mn = Math.min(...vals) - 3, mx = Math.max(...vals) + 3;
    const X = i => 30 + i * (W - 50) / (ch.length - 1), Y = v => 10 + (1 - (v - mn) / (mx - mn)) * (H - 35);
    const line = (get, col, dash) => { const pts = ch.map((x, i) => [i, get(x)]).filter(([, v]) => v != null); return `<path d="${pts.map(([i, v], j) => `${j ? "L" : "M"}${X(i)},${Y(v)}`).join(" ")}" fill="none" stroke="${col}" stroke-width="2.5" ${dash ? 'stroke-dasharray="5 5"' : ""}/>` + pts.map(([i, v]) => `<circle cx="${X(i)}" cy="${Y(v)}" r="4" fill="${col}"><title>G${ch[i].g}: ${f1(v)}</title></circle>`).join(""); };
    chart = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto">${ch.map((x, i) => `<text x="${X(i)}" y="${H - 6}" fill="#b4a9e6" font-size="11" text-anchor="middle">G${x.g}</text>`).join("")}${line(x => x.L?.stima, "#ff8a1c", 1)}${line(x => x.C?.totale, "#7fd0f7")}${line(x => x.L?.totale, "#5dff9b")}</svg>
      <div class="tip" style="text-align:center"><span style="color:#5dff9b">━ ⭐ squadra top</span> · <span style="color:#7fd0f7">━ 🎲 non scontati</span> · <span style="color:#ff8a1c">┅ stima squadra top</span></div>`;
  }
  const cell = (L, lbl, cmp) => L ? `<div class="hv"><small>${lbl}</small><b style="color:${cmp == null ? "#fff" : L.totale >= cmp ? "var(--green)" : "var(--red)"}">${f1(L.totale)}</b></div>` : `<div class="hv"><small>${lbl}</small>–</div>`;
  return title("Storico", "Come sono andate la squadra top e i consigliati non scontati giornata per giornata", "📜") + `
  <div class="gsum">
    <div><small>Giornate giocate</small><b>${done.length}</b></div>
    <div><small>Media ⭐ squadra top</small><b>${f1(mediaOf("L"))}</b></div>
    <div><small>Media 🎲 Non scontati</small><b style="color:#7fd0f7">${f1(mediaOf("C"))}</b></div>
    <div><small>Miglior giornata</small><b style="color:var(--cyan)">${best ? f1(best.L.totale) : "–"}</b><span class="tip">${best ? "giornata " + best.g : ""}</span></div>
  </div>
  ${chart ? `<div class="panel pad" style="margin-bottom:16px">${chart}</div>` : ""}
  <div class="rows">${rows.map(({ g, L, C }) => `<div class="r hist">
      <a class="hg" href="#consigliati/${g}">G${g}</a>
      <div style="flex:1;min-width:0"><div>${conclusa({ L, C }) ? "✅ Conclusa" : "🔴 In corso"}${L ? ` · ${esc(L.S.modulo)} · ${L.S.ids.length} consigliati` : ""}</div><div class="tip">${L?.mvp ? `⭐ ${esc(L.mvp.nome)} ${f1(L.mvp.fv)}` : ""}${C?.mvp ? ` · 🎲 ${esc(C.mvp.nome)} ${f1(C.mvp.fv)}` : ""}</div>
        <div class="tip"><a href="#consigliati/${g}" style="color:var(--pink)">⭐ squadra top e 🎲 non scontati</a></div></div>
      <div class="hv"><small>stima</small>${L ? f1(L.stima) : "–"}</div>
      ${cell(L, "⭐ top", L?.stima)}${cell(C, "🎲 scomm.", C?.stima)}</div>`).join("") || '<div class="panel pad empty">Ancora niente: prepara i consigliati della prossima giornata e, quando sarà iniziata, la trovi qui.</div>'}</div>`;
}

// ---------------------------------------------------------------- aggiornamento automatico dei dati
function startAutoRefresh() {
  setInterval(async () => {
    try {
      const t = await (await fetch("data/data.js?t=" + Date.now(), { cache: "no-store" })).text();
      const m = t.match(/"aggiornatoIso":\s*"([^"]+)"/);
      const busy = document.activeElement?.matches?.("input,select") || $("#modal").classList.contains("show");
      if (m && m[1] !== D.aggiornatoIso && !busy) location.reload();
    } catch { /* aperto da file: niente aggiornamento automatico */ }
  }, 5 * 60 * 1000);
  // il blocco della giornata scatta anche senza nuovi dati
  setInterval(() => {
    const live = location.hash.startsWith("#consigliati");
    if (live && !document.activeElement?.matches?.("input,select") && !$("#modal").classList.contains("show")) go(true);
  }, 60 * 1000);
}
