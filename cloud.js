"use strict";
// Accesso e salvataggio online con Supabase. Se config.js è vuoto, FantaBobby salva solo nel browser.
(function () {
  const cfg = window.FB_CONFIG || {};
  const online = !!(cfg.url && cfg.key && window.supabase);
  if (!online) { bootApp(); return; }

  const sb = window.supabase.createClient(cfg.url, cfg.key);
  let user = null, timer = null, ultimoSync = null;

  const raccogli = () => Object.fromEntries(SYNC_KEYS.map(k => [k, store.get(k, null)]));
  const applica = dati => SYNC_KEYS.forEach(k => { if (dati?.[k] != null) localStorage.setItem("fd-" + k, JSON.stringify(dati[k])); });

  async function salva() {
    timer = null;
    if (!user) return;
    const now = new Date().toISOString();
    const { error } = await sb.from("stato").upsert({ user_id: user.id, dati: raccogli(), aggiornato: now });
    if (error) { console.error(error); toast("Salvataggio online non riuscito: riprovo tra poco"); timer = setTimeout(salva, 15000); return; }
    ultimoSync = now;
  }
  // chiamata da store.set per rosa, giornate e valori manuali
  window.cloudSave = () => { clearTimeout(timer); timer = setTimeout(salva, 1200); };

  async function scarica() {
    const { data, error } = await sb.from("stato").select("dati, aggiornato").eq("user_id", user.id).maybeSingle();
    if (error) { console.error(error); return null; }
    return data;
  }

  // ospite: legge (senza login) i dati dell'account, non salva niente
  async function entraOspite() {
    window.FB_GUEST = true;
    localStorage.setItem("fd-ospite", "1");
    document.body.classList.add("guest");
    window.cloudSave = () => {};
    const { data, error } = await sb.from("stato").select("dati, aggiornato").order("aggiornato", { ascending: false }).limit(1).maybeSingle();
    if (error) console.error(error);
    if (data) { applica(data.dati); ultimoSync = data.aggiornato; }
    bootApp();
    aggiungiEsci();
    document.addEventListener("visibilitychange", async () => {
      if (document.visibilityState !== "visible") return;
      const r = await sb.from("stato").select("aggiornato").order("aggiornato", { ascending: false }).limit(1).maybeSingle();
      if (r.data && ultimoSync && r.data.aggiornato > ultimoSync) location.reload();
    });
  }
  window.fbGuest = () => { $("#login").remove(); entraOspite(); };

  async function dopoAccesso() {
    const remoto = await scarica();
    if (remoto) { applica(remoto.dati); ultimoSync = remoto.aggiornato; }
    else await salva();   // primo accesso: porta online quello che c'è già nel browser
    bootApp();
    aggiungiEsci();
    // tornando sulla scheda, se l'altro dispositivo ha salvato qualcosa di più nuovo lo carica
    document.addEventListener("visibilitychange", async () => {
      if (document.visibilityState !== "visible" || timer) return;
      const r = await scarica();
      if (r && ultimoSync && r.aggiornato > ultimoSync) { applica(r.dati); location.reload(); }
    });
  }

  function aggiungiEsci() {
    const foot = document.querySelector(".side .foot");
    if (!foot || foot.querySelector(".logout")) return;
    const chi = window.FB_GUEST ? "👀 Ospite · sola lettura" : esc(user.email);
    foot.insertAdjacentHTML("beforeend", `<div class="logout">${chi}<br><button onclick="fbLogout()">Esci</button></div>`);
  }
  window.fbLogout = async () => {
    localStorage.removeItem("fd-ospite");
    if (!window.FB_GUEST) await sb.auth.signOut();
    location.reload();
  };
  // la barra laterale viene ridisegnata a ogni pagina: rimetto il pulsante Esci
  window.addEventListener("hashchange", () => setTimeout(aggiungiEsci, 0));

  function mostraLogin(msg = "") {
    document.body.insertAdjacentHTML("beforeend", `<div class="login" id="login">
      <form class="panel pad" onsubmit="fbLogin(event)">
        <div class="logo" style="font-size:30px"><span>⚗️</span><span>Fanta<b>Bobby</b></span></div>
        <p class="tip" style="text-align:center;margin-top:0">Accedi per vedere consigliati, formazioni e storico</p>
        <input class="input" type="email" id="lemail" placeholder="Email" autocomplete="username" required>
        <input class="input" type="password" id="lpass" placeholder="Password" autocomplete="current-password" required>
        <button class="btn-pink" type="submit" style="justify-content:center">Entra</button>
        <button class="guest-btn" type="button" onclick="fbGuest()">👀 Entra come ospite <small>solo per guardare</small></button>
        <p class="tip" id="lmsg" style="text-align:center;color:var(--red);min-height:1em">${esc(msg)}</p>
      </form></div>`);
  }
  window.fbLogin = async e => {
    e.preventDefault();
    const { data, error } = await sb.auth.signInWithPassword({ email: $("#lemail").value.trim(), password: $("#lpass").value });
    if (error) { $("#lmsg").textContent = "Email o password non corrette"; return; }
    user = data.user; $("#login").remove(); dopoAccesso();
  };

  sb.auth.getSession().then(({ data }) => {
    user = data.session?.user || null;
    if (user) dopoAccesso();
    else if (localStorage.getItem("fd-ospite") === "1") entraOspite();
    else mostraLogin();
  });
})();
