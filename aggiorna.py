"""Scarica i dati pubblici di fantacalcio.it e li salva in data/data.js per la dashboard.

Uso: python aggiorna.py        (oppure doppio clic su aggiorna.bat)
Le giornate già giocate vengono messe in cache in data/cache/ e non si riscaricano.
"""
import json
import os
import re
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

import requests
from bs4 import BeautifulSoup

BASE = "https://www.fantacalcio.it"
ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
CACHE = DATA / "cache"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
PAUSA = 1.0
CAMPIONCINI = "https://content.fantacalcio.it/web/campioncini/21/small/"  # secondi tra una richiesta e l'altra, per non martellare il sito

session = requests.Session()
session.headers["User-Agent"] = UA


def get(path):
    time.sleep(PAUSA)
    r = session.get(BASE + path, timeout=30)
    r.raise_for_status()
    return BeautifulSoup(r.content, "html.parser")


def num(s, default=0.0):
    s = (s or "").strip().replace(",", ".").rstrip("*%").strip()
    try:
        return float(s)
    except ValueError:
        return default


def player_ref(a):
    """Da un link giocatore ricava (id, slug squadra, nome)."""
    m = re.search(r"/squadre/([^/]+)/[^/]+/(\d+)", a.get("href", ""))
    if not m:
        return None, None, a.get_text(strip=True)
    return int(m.group(2)), m.group(1), a.get_text(strip=True)


def team_slug(a):
    m = re.search(r"/squadre/([^/?#]+)", a.get("href", ""))
    return m.group(1) if m else a.get_text(strip=True).lower()


def cell(row, key):
    td = row.select_one(f'[data-col-key="{key}"]')
    return td.get_text(strip=True) if td else ""


# ---------------------------------------------------------------- statistiche
def statistiche():
    s = get("/statistiche-serie-a")
    players = {}
    for row in s.select("tr.player-row"):
        a = row.select_one("a.player-link")
        pid, slug, nome = player_ref(a)
        if pid is None:
            continue
        rig = cell(row, "rig").split("/")
        players[pid] = {
            "id": pid, "nome": nome, "sq": slug,
            "R": row.get("data-filter-role-classic", "").upper(),
            "Rm": row.get("data-filter-role-mantra", "").upper(),
            "pv": int(num(cell(row, "pg"))), "mv": num(cell(row, "mv")), "fm": num(cell(row, "mfv")),
            "gol": int(num(cell(row, "gol"))), "gs": int(num(cell(row, "gs"))),
            "rigSegnati": int(num(rig[0])), "rigTirati": int(num(rig[1])) if len(rig) > 1 else 0,
            "rp": int(num(cell(row, "rp"))), "ass": int(num(cell(row, "ass"))),
            "amm": int(num(cell(row, "amm"))), "esp": int(num(cell(row, "esp"))),
            "pctGiocate": int(num(row.get("data-filter-playeds"))),
        }
    return players


def quotazioni(players):
    s = get("/quotazioni-fantacalcio")
    for row in s.select("tr.player-row"):
        pid, slug, nome = player_ref(row.select_one("a.player-link"))
        if pid is None:
            continue
        p = players.setdefault(pid, {"id": pid, "nome": nome, "sq": slug, "pv": 0, "mv": 0, "fm": 0, "gol": 0, "gs": 0,
                                     "rigSegnati": 0, "rigTirati": 0, "rp": 0, "ass": 0, "amm": 0, "esp": 0, "pctGiocate": 0,
                                     "R": row.get("data-filter-role-classic", "").upper(),
                                     "Rm": row.get("data-filter-role-mantra", "").upper()})
        p["qi"] = int(num(cell(row, "c_qi")))
        p["qa"] = int(num(cell(row, "c_qa")))
        p["fvm"] = int(num(cell(row, "c_fvm")))


# ---------------------------------------------------------------- squadre
def classifica():
    s = get("/serie-a/classifica")
    teams = {}
    logos = {}
    for img in s.select("img[src*='/team/ico/']"):
        a = img.find_parent("a") or img.find_previous("a", class_="team-link")
        name = (img.get("title") or img.get("alt", "").replace("Stemma ", "")).strip().lower().replace(" ", "-")
        if name:
            logos.setdefault(name, img["src"])
    for tr in s.select("tr[data-team-id]"):
        a = tr.select_one("a.team-link")
        if not a:
            continue
        slug = team_slug(a)
        if slug in teams:  # la pagina ha anche altre tabelle (casa/trasferta)
            continue
        g = lambda c: int(num(tr.select_one(f"td.{c}").get_text(strip=True))) if tr.select_one(f"td.{c}") else 0
        teams[slug] = {
            "slug": slug, "nome": tr.get("data-name") or a.get_text(strip=True), "id": int(tr["data-team-id"]),
            "logo": logos.get(slug, ""),
            "pos": g("pos"), "pt": g("points"), "g": g("played"), "v": g("won"), "n": g("drawn"), "p": g("lost"),
            "gf": g("goalsscored"), "gs": g("goalsconceded"),
            "forma": [li.select_one(".value")["data-value"] for li in tr.select(".dot-stripe li") if li.select_one(".value")],
        }
    return teams


def giornata_calendario(n):
    s = get(f"/serie-a/calendario/{n}")
    out = []
    for pill in s.select(".match-pill"):
        home, away = pill.select_one(".team-home a.team-link"), pill.select_one(".team-away a.team-link")
        if not home or not away:
            continue
        mw = pill.select_one(".matchweek")
        if mw and int(num(mw.get_text())) != n:  # ogni pagina riporta anche la giornata in corso
            continue
        status = int(pill.get("data-match-status", "0") or 0)
        sh, sa = pill.select_one(".score-home"), pill.select_one(".score-away")
        day, hour = pill.select_one(".match-date .day"), pill.select_one(".match-date .hours")
        out.append({
            "g": n, "home": team_slug(home), "away": team_slug(away), "status": status,
            "gh": int(num(sh.get_text())) if sh else None, "ga": int(num(sa.get_text())) if sa else None,
            "data": f"{day.get_text(strip=True)} {hour.get_text(strip=True)}" if day and hour else "",
        })
    return out


# ---------------------------------------------------------------- voti
def voti_giornata(stagione, n):
    s = get(f"/voti-fantacalcio-serie-a/{stagione}/{n}")
    voti = {}
    for tr in s.select("tr"):
        a = tr.select_one(".player-item a.player-link")
        if not a:
            continue
        pid, slug, nome = player_ref(a)
        pill = tr.select_one(".pill")  # prima fonte (redazione Fantacalcio)
        if pid is None or not pill:
            continue
        v = pill.select_one(".player-grade")["data-value"]
        fv = pill.select_one(".player-fanta-grade")["data-value"]
        bonus = {b.get("title"): int(num(b.get("data-value"))) for b in tr.select(".player-bonus")}
        voti[pid] = {"v": num(v, None), "fv": num(fv, None), "sq": slug,
                     "gol": bonus.get("Gol segnati", 0), "ass": bonus.get("Assist", 0), "gs": bonus.get("Gol subiti", 0),
                     "rp": bonus.get("Rigori parati", 0), "au": bonus.get("Autoreti", 0), "rsb": bonus.get("Rigori sbagliati", 0)}
    return voti


# ---------------------------------------------------------------- probabili formazioni
def lista_giocatori(ul):
    out = []
    for li in ul.select("li.player-item") if ul else []:
        a = li.select_one("a.player-link")
        pid, _, nome = player_ref(a)
        role = li.select_one(".role")
        pv = li.select_one(".progress-value")
        out.append({"id": pid, "nome": nome, "R": (role.get("data-value", "") if role else "").upper(),
                    "tit": int(num(pv.get_text())) if pv else None, "stato": li.get("data-status", "")})
    return out


def note(section):
    """Infortunati / squalificati / diffidati / in dubbio: due colonne (casa, trasferta)."""
    res = []
    if not section:
        return res
    for i, content in enumerate(section.select(":scope > .content")):
        for li in content.select("li"):
            a = li.select_one("a.player-link")
            if not a:
                continue
            pid, _, nome = player_ref(a)
            d = li.select_one(".description")
            res.append({"id": pid, "nome": nome, "lato": "home" if i == 0 else "away",
                        "nota": d.get_text(" ", strip=True) if d else ""})
    return res


def probabili():
    s = get("/probabili-formazioni-serie-a")
    global CAMPIONCINI
    img = s.select_one("img.player-image[src*='/campioncini/']")
    if img:
        CAMPIONCINI = re.sub(r"\d+\.png.*$", "", img["src"])
    partite = []
    giornata = None
    for m in s.select("li.match-item"):
        pill = m.select_one(".match-pill")
        mw = pill.select_one(".matchweek") if pill else None
        if mw:
            giornata = int(num(mw.get_text()))
        home = m.select_one(".match-pill .team-home a.team-link")
        away = m.select_one(".match-pill .team-away a.team-link")
        cards = m.select(".team-card")
        info_d, info_s = m.select_one(".match-info .match-date"), m.select_one(".match-info .match-stadium")
        upd = m.select_one(".last-update")
        squads = []
        for c in cards[:2]:
            f = c.select_one(".team-formation")
            squads.append({"modulo": f.get_text(strip=True) if f else "",
                           "titolari": lista_giocatori(c.select_one("ul.starters")),
                           "panchina": lista_giocatori(c.select_one("ul:not(.starters)"))})
        ballots = []
        for b in m.select(".ballots .ballot"):
            ballots.append([{"id": player_ref(li.select_one("a.player-link"))[0],
                             "nome": li.select_one("a.player-link").get_text(strip=True),
                             "pct": int(num(li.select_one(".percentage").get_text()))}
                            for li in b.select("li") if li.select_one("a.player-link") and li.select_one(".percentage")])
        comment = m.select_one(".match-comment")
        partite.append({
            "g": giornata, "home": team_slug(home) if home else "", "away": team_slug(away) if away else "",
            "data": info_d.get_text(" ", strip=True) if info_d else "",
            "stadio": info_s.get_text(" ", strip=True) if info_s else "",
            "aggiornato": upd.get_text(" ", strip=True) if upd else "",
            "squadre": squads,
            "ballottaggi": ballots,
            "infortunati": note(m.select_one(".injureds")),
            "squalificati": note(m.select_one(".suspendeds")),
            "diffidati": note(m.select_one(".cautioneds")),
            "dubbi": note(m.select_one(".dubts")),
            "commento": comment.get_text(" ", strip=True)[:1500] if comment else "",
        })
    return giornata, partite


# ---------------------------------------------------------------- main
def adesso():
    """Ora italiana anche quando lo script gira su un server in UTC (GitHub Actions)."""
    try:
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo("Europe/Rome")).replace(tzinfo=None)
    except Exception:
        return datetime.now()


def aggiungi_inizio(partite, stagione):
    """Data e ora di inizio (anno ricavato dalla stagione: luglio-dicembre il primo, gennaio-giugno il secondo)."""
    anno1 = int(stagione[:4])
    for m in partite:
        dm = re.match(r"(\d{2})/(\d{2}) (\d{2}):(\d{2})", m.get("data", ""))
        if dm:
            g, mese, hh, mm = map(int, dm.groups())
            m["inizio"] = f"{anno1 if mese >= 7 else anno1 + 1}-{mese:02d}-{g:02d}T{hh:02d}:{mm:02d}"


def scarica_voti(stagione, n):
    try:
        v = voti_giornata(stagione, n)
    except requests.HTTPError:
        v = {}  # giornata appena iniziata: la pagina voti può non esistere ancora
    if v:
        (CACHE / f"voti_{stagione}_{n}.json").write_text(json.dumps(v), "utf8")
    return v


def applica_voti(players, n, v):
    """players: {id: giocatore}. Voti per giocatore: {giornata: [voto, fantavoto, gol, assist, gol subiti, rig. parati, autogol, rig. sbagliati]}"""
    sv = lambda val: None if val is None or val >= 50 else val  # fantacalcio.it scrive 55 per "senza voto"
    for pid, x in v.items():
        p = players.get(int(pid))
        if p is not None:
            p.setdefault("voti", {})[str(n)] = [sv(x["v"]), sv(x["fv"]), x.get("gol", 0), x.get("ass", 0), x.get("gs", 0),
                                                x.get("rp", 0), x.get("au", 0), x.get("rsb", 0)]


def scrivi(out):
    out["aggiornato"] = adesso().strftime("%d/%m/%Y %H:%M")
    out["aggiornatoIso"] = adesso().isoformat(timespec="minutes")
    DATA.mkdir(exist_ok=True)
    (DATA / "data.js").write_text("window.FANTA = " + json.dumps(out, ensure_ascii=False) + ";\n", "utf8")


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    step = lambda t: print(f"  - {t}", flush=True)

    step("probabili formazioni")
    g_next, prob = probabili()
    step("statistiche giocatori")
    players = statistiche()
    step("quotazioni")
    quotazioni(players)
    step("classifica")
    teams = classifica()

    # stagione dal titolo della pagina voti (es. "stagione 2026/27")
    t = get("/voti-fantacalcio-serie-a").title.get_text()
    stagione_m = re.search(r"(\d{4})/(\d{2})", t)
    stagione = f"{stagione_m.group(1)}-{stagione_m.group(2)}" if stagione_m else "2026-27"
    ultima = int(re.search(r"(\d+)\s*giornata", t).group(1)) if re.search(r"(\d+)\s*giornata", t) else (g_next or 1) - 1

    partite = []
    for n in range(1, min(max(ultima, g_next or 0) + 3, 38) + 1):  # +3 giornate future per il calendario
        f = CACHE / f"cal_{stagione}_{n}.json"
        if f.exists():
            cal = json.loads(f.read_text("utf8"))
        else:
            step(f"calendario giornata {n}")
            cal = giornata_calendario(n)
            if n <= ultima and cal and all(x["status"] != 0 for x in cal):
                f.write_text(json.dumps(cal), "utf8")
        partite += cal
    aggiungi_inizio(partite, stagione)

    # voti: tutte le giornate giocate più quella in corso (i voti escono partita per partita)
    in_corso = max([m["g"] for m in partite if m["status"] != 0] or [ultima])
    for n in range(1, max(ultima, in_corso) + 1):
        f = CACHE / f"voti_{stagione}_{n}.json"
        if f.exists() and n < ultima:  # l'ultima giornata e quella in corso si riscaricano sempre
            v = json.loads(f.read_text("utf8"))
        else:
            step(f"voti giornata {n}")
            v = scarica_voti(stagione, n)
        applica_voti(players, n, v)

    # i nomi completi delle squadre arrivano dalla classifica; per sicurezza aggiungo eventuali slug mancanti
    for p in players.values():
        teams.setdefault(p["sq"], {"slug": p["sq"], "nome": p["sq"].replace("-", " ").title()})

    scrivi({
        "stagione": stagione, "giornata": g_next, "ultimaGiocata": ultima, "inCorso": in_corso,
        "squadre": teams, "giocatori": list(players.values()), "partite": partite, "probabili": prob,
        "fonte": "fantacalcio.it", "campioncini": CAMPIONCINI,
    })
    print(f"\nFatto: {len(players)} giocatori, {len(teams)} squadre, {len(partite)} partite, "
          f"{len(prob)} probabili (giornata {g_next}), voti fino alla {ultima}a.")
    return True


def live():
    """Aggiornamento leggero durante le partite: risultati, voti della giornata e classifica (3 richieste).
    Se non c'è nessuna partita in corso o appena finita non scarica niente."""
    f = DATA / "data.js"
    if not f.exists():
        return main()
    CACHE.mkdir(parents=True, exist_ok=True)
    d = json.loads(f.read_text("utf8")[len("window.FANTA = "):].rstrip().rstrip(";"))
    now = adesso()
    # finestra: da 15 minuti prima del calcio d'inizio a 3 ore e mezza dopo (i voti escono dopo il fischio finale)
    attive = [m for m in d["partite"] if m.get("inizio")
              and datetime.fromisoformat(m["inizio"]) - timedelta(minutes=15) <= now <= datetime.fromisoformat(m["inizio"]) + timedelta(hours=3, minutes=30)]
    if not attive:
        print("Nessuna partita in corso: niente da aggiornare.")
        return False
    players = {p["id"]: p for p in d["giocatori"]}
    for g in sorted({m["g"] for m in attive}):
        print(f"  - live giornata {g}", flush=True)
        cal = giornata_calendario(g)
        aggiungi_inizio(cal, d["stagione"])
        d["partite"] = [m for m in d["partite"] if m["g"] != g] + cal
        applica_voti(players, g, scarica_voti(d["stagione"], g))
        d["inCorso"] = max(d.get("inCorso") or 0, g)
    d["partite"].sort(key=lambda m: (m["g"], m.get("inizio") or ""))
    nuove = classifica()
    for slug, t in nuove.items():
        d["squadre"][slug] = {**d["squadre"].get(slug, {}), **t}
    scrivi(d)
    print("Fatto: aggiornamento live.")
    return True


if __name__ == "__main__":
    try:
        fatto = live() if "--live" in sys.argv else main()
    except requests.RequestException as e:
        print("Errore di rete:", e)
        sys.exit(1)
    # su GitHub Actions dice al passo successivo se c'è qualcosa da pubblicare
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a") as fh:
            fh.write(f"pubblica={'true' if fatto else 'false'}\n")
