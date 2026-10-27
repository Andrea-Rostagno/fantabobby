# FantaBobby

Dashboard per il fantacalcio in stile FantaLab, con i dati pubblici di fantacalcio.it.

## Come si usa
**Online:** il sito è su GitHub Pages e si aggiorna da solo con GitHub Actions (`.github/workflows/aggiorna.yml`): un aggiornamento completo ogni ora, e ogni 10 minuti risultati e voti quando c'è una partita in corso. Con Supabase configurato (`config.js` + `supabase.sql`) consigliati, formazioni e storico si salvano nell'account e si vedono da qualsiasi dispositivo.

**In locale:** doppio clic su **aggiorna.bat** (scarica i dati e apre la dashboard) oppure su **Apri dashboard.bat**. Senza Supabase i dati restano nel browser.

Serve Python con `requests` e `beautifulsoup4` (`pip install requests beautifulsoup4`).

## Sezioni
| Sezione | Cosa c'è |
|---|---|
| Giornata | la ⭐ squadra top della giornata (titolari e riserve). Dal primo fischio d'inizio: fantavoti, bonus, sostituzioni automatiche (max 3), totale, proiezione e formazione ideale |
| Consigliati | la lista dei consigliati (👍) con titolari e panchina della squadra top, e 🎲 Le Scommesse: giocatori non da prima fascia che possono sorprendere, con la loro formazione. Tutto si blocca al primo fischio d'inizio |
| Storico | punteggio di ogni giornata della squadra top e de Le Scommesse, contro la stima pre-giornata, con grafico |
| Probabili | i due campi con le percentuali di titolarità, la colonna centrale con l'indice, panchina, ballottaggi, indisponibili, analisi e pronostico 1X2 |
| Schierabilità | classifica per ruolo: titolarità, avversario, ultime 3, fattore partita, fantamedia attesa, indice e stelle |
| Listone | tutti i giocatori con filtri per ruolo e squadra e colonne ordinabili; ☆ per aggiungerli alla rosa |
| Centro Dati | statistiche ricalcolate dai voti di ogni giornata: intervallo di giornate, casa/trasferta, presenze minime, squadre |
| Serie A | classifica, calendario, risultati, marcatori e migliori fantavoti di ogni partita |
| Squadre | formazione tipo sul campo, rendimento, gol per giornata, prossime avversarie e rosa completa |
| Indisponibili | infortunati, squalificati, in dubbio e diffidati per squadra |

## Come sono calcolati gli indici
- **Fantamedia attesa**: 65% fantamedia stagionale (con poche presenze viene avvicinata alla media del ruolo) e 35% media delle ultime 3 giocate. Poi viene corretta in base ai gol fatti e subiti dall'avversario rispetto alla media del campionato e al fattore campo.
- **Indice di schierabilità (0-100)**: percentile nel ruolo di titolarità × fantamedia attesa.
- **Pronostico**: modello di Poisson costruito sui gol fatti e subiti di media.
- **Fasce** (Top / SemiTop / Terza / Low cost): posizione per FVM all'interno del ruolo.

Facce dei giocatori e stemmi sono caricati da fantacalcio.it: servono la connessione e solo per uso personale.
