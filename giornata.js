"use strict";
// Consigliati e formazione per giornata, pagina live in stile Leghe e storico.
// Usa le variabili globali di app.js (D, P, BY, TEAMS, MATCH, NEXT, LAST, store, ...).

const MAX_CAMBI = 3;   // sostituzioni automatiche dalla panchina, come nel fantacalcio classico
let GIORN = {};        // { giornata: { ids, xi, modulo, snap: { id: {nome, R, sq, xfv, tit, sch} }, salvato } }

const gSquad = g => (GIORN[g] ??= { ids: [], xi: [], modulo: "3-4-3", snap: {} });
// la giornata si blocca al fischio d'inizio della prima partita
function gLockTime(g) {
  const t = D.partite.filter(m => m.g === g && m.inizio).map(m => new Date(m.inizio).getTime());
  return t.length ? Math.min(...t) : null;
}
const gLocked = g => { const t = gLockTime(g); return t != null && Date.now() >= t; };

function loadGiornate() {
  GIORN = store.get("giornate", {});
  const old = store.get("cons", null);   // consigliati salvati prima che esistessero le giornate
  if (old?.length && !GIORN[NEXT]?.ids?.length && !gLocked(NEXT)) {
    const S = gSquad(NEXT); S.ids = old.filter(id => BY.get(id)); S.ids.forEach(id => addToXI(S, id));
    saveGiornate();
  }
  try { localStorage.removeItem("fd-cons"); } catch {}
  for (const [g, S] of Object.entries(GIORN)) { S.snap ??= {}; S.xi ??= []; if (!gLocked(+g)) fitXI(S); }
}
// prima del blocco la "fotografia" (stima, titolarità) segue i dati; dopo il blocco resta quella dell'ultimo salvataggio
function saveGiornate() {
  for (const [g, S] of Object.entries(GIORN)) {
    if (gLocked(+g)) continue;
    const snap = {};
    S.ids.forEach(id => { const p = BY.get(id); if (p) snap[id] = { nome: p.nome, R: p.R, sq: p.sq, xfv: p.xfv, tit: p.tit, sch: +p.schRaw.toFixed(3) }; });
    S.snap = snap; S.salvato = new Date().toISOString();
  }
  store.set("giornate", GIORN);
}

function toast(msg) {
  let t = $("#toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add("show");
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 3200);
}
function toggleCons(id) {
  if (gLocked(NEXT)) { toast(`La giornata ${NEXT} è già iniziata: i consigliati sono bloccati.`); return; }
  const S = gSquad(NEXT);
  if (S.ids.includes(id)) { S.ids = S.ids.filter(i => i !== id); S.xi = S.xi.filter(i => i !== id); }
  else { S.ids.push(id); addToXI(S, id); }
  saveGiornate();
  const open = $("#modal").classList.contains("show");
  go(true);
  if (open) openPlayer(id);
}
function removeCons(g, id) { if (gLocked(g)) return; const S = gSquad(g); S.ids = S.ids.filter(i => i !== id); S.xi = S.xi.filter(i => i !== id); saveGiornate(); go(true); }
const isCons = id => !!GIORN[NEXT]?.ids?.includes(id);
const consBtn = (id, big) => { const on = isCons(id); return `<button class="cons-btn ${on ? "on" : ""} ${big ? "big" : ""}" title="${on ? "Togli dai consigliati" : "Aggiungi ai consigliati"} della giornata ${NEXT}" onclick="toggleCons(${id})">👍${big ? (on ? " Nei consigliati" : " Aggiungi ai consigliati") : ""}</button>`; };

// ---------------------------------------------------------------- calcolo live
function liveCalc(g) {
  const S = GIORN[g];
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
  // a giochi fatti: la miglior formazione possibile con i consigliati
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

// ---------------------------------------------------------------- pagina Giornata
function defaultGiornata() {
  const g = D.inCorso, ms = D.partite.filter(m => m.g === g);
  return ms.some(m => m.status !== 0) && ms.some(m => m.status !== 4) ? g : NEXT;
}
function fmtCountdown(ms) {
  const m = Math.max(0, Math.round(ms / 60000)), d = Math.floor(m / 1440), h = Math.floor(m % 1440 / 60), mi = m % 60;
  return d ? `${d}g ${h}h` : h ? `${h}h ${mi}m` : `${mi} min`;
}
function pageGiornata(arg) {
  const g = clamp(+arg || defaultGiornata(), 1, 38), k = "g" + g;
  const maxG = Math.max(...D.partite.map(m => m.g));
  const lock = gLockTime(g), locked = gLocked(g);
  const nav = `<div class="gnav"><a href="#giornata/${Math.max(1, g - 1)}">‹</a><span>GIORNATA ${g}</span><a href="#giornata/${Math.min(maxG, g + 1)}">›</a></div>`;
  const head = title("Giornata", locked ? "I tuoi consigliati in campo: punteggi aggiornati man mano che escono i voti" : "Prepara consigliati e formazione: si bloccano al primo fischio d'inizio", "🔴") + nav;
  const S = GIORN[g];

  if (!locked) {
    if (g !== NEXT && !S?.ids?.length) return head + `<div class="panel pad empty">I consigliati si preparano per la prossima giornata (${NEXT}).<br><a href="#giornata/${NEXT}" style="color:var(--pink)">Vai alla giornata ${NEXT}</a></div>`;
    const Sx = gSquad(g), mine = Sx.ids.map(id => BY.get(id)).filter(Boolean);
    const xi = Sx.xi.map(id => BY.get(id)).filter(Boolean), bench = mine.filter(p => !Sx.xi.includes(p.id)).sort((a, b) => b.schRaw - a.schRaw);
    const stima = sum(xi.map(p => p.xfv));
    const best = mine.length >= 11 ? MODULI.map(m => ({ m, ...bestXI(mine, m) })).sort((a, b) => b.total - a.total)[0] : null;
    const row = p => { const t = Sx.xi.includes(p.id); return `<div class="r"><span data-pid="${p.id}">${av(p, 34)}</span><div data-pid="${p.id}" style="flex:1;min-width:0"><b>${esc(p.nome)}</b> <span class="tip">${esc(tname(p.sq))}${p.nextOpp ? ` · ${p.nextOpp.home ? "vs" : "@"} ${esc(tname(p.nextOpp.opp))}` : ""}</span>${p.flag && p.flag.tipo !== "Diffidato" ? `<div style="color:var(--red);font-size:12px">● ${esc(p.flag.tipo)}</div>` : ""}</div><span class="chip ${lvl(p.tit)}">${p.tit ?? 0}%</span>${idx(p, 1)}<button class="xi-btn ${t ? "on" : ""}" onclick="toggleXI('${k}',${p.id})">${t ? "TIT" : "PAN"}</button><button class="xbtn" title="Togli dai consigliati" onclick="removeCons(${g},${p.id})">×</button></div>`; };
    return head + `
    <div class="gsum">
      <div><small>Si blocca</small><b>${lock ? new Date(lock).toLocaleString("it-IT", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "–"}</b><span class="tip">${lock ? "tra " + fmtCountdown(lock - Date.now()) : ""}</span></div>
      <div><small>Consigliati</small><b>${mine.length}</b><span class="tip">titolari ${xi.length}/11</span></div>
      <div><small>Stima totale</small><b style="color:var(--orange)">${f1(stima)}</b><span class="tip">somma FM attese dei titolari</span></div>
    </div>
    <div class="grid split" style="--a:1fr;--b:1.1fr">
      <div class="panel pad"><h3>👍 Consigliati (${mine.length}) <span class="tip" style="text-transform:none">aggiungili con 👍 dalle <a href="#probabili" style="color:var(--pink)">Probabili</a>, Schierabilità o Listone</span></h3>
        <div class="rows">${"PDCA".split("").map(R => mine.filter(p => p.R === R).sort((a, b) => Sx.xi.includes(b.id) - Sx.xi.includes(a.id) || b.schRaw - a.schRaw).map(row).join("")).join("") || '<div class="empty">Nessun consigliato. Vai sulle Probabili e premi 👍 sui giocatori che vuoi.</div>'}</div></div>
      <div>
        <div style="display:flex;align-items:center;gap:10px;justify-content:center;margin-bottom:6px;flex-wrap:wrap"><b style="font-size:19px">👥 Formazione dei consigliati</b><select class="input" onchange="setModulo('${k}',this.value)">${MODULI.map(m => `<option ${m === Sx.modulo ? "selected" : ""}>${m}</option>`).join("")}</select><span class="tip">${xi.length}/11</span></div>
        ${best ? `<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-bottom:8px"><button class="xi-auto" onclick="applyBest('${k}')">⚡ Migliori 11 (${Sx.modulo})</button>${best.m !== Sx.modulo ? `<button class="xi-auto alt" onclick="applyBest('${k}','${best.m}')">Modulo migliore: ${best.m}</button>` : ""}</div>` : ""}
        ${pitch(Sx.modulo, xi.map(p => ({ id: p.id, nome: p.nome })), { byRole: true })}
        <div class="h2">Panchina in ordine</div><div class="rows">${bench.map((p, i) => `<div class="r"><span class="dim num">${i + 1}</span><span data-pid="${p.id}">${av(p, 30)}</span><span style="flex:1" data-pid="${p.id}">${esc(p.nome)}</span><span class="chip ${lvl(p.tit)}">${p.tit ?? 0}%</span>${idx(p, 1)}<button class="xi-btn" onclick="toggleXI('${k}',${p.id})">PAN</button></div>`).join("") || '<div class="tip">Nessuno in panchina</div>'}</div>
      </div>
    </div>`;
  }

  // ---- giornata bloccata: vista live
  const L = liveCalc(g);
  const partiteHtml = D.partite.filter(m => m.g === g).map(m => `<div class="cal-m" style="cursor:default"><span style="text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(tname(m.home))}</span>${crest(m.home, 20)}<span class="sc ${m.status === 0 ? "fut" : ""} ${m.status !== 0 && m.status !== 4 ? "live" : ""}">${m.status === 0 ? esc(m.data) : `${m.gh} - ${m.ga}`}</span>${crest(m.away, 20)}<span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(tname(m.away))}</span></div>`).join("");
  if (!L) return head + `<div class="panel pad empty">Per la giornata ${g} non avevi salvato consigliati.</div><div class="panel pad" style="margin-top:16px"><h3>Partite</h3>${partiteHtml}</div>`;
  const stato = L.conclusa ? `<span class="gbadge done">✅ CONCLUSA</span>` : L.finite || L.partite.some(m => m.status !== 0) ? `<span class="gbadge live">🔴 IN CORSO</span>` : `<span class="gbadge">🔒 BLOCCATA</span>`;
  const badge = x => x.fv != null ? `<span class="badge ${xfvCls(x.fv)}">${f1(x.fv)}</span>` : x.stato === "fine" ? `<span class="badge bad">s.v.</span>` : x.stato === "live" ? `<span class="badge pc lo">LIVE</span>` : "";
  const byId = new Map([...L.xi, ...L.bench].map(x => [x.id, x]));
  return head + `
  <div class="gsum">
    <div class="tot">${stato}<b>${f1(L.totale)}</b><small>fantapunti</small></div>
    <div><small>Proiezione</small><b>${f1(L.proiezione)}</b><span class="tip">con le stime per chi deve giocare</span></div>
    <div><small>Stima pre-giornata</small><b style="color:var(--orange)">${f1(L.stima)}</b><span class="tip">${L.conclusa ? (L.totale >= L.stima ? "🟢 +" : "🔴 ") + f1(L.totale - L.stima) + " rispetto alla stima" : "somma FM attese"}</span></div>
    <div><small>Partite finite</small><b>${L.finite}/${L.nPartite}</b><span class="tip">cambi usati ${L.cambi}/${MAX_CAMBI}</span></div>
    ${L.ideale ? `<div><small>Formazione ideale</small><b style="color:var(--cyan)">${f1(L.ideale.tot)}</b><span class="tip">${L.ideale.mod} con i tuoi consigliati</span></div>` : ""}
  </div>
  <div class="grid split" style="--a:1fr;--b:1.15fr">
    <div>${pitch(L.S.modulo, L.eff.map(x => ({ id: x.id, nome: x.nome })), { byRole: true, badge: x => badge(byId.get(x.id) || {}) })}
      <div class="panel pad" style="margin-top:12px"><h3>Partite</h3>${partiteHtml}</div></div>
    <div class="panel pad"><h3>⚽ Titolari</h3><div class="rows">${L.xi.map(x => liveRow(x) + (x.esce ? liveRow(L.bench.find(b => b.entra === x.nome)) : "")).join("")}</div>
      <h3 style="margin-top:16px">🪑 Panchina</h3><div class="rows">${L.bench.filter(b => !b.entra).map(liveRow).join("") || '<div class="tip">Nessuno</div>'}</div>
      ${L.mvp ? `<p class="tip" style="margin-top:12px">⭐ Migliore: <b style="color:#fff">${esc(L.mvp.nome)}</b> ${f1(L.mvp.fv)}</p>` : ""}
    </div>
  </div>
  <p class="tip" style="text-align:center">Dati aggiornati ${esc(D.aggiornato)} · la pagina si aggiorna da sola · voti fantacalcio.it (redazione) appena pubblicati</p>`;
}

// ---------------------------------------------------------------- Storico
function pageStorico() {
  const gs = Object.keys(GIORN).map(Number).filter(g => GIORN[g].ids?.length && gLocked(g)).sort((a, b) => b - a);
  const rows = gs.map(g => ({ g, L: liveCalc(g) })).filter(x => x.L);
  const done = rows.filter(x => x.L.conclusa);
  const media = done.length ? avg(done.map(x => x.L.totale)) : null;
  const best = done.slice().sort((a, b) => b.L.totale - a.L.totale)[0];
  // grafico totale vs stima per giornata
  const ch = done.slice().reverse();
  let chart = "";
  if (ch.length >= 2) {
    const W = 600, H = 170, vals = ch.flatMap(x => [x.L.totale, x.L.stima]), mn = Math.min(...vals) - 3, mx = Math.max(...vals) + 3;
    const X = i => 30 + i * (W - 50) / (ch.length - 1), Y = v => 10 + (1 - (v - mn) / (mx - mn)) * (H - 35);
    const line = (k, col, dash) => `<path d="${ch.map((x, i) => `${i ? "L" : "M"}${X(i)},${Y(x.L[k])}`).join(" ")}" fill="none" stroke="${col}" stroke-width="2.5" ${dash ? 'stroke-dasharray="5 5"' : ""}/>` + ch.map((x, i) => `<circle cx="${X(i)}" cy="${Y(x.L[k])}" r="4" fill="${col}"><title>G${x.g}: ${f1(x.L[k])}</title></circle>`).join("");
    chart = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto">${ch.map((x, i) => `<text x="${X(i)}" y="${H - 6}" fill="#b4a9e6" font-size="11" text-anchor="middle">G${x.g}</text>`).join("")}${line("stima", "#ff8a1c", 1)}${line("totale", "#5dff9b")}</svg>
      <div class="tip" style="text-align:center"><span style="color:#5dff9b">━ punteggio</span> · <span style="color:#ff8a1c">┅ stima pre-giornata</span></div>`;
  }
  return title("Storico", "Come sono andati i tuoi consigliati giornata per giornata", "📜") + `
  <div class="gsum">
    <div><small>Giornate giocate</small><b>${done.length}</b></div>
    <div><small>Media punti</small><b>${f1(media)}</b></div>
    <div><small>Miglior giornata</small><b style="color:var(--cyan)">${best ? f1(best.L.totale) : "–"}</b><span class="tip">${best ? "giornata " + best.g : ""}</span></div>
  </div>
  ${chart ? `<div class="panel pad" style="margin-bottom:16px">${chart}</div>` : ""}
  <div class="rows">${rows.map(({ g, L }) => `<a class="r hist" href="#giornata/${g}">
      <b class="hg">G${g}</b>
      <div style="flex:1;min-width:0"><div>${L.conclusa ? "✅ Conclusa" : "🔴 In corso"} · ${esc(L.S.modulo)} · ${L.S.ids.length} consigliati</div><div class="tip">${L.mvp ? `⭐ ${esc(L.mvp.nome)} ${f1(L.mvp.fv)}` : ""}${L.ideale ? ` · ideale ${f1(L.ideale.tot)} (${L.ideale.mod})` : ""}</div></div>
      <div class="hv"><small>stima</small>${f1(L.stima)}</div>
      <div class="hv"><small>punti</small><b style="color:${L.totale >= L.stima ? "var(--green)" : "var(--red)"}">${f1(L.totale)}</b></div></a>`).join("") || '<div class="panel pad empty">Ancora niente: prepara i consigliati della prossima giornata e, quando sarà iniziata, la trovi qui.</div>'}</div>`;
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
  setInterval(() => { if (location.hash.startsWith("#giornata") && !document.activeElement?.matches?.("input,select") && !$("#modal").classList.contains("show")) go(true); }, 60 * 1000);
}
