# Gestionale Basket — app per il telefono

App installabile su Android (PWA) per gestire atleti, squadre, pagamenti, allenamenti e partite della società.
Online va solo il programma; tutti i dati restano nel telefono (IndexedDB di Chrome) e non vengono mai inviati altrove.

## File

| File | A cosa serve |
| --- | --- |
| `index.html` | Pagina dell'app; blocca ogni connessione verso server esterni |
| `app.js` | Tutte le schermate e le operazioni |
| `db.js` | Database del telefono, PIN, backup cifrati |
| `app.css` | Grafica |
| `sw.js` | Funzionamento offline e aggiornamenti |
| `manifest.webmanifest`, `icon-*.png` | Nome e icona sulla schermata principale |

## 1. Pubblicare il programma su GitHub Pages (una volta sola)

1. Crea un account gratuito su github.com.
2. Crea un repository nuovo, ad esempio `gestionale`. Pubblico o privato vanno bene entrambi: dentro c'è solo il programma, nessun dato. Con un repository privato Pages richiede un piano a pagamento.
3. Nel repository, scegli **Add file → Upload files**, trascina tutti i file di questa cartella (non la cartella stessa) e premi **Commit changes**.
4. Vai su **Settings → Pages**. In "Branch" scegli `main` e la cartella `/ (root)`, poi **Save**.
5. Dopo uno o due minuti l'app è su `https://TUO-UTENTE.github.io/gestionale/`.

**Non cambiare più questo indirizzo.** I dati sul telefono sono legati all'indirizzo: se cambia, l'app riparte vuota e serve il backup.

## 2. Installare l'app sul telefono

1. Apri l'indirizzo con **Chrome** sul telefono Android.
2. Menu ⋮ → **Installa app** (o "Aggiungi a schermata Home" → Installa).
3. Apri l'app dall'icona, inserisci il nome della società, la stagione e un PIN da 4 a 6 cifre.
4. Per provarla: Impostazioni (ingranaggio) → **Carica dati di prova**. Sono dati inventati e si cancellano con "Elimina dati di prova". Funziona solo con l'archivio vuoto.

## 3. Uso quotidiano

- **Squadre:** crea le squadre e imposta la quota mensile di ognuna.
- **Atleti:** pulsante + in basso; per i minorenni inserisci i genitori, che si chiamano o si scrivono su WhatsApp con un tocco.
- **Pagamenti → Riepilogo mensile → Genera quote:** crea le quote del mese per tutti gli atleti attivi. Un secondo tocco non crea doppioni.
- **Pagamento:** l'importo salda prima le quote più vecchie; i pagamenti parziali sono gestiti da soli. Un pagamento sbagliato si annulla dalla scheda dell'atleta.
- **Insoluti:** quote scadute e non pagate, filtrabili per squadra, con promemoria WhatsApp già scritto per il genitore.
- **Calendario:** partite (prossime, giocate, annullate), vista settimanale con partite e allenamenti, vista mensile, orari fissi degli allenamenti. Dopo la partita: tocca la partita → Risultato.

## 4. Backup: almeno una volta a settimana

I dati esistono **solo** nel telefono. Se cancelli i dati di Chrome, cambi telefono o lo perdi, senza backup sono persi.

- Impostazioni → **Esporta backup** → scegli una password (almeno 8 caratteri) → "Salva nel telefono" (cartella Download) oppure "Condividi" (es. su Drive o sul PC).
- Il file è cifrato: senza la password non si legge. Se dimentichi la password, quel backup non è recuperabile.
- Per ripristinare (anche su un telefono nuovo): installa l'app, configura un PIN, poi Impostazioni → **Ripristina**. Prima di sostituire i dati l'app mostra cosa contiene il file.
- La Home ricorda il backup se l'ultimo ha più di 7 giorni.

**PIN dimenticato:** l'unica strada è Impostazioni di Android → App → Chrome → Spazio di archiviazione → Gestisci spazio, cancellare i dati del sito, reinstallare l'app e ripristinare l'ultimo backup.

## 5. Aggiornare l'app

1. Nel file `sw.js` cambia il numero in `VERSIONE` (es. da `gestionale-v1.0.0` a `gestionale-v1.0.1`).
2. Carica i file modificati nel repository GitHub, al posto dei vecchi.
3. Sul telefono, alla prossima apertura con Internet compare **"Nuova versione disponibile · Aggiorna"**. I dati non vengono toccati.

## 6. Controlli da fare sul telefono

- [ ] L'icona arancione compare nella schermata principale e l'app si apre a schermo intero, senza la barra di Chrome.
- [ ] Il primo avvio chiede nome, stagione e PIN; alla riapertura chiede il PIN.
- [ ] Dopo 5 minuti in secondo piano l'app si blocca di nuovo.
- [ ] Con la **modalità aereo** attiva l'app si apre e mostra i dati.
- [ ] Creo una squadra e un atleta, chiudo l'app dal multitasking, la riapro: i dati ci sono.
- [ ] Il tasto Indietro di Android chiude le schede aperte e torna alla pagina precedente.
- [ ] Chiama e WhatsApp di un genitore aprono il telefono e WhatsApp col numero giusto.
- [ ] Genero le quote del mese, registro un pagamento parziale e poi il saldo: la quota risulta pagata.
- [ ] Esporto un backup, lo trovo nella cartella Download, lo ripristino: i numeri coincidono.
- [ ] In Impostazioni la "Memoria persistente" risulta **attiva** (se non lo è, installare l'app dalla schermata principale di solito basta).
