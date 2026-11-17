/*
 * app.js — Gestionale interno della società di basket (PWA, dati solo sul telefono).
 *
 * Schermate: Home, Atleti, Squadre, Pagamenti, Calendario (partite e allenamenti), Impostazioni.
 * All'avvio i dati vengono letti da IndexedDB e tenuti in memoria (D): ogni modifica
 * è scritta subito sia in memoria sia nel database del telefono.
 * Gli indirizzi #/... fanno funzionare il tasto Indietro di Android; le schede di
 * inserimento si aprono dal basso e si chiudono anche con Indietro.
 */
import * as db from './db.js';

const VERSIONE_APP = '1.0.0';
const app = document.getElementById('app');
const fogli = document.getElementById('scheda');
const D = { squadre: [], atleti: [], quote: [], pagamenti: [], allenamenti: [], partite: [] };
let IMP = {};                       // impostazioni: nomeSocieta, stagione, pinHash, pinSale, ...
let persistente = null;             // memoria persistente concessa da Chrome

// ---------------------------------------------------------------- utilità
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const r2 = n => Math.round(n * 100) / 100;
const euro = n => Number(n || 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
const numero = v => r2(Number(String(v ?? '').replace(',', '.')));
const iso = d => d.toLocaleDateString('sv-SE');
const oggi = () => iso(new Date());
const adesso = () => new Date().toTimeString().slice(0, 5);
const piuGiorni = (g, n) => { const d = new Date(g + 'T12:00'); d.setDate(d.getDate() + n); return iso(d); };
const gSett = g => (new Date(g + 'T12:00').getDay() + 6) % 7;              // 0 = lunedì
const lunedi = g => piuGiorni(g, -gSett(g));
const piuMesi = (m, n) => { const d = new Date(+m.slice(0, 4), +m.slice(5, 7) - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const GIORNI = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
const GG = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];
const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
const dataIt = g => (g ? g.split('-').reverse().join('/') : '');
const dataBreve = g => `${GG[gSett(g)]} ${+g.slice(8)} ${MESI[+g.slice(5, 7) - 1].slice(0, 3).toLowerCase()}`;
const nomeMese = m => `${MESI[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}`;
const stagioneDi = g => { const a = +g.slice(0, 4), i = +g.slice(5, 7) >= 7 ? a : a - 1; return `${i}/${String((i + 1) % 100).padStart(2, '0')}`; };
const eta = nascita => { if (!nascita) return null; const o = oggi(); return o.slice(0, 4) - nascita.slice(0, 4) - (o.slice(5) < nascita.slice(5) ? 1 : 0); };
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const plur = (n, uno, molti) => `${n} ${n === 1 ? uno : molti}`;
const unici = valori => [...new Set(valori.filter(Boolean).map(v => v.trim()))].sort((a, b) => a.localeCompare(b, 'it'));
const squadra = id => D.squadre.find(s => s.id === id);
const atleta = id => D.atleti.find(a => a.id === id);
const nomeAtleta = a => `${a.cognome} ${a.nome}`;
const ordinaAtleti = (a, b) => nomeAtleta(a).localeCompare(nomeAtleta(b), 'it');
const squadreAttive = () => D.squadre.filter(s => !s.archiviata).sort((a, b) => a.nome.localeCompare(b.nome, 'it', { numeric: true }));
const quandoPartita = p => `${p.data} ${p.ora || '99:99'}`;
function telefonoWa(tel) {
  let n = String(tel || '').replace(/\D/g, '').replace(/^00/, '');
  if (n.length === 10 && n[0] === '3') n = '39' + n;
  return n;
}

const IC = {
  home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  atleti: '<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-7 7-7s7 3 7 7M16 4a4 4 0 0 1 0 8M22 21c0-3-1.5-5.5-4.5-6.5"/>',
  squadre: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3v18M5.6 5.6c3.5 3.5 3.5 9.3 0 12.8M18.4 5.6c-3.5 3.5-3.5 9.3 0 12.8"/>',
  pagamenti: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  calendario: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  indietro: '<path d="M15 18l-6-6 6-6"/>', avanti: '<path d="M9 18l6-6-6-6"/>',
  piu: '<path d="M12 5v14M5 12h14"/>', cerca: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
  tel: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12z"/>',
  canc: '<path d="M21 5H9l-7 7 7 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1zM18 9l-6 6M12 9l6 6"/>',
};
const icona = n => `<svg viewBox="0 0 24 24" aria-hidden="true">${IC[n]}</svg>`;

function toast(msg, errore) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'su' + (errore ? ' err' : '');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.className = ''), errore ? 4500 : 2600);
}

// ---------------------------------------------------------------- salvataggio
async function salva(archivio, oggetto) {
  const ora = new Date().toISOString();
  const x = { ...oggetto, id: oggetto.id || crypto.randomUUID(), creato: oggetto.creato || ora, modificato: ora };
  await db.scrivi({ [archivio]: [x] });
  const i = D[archivio].findIndex(y => y.id === x.id);
  if (i < 0) D[archivio].push(x); else D[archivio][i] = x;
  return x;
}
async function salvaMolti(archivio, righe) {
  const ora = new Date().toISOString();
  const nuove = righe.map(x => ({ ...x, id: x.id || crypto.randomUUID(), creato: x.creato || ora, modificato: ora }));
  await db.scrivi({ [archivio]: nuove });
  D[archivio].push(...nuove);
  return nuove;
}
async function elimina(cosa) {                       // { atleti: [id], quote: [id, id] }
  await db.scrivi({}, cosa);
  for (const [s, ids] of Object.entries(cosa)) D[s] = D[s].filter(x => !ids.includes(x.id));
}
async function imposta(valori) {
  Object.assign(IMP, valori);
  await db.scrivi({ impostazioni: Object.entries(valori).map(([chiave, valore]) => ({ chiave, valore })) });
}
async function carica() {
  const t = await db.leggiTutto();
  IMP = Object.fromEntries(t.impostazioni.map(x => [x.chiave, x.valore]));
  for (const s of Object.keys(D)) D[s] = t[s];
}

// ---------------------------------------------------------------- calcoli
// Ogni quota con pagato e residuo, calcolati dai pagamenti registrati
function quoteStato(filtro = () => true) {
  const pagato = new Map();
  for (const p of D.pagamenti) for (const x of p.parti) pagato.set(x.quotaId, r2((pagato.get(x.quotaId) || 0) + x.importo));
  return D.quote.filter(filtro).map(q => ({ ...q, pagato: pagato.get(q.id) || 0, residuo: r2(q.importo - (pagato.get(q.id) || 0)) }));
}
// Insoluti = quote già scadute e non saldate, raggruppate per atleta
function insoluti(squadraId) {
  const o = oggi(), per = new Map();
  for (const q of quoteStato(q => q.scadenza <= o)) {
    const a = atleta(q.atletaId);
    if (q.residuo <= 0 || !a || (squadraId && a.squadraId !== squadraId)) continue;
    const x = per.get(a.id) || { a, totale: 0, voci: [] };
    x.totale = r2(x.totale + q.residuo);
    x.voci.push(q.descrizione);
    per.set(a.id, x);
  }
  return [...per.values()].sort((x, y) => ordinaAtleti(x.a, y.a));
}
const dovuto = atletaId => quoteStato(q => q.atletaId === atletaId).reduce((t, q) => r2(t + q.residuo), 0);
const scaduto = (atletaId, o = oggi()) => quoteStato(q => q.atletaId === atletaId && q.scadenza <= o).reduce((t, q) => r2(t + q.residuo), 0);

// Ripartisce un pagamento sulle quote aperte, dalla più vecchia (o solo sulla quota scelta)
function ripartisci(atletaId, importo, quotaId) {
  const aperte = quoteStato(q => q.atletaId === atletaId && (!quotaId || q.id === quotaId)).filter(q => q.residuo > 0)
    .sort((a, b) => a.scadenza.localeCompare(b.scadenza));
  const totale = aperte.reduce((t, q) => r2(t + q.residuo), 0);
  if (!(importo > 0)) throw new Error("Inserisci un importo maggiore di zero");
  if (!totale) throw new Error('Nessuna quota da pagare: aggiungi prima la quota');
  if (importo > totale) throw new Error(`L'importo supera il dovuto (${euro(totale)})`);
  let resto = importo;
  return aperte.map(q => { const parte = r2(Math.min(resto, q.residuo)); resto = r2(resto - parte); return { quotaId: q.id, importo: parte }; }).filter(x => x.importo > 0);
}

// Allenamenti (orario settimanale) trasformati in sedute con data, tra due giorni inclusi
function sedute(da, a, squadraId) {
  const out = [];
  for (let g = da; g <= a; g = piuGiorni(g, 1)) {
    for (const al of D.allenamenti) {
      const s = squadra(al.squadraId);
      if (al.giorno === gSett(g) && s && !s.archiviata && (!squadraId || al.squadraId === squadraId)) out.push({ ...al, data: g });
    }
  }
  return out.sort((x, y) => `${x.data} ${x.inizio}`.localeCompare(`${y.data} ${y.inizio}`));
}
const prossimeSedute = n => { const o = oggi(), t = adesso(); return sedute(o, piuGiorni(o, 7)).filter(s => s.data > o || s.fine > t).slice(0, n); };
const prossimePartite = (squadraId, finoA) => D.partite
  .filter(p => p.stato === 'programmata' && p.data >= oggi() && (!finoA || p.data <= finoA) && (!squadraId || p.squadraId === squadraId))
  .sort((a, b) => quandoPartita(a).localeCompare(quandoPartita(b)));
const esito = p => (p.puntiNostri > p.puntiAvversari ? 'V' : p.puntiNostri < p.puntiAvversari ? 'P' : 'N');

// ---------------------------------------------------------------- pezzi di interfaccia
const NAV = [['home', 'Home'], ['atleti', 'Atleti'], ['squadre', 'Squadre'], ['pagamenti', 'Pagamenti'], ['calendario', 'Calendario']];
const GRUPPO = { atleta: 'atleti', squadra: 'squadre', impostazioni: 'home' };

function pagina(rotta, { titolo, sotto, indietro, azioni = '', fab, corpo }) {
  return `<header class="barra${indietro ? ' con-indietro' : ''}">
      ${indietro ? `<button class="icona-btn" data-act="indietro" data-a="${indietro}" aria-label="Indietro">${icona('indietro')}</button>` : ''}
      <div class="titolo"><h1>${esc(titolo)}</h1>${sotto ? `<div class="sotto">${sotto}</div>` : ''}</div>${azioni}
      ${indietro ? '' : `<a class="icona-btn" href="#/impostazioni" aria-label="Impostazioni">${icona('gear')}</a>`}
    </header>
    <main class="contenuto">${corpo}</main>
    ${fab ? `<button class="fab" data-act="${fab.act}" ${fab.dati || ''}>${icona('piu')}${esc(fab.testo)}</button>` : ''}
    <nav class="tab">${NAV.map(([k, t]) => `<a href="#/${k}" class="${k === (GRUPPO[rotta] || rotta) ? 'on' : ''}">${icona(k)}<span>${t}</span></a>`).join('')}</nav>`;
}
const vuoto = testo => `<div class="vuoto">${testo}</div>`;
const chip = (testo, on, act, dati) => `<button class="chip${on ? ' on' : ''}" data-act="${act}" ${dati}>${esc(testo)}</button>`;
const chipsSquadre = (oggetto, scelta) => `<div class="chips">${chip('Tutte', !scelta, 'filtro', `data-o="${oggetto}" data-k="sq" data-v=""`)}${squadreAttive()
  .map(s => chip(s.nome, scelta === s.id, 'filtro', `data-o="${oggetto}" data-k="sq" data-v="${s.id}"`)).join('')}</div>`;
const seg = (oggetto, chiave, scelta, voci) => `<div class="seg">${voci.map(([v, t]) => `<button class="${v === scelta ? 'on' : ''}" data-act="filtro" data-o="${oggetto}" data-k="${chiave}" data-v="${v}">${t}</button>`).join('')}</div>`;
const iniziali = a => esc((a.cognome[0] || '') + (a.nome[0] || '')).toUpperCase();

function certificato(a) {
  if (!a.scadenzaCertificato) return { tag: '', testo: 'non inserito' };
  const giorni = Math.round((new Date(a.scadenzaCertificato) - new Date(oggi())) / 864e5);
  if (giorni < 0) return { tag: '<span class="tag rosso">cert. scaduto</span>', testo: `<span class="rosso">${dataIt(a.scadenzaCertificato)} · scaduto</span>` };
  if (giorni <= 30) return { tag: `<span class="tag giallo">cert. ${dataIt(a.scadenzaCertificato).slice(0, 5)}</span>`, testo: `<span class="giallo">${dataIt(a.scadenzaCertificato)} · tra ${plur(giorni, 'giorno', 'giorni')}</span>` };
  return { tag: '', testo: dataIt(a.scadenzaCertificato) };
}
function rigaAtleta(a) {
  const s = squadra(a.squadraId), sc = scaduto(a.id);
  const destra = sc > 0 ? `<span class="tag rosso">${euro(sc)}</span>` : certificato(a).tag;
  return `<a class="riga" href="#/atleta/${a.id}"><div class="avatar">${iniziali(a)}</div><div class="testo"><strong>${esc(nomeAtleta(a))}</strong>
    <span>${esc(s?.nome || 'Senza squadra')}${a.maglia ? ` · n. ${esc(a.maglia)}` : ''}${a.attivo ? '' : ' · archiviato'}</span></div><div class="destra">${destra}</div></a>`;
}
function rigaPartita(p) {
  const s = squadra(p.squadraId);
  const ris = p.puntiNostri != null && p.puntiAvversari != null
    ? `<span class="ris ${esito(p) === 'V' ? 'verde' : esito(p) === 'P' ? 'rosso' : ''}">${p.puntiNostri}–${p.puntiAvversari}</span>` : '';
  const stato = p.stato === 'rinviata' ? '<span class="tag giallo">rinviata</span>' : p.stato === 'annullata' ? '<span class="tag">annullata</span>'
    : p.stato === 'disputata' && !ris ? '<span class="tag">da inserire</span>' : '';
  return `<button class="riga" data-act="partita" data-id="${p.id}"><div class="data-box${p.casa ? ' casa' : ''}"><b>${+p.data.slice(8)}</b><span>${MESI[+p.data.slice(5, 7) - 1].slice(0, 3)}</span></div>
    <div class="testo"><strong>${esc(s?.nome || '?')} – ${esc(p.avversario)}</strong><span>${GG[gSett(p.data)]}${p.ora ? ' ' + esc(p.ora) : ''} · ${p.casa ? 'Casa' : 'Trasferta'}${p.luogo ? ' · ' + esc(p.luogo) : ''}</span></div>
    <div class="destra">${ris || stato}</div></button>`;
}
function rigaSeduta(x, conData) {
  const s = squadra(x.squadraId);
  return `<button class="riga" data-act="allenamento" data-id="${x.id}"><div class="data-box"><b>${conData ? +x.data.slice(8) : esc(GG[x.giorno])}</b><span>${conData ? MESI[+x.data.slice(5, 7) - 1].slice(0, 3) : 'all.'}</span></div>
    <div class="testo"><strong>${esc(s?.nome || '?')} · ${conData ? GG[gSett(x.data)] + ' ' : ''}${esc(x.inizio)}–${esc(x.fine)}</strong><span>Allenamento${x.campo ? ' · ' + esc(x.campo) : ''}${x.allenatore || s?.allenatore ? ' · ' + esc(x.allenatore || s.allenatore) : ''}</span></div></button>`;
}
const chiama = (tel, testo = 'Chiama') => (tel ? `<a class="btn-piccolo" href="tel:${esc(String(tel).replace(/[^\d+]/g, ''))}">${icona('tel')}${testo}</a>` : '');
const whatsapp = (tel, msg = '') => (telefonoWa(tel) ? `<a class="btn-piccolo" href="https://wa.me/${telefonoWa(tel)}${msg ? '?text=' + encodeURIComponent(msg) : ''}" target="_blank" rel="noopener noreferrer">${icona('chat')}WhatsApp</a>` : '');

// ---------------------------------------------------------------- stato dei filtri
const F = {
  atleti: { testo: '', sq: '', archiviati: false },
  squadre: { archiviate: false },
  pag: { vista: 'insoluti', sq: '', mese: oggi().slice(0, 7) },
  cal: { vista: 'prossime', sq: '', periodo: '30', tipo: 'tutto', lun: lunedi(oggi()), mese: oggi().slice(0, 7), giorno: oggi() },
};
let cercaDaHome = false;

// ---------------------------------------------------------------- pagine
const PAGINE = {
  home() {
    const o = oggi(), m = o.slice(0, 7);
    const attivi = D.atleti.filter(a => a.attivo);
    const ins = insoluti(), totIns = ins.reduce((t, x) => r2(t + x.totale), 0);
    const incassato = D.pagamenti.filter(p => p.data.startsWith(m)).reduce((t, p) => r2(t + p.importo), 0);
    const cert = attivi.filter(a => a.scadenzaCertificato && a.scadenzaCertificato <= piuGiorni(o, 30)).sort((a, b) => a.scadenzaCertificato.localeCompare(b.scadenzaCertificato));
    const partite = prossimePartite().slice(0, 3), all = prossimeSedute(3);
    const giorniBackup = IMP.ultimoBackup ? Math.floor((Date.now() - new Date(IMP.ultimoBackup)) / 864e5) : null;
    const avviso = attivi.length && (giorniBackup === null || giorniBackup > 7)
      ? `<a class="avviso" href="#/impostazioni"><span>${giorniBackup === null ? 'Nessun backup ancora fatto' : `Ultimo backup ${plur(giorniBackup, 'giorno', 'giorni')} fa`}</span><b>Esporta</b></a>` : '';
    const inizio = !D.squadre.length ? `<div class="card"><h3>Benvenuto</h3><p class="muto">Inizia creando la prima squadra, poi aggiungi gli atleti. Per provare l'app puoi caricare dati di esempio inventati.</p>
      <div class="azioni"><button class="btn prim" data-act="squadraForm">Crea squadra</button><button class="btn" data-act="caricaDemo">Dati di prova</button></div></div>` : '';
    return pagina('home', {
      titolo: IMP.nomeSocieta || 'Gestionale', sotto: `Stagione ${esc(IMP.stagione || stagioneDi(o))}`,
      corpo: `${avviso}${inizio}
        <div class="griglia">
          <a class="tile" href="#/atleti"><span>Atleti attivi</span><b>${attivi.length}</b><small>${plur(squadreAttive().length, 'squadra', 'squadre')}</small></a>
          <a class="tile${totIns > 0 ? ' allarme' : ''}" href="#/pagamenti"><span>Insoluti</span><b>${euro(totIns)}</b><small>${plur(ins.length, 'atleta', 'atleti')}</small></a>
          <a class="tile" data-act="filtro" data-o="pag" data-k="vista" data-v="mese" data-vai="#/pagamenti" href="#/pagamenti"><span>Incassato a ${MESI[+m.slice(5) - 1].toLowerCase()}</span><b>${euro(incassato)}</b><small>pagamenti del mese</small></a>
          <a class="tile${cert.length ? ' allarme' : ''}" href="#/atleti"><span>Certificati</span><b>${cert.length}</b><small>scaduti o entro 30 giorni</small></a>
        </div>
        <div class="azioni"><button class="btn prim" data-act="pagamentoForm">${icona('piu')}Pagamento</button><button class="btn" data-act="cercaAtleta">${icona('cerca')}Cerca atleta</button></div>
        <h2>Prossime partite</h2>${partite.length ? `<div class="lista">${partite.map(rigaPartita).join('')}</div>` : vuoto('Nessuna partita in programma.')}
        <h2>Prossimi allenamenti</h2>${all.length ? `<div class="lista">${all.map(x => rigaSeduta(x, true)).join('')}</div>` : vuoto('Nessun allenamento nei prossimi 7 giorni.')}
        ${cert.length ? `<h2>Certificati da rinnovare</h2><div class="lista">${cert.slice(0, 6).map(rigaAtleta).join('')}</div>` : ''}`,
    });
  },

  atleti() {
    const f = F.atleti;
    return pagina('atleti', {
      titolo: 'Atleti', sotto: plur(D.atleti.filter(a => a.attivo).length, 'attivo', 'attivi'),
      fab: { act: 'atletaForm', testo: 'Atleta', dati: f.sq ? `data-sq="${f.sq}"` : '' },
      corpo: `<div class="cerca">${icona('cerca')}<input type="search" id="cerca-atleti" placeholder="Cerca per nome o cognome" value="${esc(f.testo)}" autocomplete="off" enterkeyhint="search"></div>
        ${chipsSquadre('atleti', f.sq)}
        <div id="elenco-atleti">${elencoAtleti()}</div>
        <p class="piccolo"><button class="testo-btn" data-act="filtro" data-o="atleti" data-k="archiviati" data-v="${!f.archiviati}">${f.archiviati ? 'Nascondi archiviati' : 'Mostra anche archiviati'}</button></p>`,
    });
  },

  atleta(id) {
    const a = atleta(id);
    if (!a) return PAGINE.atleti();
    const s = squadra(a.squadraId), anni = eta(a.dataNascita), minore = anni !== null && anni < 18;
    const quote = quoteStato(q => q.atletaId === id).sort((x, y) => y.scadenza.localeCompare(x.scadenza));
    const pag = D.pagamenti.filter(p => p.atletaId === id).sort((x, y) => (y.data + y.creato).localeCompare(x.data + x.creato));
    const sc = scaduto(id), tot = dovuto(id);
    const genitori = (a.genitori || []).map(g => `<div class="riga a-capo"><div class="testo"><strong>${esc(g.nome || 'Genitore')}${g.relazione ? ` · ${esc(g.relazione)}` : ''}</strong><span>${esc(g.telefono || 'nessun telefono')}</span></div>
      <div class="fila">${chiama(g.telefono)}${whatsapp(g.telefono)}</div></div>`).join('');
    const statoQ = q => (q.residuo <= 0 ? '<span class="tag verde">pagata</span>' : q.scadenza <= oggi() ? `<span class="tag rosso">${q.pagato > 0 ? 'parziale · ' : ''}scaduta</span>` : `<span class="tag">${q.pagato > 0 ? 'parziale' : 'da pagare'}</span>`);
    return pagina('atleta', {
      titolo: nomeAtleta(a), indietro: '#/atleti',
      sotto: `${esc(s?.nome || 'Senza squadra')}${a.maglia ? ` · n. ${esc(a.maglia)}` : ''}${anni !== null ? ` · ${anni} anni` : ''}`,
      azioni: `<button class="testo-btn" data-act="atletaForm" data-id="${a.id}">Modifica</button>`,
      corpo: `<div class="fila">${minore ? '<span class="tag giallo">Minorenne</span>' : ''}${a.attivo ? '' : '<span class="tag">Archiviato</span>'}${sc > 0 ? `<span class="tag rosso">Insoluto ${euro(sc)}</span>` : ''}</div>
        ${(a.genitori || []).length || minore ? `<h2>${minore ? 'Genitori' : 'Contatti familiari'}</h2>${genitori ? `<div class="lista">${genitori}</div>` : vuoto('Nessun contatto dei genitori: aggiungilo da Modifica.')}` : ''}
        ${a.telefono ? `<h2>Atleta</h2><div class="lista"><div class="riga a-capo"><div class="testo"><strong>${esc(a.telefono)}</strong><span>telefono dell'atleta</span></div><div class="fila">${chiama(a.telefono)}${whatsapp(a.telefono)}</div></div></div>` : ''}
        <h2>Dati</h2><div class="card"><dl class="dati">
          <dt>Nato il</dt><dd>${dataIt(a.dataNascita) || '—'}</dd>
          <dt>Certificato medico</dt><dd>${certificato(a).testo}</dd>
          <dt>Squadra</dt><dd>${s ? `<a href="#/squadra/${s.id}">${esc(s.nome)}</a>` : '—'}</dd>
          ${a.email ? `<dt>Email</dt><dd>${esc(a.email)}</dd>` : ''}${a.codiceFiscale ? `<dt>Codice fiscale</dt><dd>${esc(a.codiceFiscale)}</dd>` : ''}
          ${a.note ? `<dt>Note</dt><dd>${esc(a.note)}</dd>` : ''}</dl></div>
        <h2>Pagamenti</h2>
        <div class="griglia"><div class="tile${sc > 0 ? ' allarme' : ''}"><span>Scaduto</span><b>${euro(sc)}</b></div><div class="tile"><span>Totale da pagare</span><b>${euro(tot)}</b><small>con le quote non scadute</small></div></div>
        <div class="azioni"><button class="btn prim" data-act="pagamentoForm" data-atleta="${a.id}">Incassa</button><button class="btn" data-act="quotaForm" data-atleta="${a.id}">Aggiungi quota</button></div>
        ${quote.length ? `<div class="lista">${quote.map(q => `<div class="riga"><div class="testo"><strong>${esc(q.descrizione)}</strong><span>scade il ${dataIt(q.scadenza)} · ${euro(q.importo)}${q.pagato > 0 && q.residuo > 0 ? ` · resta ${euro(q.residuo)}` : ''}</span></div>
          <div class="destra">${statoQ(q)}${q.pagato > 0 ? '' : `<br><button class="testo-btn peric piccolo" data-act="eliminaQuota" data-id="${q.id}">Elimina</button>`}</div></div>`).join('')}</div>` : vuoto('Nessuna quota. Le quote mensili si generano dalla pagina Pagamenti.')}
        <h2>Storico pagamenti</h2>
        ${pag.length ? `<div class="lista">${pag.map(p => `<div class="riga"><div class="testo"><strong>${euro(p.importo)} · ${esc(p.metodo)}</strong><span>${dataIt(p.data)}${p.nota ? ' · ' + esc(p.nota) : ''}</span></div>
          <button class="testo-btn piccolo" data-act="annullaPagamento" data-id="${p.id}">Annulla</button></div>`).join('')}</div>` : vuoto('Nessun pagamento registrato.')}`,
    });
  },

  squadre() {
    const lista = D.squadre.filter(s => F.squadre.archiviate || !s.archiviata).sort((a, b) => a.nome.localeCompare(b.nome, 'it', { numeric: true }));
    return pagina('squadre', {
      titolo: 'Squadre', sotto: plur(squadreAttive().length, 'squadra attiva', 'squadre attive'), fab: { act: 'squadraForm', testo: 'Squadra' },
      corpo: `${lista.length ? `<div class="lista">${lista.map(s => {
        const n = D.atleti.filter(a => a.attivo && a.squadraId === s.id).length;
        return `<a class="riga" href="#/squadra/${s.id}"><div class="avatar">${icona('squadre')}</div><div class="testo"><strong>${esc(s.nome)}</strong>
          <span>${esc([s.categoria, s.stagione, s.allenatore].filter(Boolean).join(' · '))}${s.archiviata ? ' · archiviata' : ''}</span></div><div class="destra"><b>${n}</b><br><span class="muto piccolo">atleti</span></div></a>`;
      }).join('')}</div>` : vuoto('Nessuna squadra. Creane una con il pulsante in basso.')}
        <p class="piccolo"><button class="testo-btn" data-act="filtro" data-o="squadre" data-k="archiviate" data-v="${!F.squadre.archiviate}">${F.squadre.archiviate ? 'Nascondi archiviate' : 'Mostra anche archiviate'}</button></p>`,
    });
  },

  squadra(id) {
    const s = squadra(id);
    if (!s) return PAGINE.squadre();
    const rosa = D.atleti.filter(a => a.attivo && a.squadraId === id).sort((a, b) => (+a.maglia || 999) - (+b.maglia || 999) || ordinaAtleti(a, b));
    const orari = D.allenamenti.filter(x => x.squadraId === id).sort((a, b) => a.giorno - b.giorno || a.inizio.localeCompare(b.inizio));
    const prossime = prossimePartite(id).slice(0, 3);
    const giocate = D.partite.filter(p => p.squadraId === id && p.stato === 'disputata' && p.puntiNostri != null).sort((a, b) => quandoPartita(b).localeCompare(quandoPartita(a)));
    const v = giocate.filter(p => esito(p) === 'V').length, pe = giocate.filter(p => esito(p) === 'P').length;
    return pagina('squadra', {
      titolo: s.nome, indietro: '#/squadre', sotto: esc([s.categoria, s.stagione && `stagione ${s.stagione}`].filter(Boolean).join(' · ')),
      azioni: `<button class="testo-btn" data-act="squadraForm" data-id="${s.id}">Modifica</button>`,
      corpo: `${s.archiviata ? '<p><span class="tag">Archiviata</span></p>' : ''}
        <div class="card"><span class="muto piccolo">Allenatore</span><h3>${esc(s.allenatore || 'non indicato')}</h3>
          ${s.telefonoAllenatore ? `<div class="fila">${chiama(s.telefonoAllenatore)}${whatsapp(s.telefonoAllenatore)}</div>` : ''}
          <p class="muto piccolo">Quota mensile: ${s.quotaMensile > 0 ? euro(s.quotaMensile) : 'non impostata'}</p></div>
        <h2>Allenamenti</h2>${orari.length ? `<div class="lista">${orari.map(x => rigaSeduta(x, false)).join('')}</div>` : vuoto('Nessun orario di allenamento.')}
        <div class="azioni"><button class="btn" data-act="allenamento" data-sq="${s.id}">Aggiungi allenamento</button><button class="btn" data-act="partitaForm" data-sq="${s.id}">Aggiungi partita</button></div>
        <h2>Prossime partite</h2>${prossime.length ? `<div class="lista">${prossime.map(rigaPartita).join('')}</div>` : vuoto('Nessuna partita in programma.')}
        <h2>Partite giocate${giocate.length ? ` · ${v} V, ${pe} P` : ''}</h2>${giocate.length ? `<div class="lista">${giocate.map(rigaPartita).join('')}</div>` : vuoto('Nessuna partita disputata.')}
        <h2>Rosa · ${plur(rosa.length, 'atleta', 'atleti')}</h2>${rosa.length ? `<div class="lista">${rosa.map(rigaAtleta).join('')}</div>` : vuoto('Nessun atleta in questa squadra.')}
        <div class="azioni una"><button class="btn prim" data-act="atletaForm" data-sq="${s.id}">Aggiungi atleta alla squadra</button></div>`,
    });
  },

  pagamenti() {
    const f = F.pag;
    let corpo;
    if (f.vista === 'insoluti') {
      const ins = insoluti(f.sq), tot = ins.reduce((t, x) => r2(t + x.totale), 0);
      corpo = `${chipsSquadre('pag', f.sq)}
        <div class="griglia"><div class="tile${tot > 0 ? ' allarme' : ''}"><span>Totale insoluti</span><b>${euro(tot)}</b></div><div class="tile"><span>Atleti</span><b>${ins.length}</b></div></div>
        ${ins.length ? `<div class="lista">${ins.map(({ a, totale, voci }) => {
          const g = (a.genitori || [])[0], tel = g?.telefono || a.telefono;
          const msg = `Buongiorno${g?.nome ? ' ' + g.nome : ''}, vi ricordiamo che per ${a.nome} ${a.cognome} risultano da saldare: ${voci.join(', ')} (totale ${euro(totale)}). Grazie, ${IMP.nomeSocieta || ''}`;
          return `<div class="riga a-capo"><a class="testo" href="#/atleta/${a.id}"><strong>${esc(nomeAtleta(a))}</strong><span>${esc(voci.join(', '))}</span></a><b class="rosso num">${euro(totale)}</b>
            <div class="fila"><button class="btn-piccolo" data-act="pagamentoForm" data-atleta="${a.id}" data-importo="${totale}">Incassa</button>${whatsapp(tel, msg)}</div></div>`;
        }).join('')}</div>` : vuoto('Nessun insoluto: tutti in regola.')}`;
    } else {
      const m = f.mese, qs = quoteStato(q => (q.mese || q.scadenza.slice(0, 7)) === m);
      const atteso = qs.reduce((t, q) => r2(t + q.importo), 0), resta = qs.reduce((t, q) => r2(t + Math.max(q.residuo, 0)), 0);
      const pag = D.pagamenti.filter(p => p.data.startsWith(m)).sort((a, b) => (b.data + b.creato).localeCompare(a.data + a.creato));
      const incassato = pag.reduce((t, p) => r2(t + p.importo), 0);
      const metodi = unici(pag.map(p => p.metodo)).map(x => `${x} ${euro(pag.filter(p => p.metodo === x).reduce((t, p) => r2(t + p.importo), 0))}`).join(' · ');
      corpo = `<div class="passo"><button class="icona-btn" data-act="sposta" data-o="pag" data-k="mese" data-n="-1" aria-label="Mese precedente">${icona('indietro')}</button><b>${nomeMese(m)}</b>
          <button class="icona-btn" data-act="sposta" data-o="pag" data-k="mese" data-n="1" aria-label="Mese successivo">${icona('avanti')}</button></div>
        <div class="griglia"><div class="tile"><span>Incassato</span><b>${euro(incassato)}</b><small>${plur(pag.length, 'pagamento', 'pagamenti')}</small></div>
          <div class="tile${resta > 0 ? ' allarme' : ''}"><span>Quote del mese da incassare</span><b>${euro(resta)}</b><small>su ${euro(atteso)} · ${plur(qs.length, 'quota', 'quote')}</small></div></div>
        ${metodi ? `<p class="muto piccolo">${esc(metodi)}</p>` : ''}
        <div class="azioni"><button class="btn" data-act="generaQuote" data-mese="${m}">Genera quote di ${MESI[+m.slice(5) - 1].toLowerCase()}</button><button class="btn" data-act="quotaForm">Quota extra</button></div>
        <h2>Pagamenti del mese</h2>${pag.length ? `<div class="lista">${pag.map(p => { const a = atleta(p.atletaId); return `<a class="riga" href="#/atleta/${p.atletaId}"><div class="testo"><strong>${esc(a ? nomeAtleta(a) : '?')}</strong>
          <span>${dataIt(p.data)} · ${esc(p.metodo)}${p.nota ? ' · ' + esc(p.nota) : ''}</span></div><div class="destra"><b>${euro(p.importo)}</b></div></a>`; }).join('')}</div>` : vuoto('Nessun pagamento in questo mese.')}`;
    }
    return pagina('pagamenti', {
      titolo: 'Pagamenti', fab: { act: 'pagamentoForm', testo: 'Pagamento' },
      corpo: seg('pag', 'vista', f.vista, [['insoluti', 'Insoluti'], ['mese', 'Riepilogo mensile']]) + corpo,
    });
  },

  calendario() {
    const f = F.cal, o = oggi();
    let corpo = '';
    if (f.vista === 'prossime') {
      const periodi = [['7', '7 giorni'], ['30', '30 giorni'], ['tutte', 'Tutte'], ['giocate', 'Giocate'], ['annullate', 'Annullate']];
      let lista;
      if (f.periodo === 'giocate') lista = D.partite.filter(p => p.stato === 'disputata' && (!f.sq || p.squadraId === f.sq)).sort((a, b) => quandoPartita(b).localeCompare(quandoPartita(a)));
      else if (f.periodo === 'annullate') lista = D.partite.filter(p => p.stato === 'annullata' && (!f.sq || p.squadraId === f.sq)).sort((a, b) => quandoPartita(b).localeCompare(quandoPartita(a)));
      else lista = prossimePartite(f.sq, f.periodo === 'tutte' ? null : piuGiorni(o, +f.periodo));
      const rinviate = ['giocate', 'annullate'].includes(f.periodo) ? [] : D.partite.filter(p => p.stato === 'rinviata' && (!f.sq || p.squadraId === f.sq));
      const daChiudere = ['giocate', 'annullate'].includes(f.periodo) ? [] : D.partite.filter(p => p.stato === 'programmata' && p.data < o && (!f.sq || p.squadraId === f.sq));
      corpo = `<div class="chips">${periodi.map(([v, t]) => chip(t, f.periodo === v, 'filtro', `data-o="cal" data-k="periodo" data-v="${v}"`)).join('')}</div>
        ${daChiudere.length ? `<h2>Da aggiornare: inserisci il risultato</h2><div class="lista">${daChiudere.map(rigaPartita).join('')}</div>` : ''}
        ${rinviate.length ? `<h2>Rinviate</h2><div class="lista">${rinviate.map(rigaPartita).join('')}</div>` : ''}
        ${lista.length ? `<div class="lista">${lista.map(rigaPartita).join('')}</div>` : vuoto('Nessuna partita in questo periodo.')}`;
    } else if (f.vista === 'settimana') {
      const tipi = [['tutto', 'Tutto'], ['partite', 'Partite'], ['allenamenti', 'Allenamenti']];
      corpo = `<div class="chips">${tipi.map(([v, t]) => chip(t, f.tipo === v, 'filtro', `data-o="cal" data-k="tipo" data-v="${v}"`)).join('')}</div>
        <div class="passo"><button class="icona-btn" data-act="sposta" data-o="cal" data-k="lun" data-n="-7" aria-label="Settimana precedente">${icona('indietro')}</button>
          <b>${dataBreve(f.lun)} – ${dataBreve(piuGiorni(f.lun, 6))}</b><button class="icona-btn" data-act="sposta" data-o="cal" data-k="lun" data-n="7" aria-label="Settimana successiva">${icona('avanti')}</button></div>
        ${[0, 1, 2, 3, 4, 5, 6].map(i => {
          const g = piuGiorni(f.lun, i);
          const pp = f.tipo === 'allenamenti' ? [] : D.partite.filter(p => p.data === g && (!f.sq || p.squadraId === f.sq)).sort((a, b) => quandoPartita(a).localeCompare(quandoPartita(b)));
          const ss = f.tipo === 'partite' ? [] : sedute(g, g, f.sq);
          return `<div class="giorno-tit${g === o ? ' oggi' : ''}">${GIORNI[i]} ${+g.slice(8)}${g === o ? ' · oggi' : ''}</div>
            ${pp.length || ss.length ? `<div class="lista">${pp.map(rigaPartita).join('')}${ss.map(x => rigaSeduta(x, true)).join('')}</div>` : '<p class="muto piccolo">—</p>'}`;
        }).join('')}`;
    } else if (f.vista === 'mese') {
      const primo = f.mese + '-01', celle = [];
      for (let g = lunedi(primo); celle.length % 7 || g.slice(0, 7) <= f.mese; g = piuGiorni(g, 1)) celle.push(g);
      const conPartite = new Set(D.partite.filter(p => p.stato !== 'annullata' && (!f.sq || p.squadraId === f.sq)).map(p => p.data));
      const delGiorno = D.partite.filter(p => p.data === f.giorno && (!f.sq || p.squadraId === f.sq)).sort((a, b) => quandoPartita(a).localeCompare(quandoPartita(b)));
      corpo = `<div class="passo"><button class="icona-btn" data-act="sposta" data-o="cal" data-k="mese" data-n="-1" aria-label="Mese precedente">${icona('indietro')}</button><b>${nomeMese(f.mese)}</b>
          <button class="icona-btn" data-act="sposta" data-o="cal" data-k="mese" data-n="1" aria-label="Mese successivo">${icona('avanti')}</button></div>
        <div class="mese">${GG.map(x => `<div class="gs">${x}</div>`).join('')}${celle.map(g => `<button class="${g.slice(0, 7) !== f.mese ? 'fuori' : ''}${g === o ? ' oggi' : ''}${g === f.giorno ? ' sel' : ''}"
          data-act="filtro" data-o="cal" data-k="giorno" data-v="${g}">${+g.slice(8)}${conPartite.has(g) ? '<i></i>' : ''}</button>`).join('')}</div>
        <div class="giorno-tit">${GIORNI[gSett(f.giorno)]} ${dataIt(f.giorno)}</div>
        ${delGiorno.length ? `<div class="lista">${delGiorno.map(rigaPartita).join('')}</div>` : vuoto('Nessuna partita in questo giorno.')}`;
    } else {
      const al = D.allenamenti.filter(x => squadra(x.squadraId) && !squadra(x.squadraId).archiviata && (!f.sq || x.squadraId === f.sq));
      corpo = `<p class="muto piccolo">Orario settimanale fisso, ripetuto ogni settimana.</p>${GIORNI.map((nome, i) => {
        const del = al.filter(x => x.giorno === i).sort((a, b) => a.inizio.localeCompare(b.inizio));
        return del.length ? `<div class="giorno-tit">${nome}</div><div class="lista">${del.map(x => rigaSeduta(x, false)).join('')}</div>` : '';
      }).join('') || vuoto('Nessun allenamento. Aggiungili con il pulsante in basso.')}`;
    }
    const orari = f.vista === 'orari';
    return pagina('calendario', {
      titolo: 'Calendario', fab: orari ? { act: 'allenamento', testo: 'Allenamento', dati: f.sq ? `data-sq="${f.sq}"` : '' } : { act: 'partitaForm', testo: 'Partita', dati: f.sq ? `data-sq="${f.sq}"` : '' },
      corpo: seg('cal', 'vista', f.vista, [['prossime', 'Partite'], ['settimana', 'Settimana'], ['mese', 'Mese'], ['orari', 'Orari']]) + chipsSquadre('cal', f.sq) + corpo,
    });
  },

  impostazioni() {
    const demo = Object.values(D).some(l => l.some(x => x.demo));
    return pagina('impostazioni', {
      titolo: 'Impostazioni', indietro: '#/home',
      corpo: `<h2>Società</h2><form class="card" data-form="impostazioni">
          <label>Nome della società<input name="nomeSocieta" value="${esc(IMP.nomeSocieta)}" required></label>
          <div class="due"><label>Stagione<input name="stagione" value="${esc(IMP.stagione || stagioneDi(oggi()))}" placeholder="2026/27" required></label>
          <label>Scadenza quote (giorno)<input name="giornoScadenza" type="number" min="1" max="28" inputmode="numeric" value="${esc(IMP.giornoScadenza || 10)}" required></label></div>
          <label>Blocco automatico dopo (minuti)<input name="bloccoMinuti" type="number" min="1" max="60" inputmode="numeric" value="${esc(IMP.bloccoMinuti || 5)}" required></label>
          <button class="btn prim" type="submit">Salva</button></form>
        <h2>Backup</h2><div class="card"><p class="muto">I dati sono solo su questo telefono. Esporta un backup almeno una volta a settimana e conservalo fuori dal telefono.</p>
          <p>Ultimo backup: <b>${IMP.ultimoBackup ? new Date(IMP.ultimoBackup).toLocaleString('it-IT', { dateStyle: 'medium', timeStyle: 'short' }) : 'mai'}</b></p>
          <div class="azioni"><button class="btn prim" data-act="backupForm">Esporta backup</button><button class="btn" data-act="ripristinoForm">Ripristina</button></div></div>
        <h2>Sicurezza</h2><div class="card"><div class="azioni"><button class="btn" data-act="pinForm">Cambia PIN</button><button class="btn" data-act="blocca">Blocca ora</button></div>
          <p class="muto piccolo">Memoria persistente: ${persistente === true ? '<span class="verde">attiva</span>, Chrome non cancellerà i dati per liberare spazio' : persistente === false ? '<span class="giallo">non concessa</span> da Chrome: installa l\'app sulla schermata principale e fai backup frequenti' : 'non disponibile'}</p></div>
        <h2>Dati di prova</h2><div class="card"><p class="muto piccolo">Squadre, atleti, pagamenti e partite inventati, per provare l'app. Si cancellano con un tocco senza toccare i dati veri.</p>
          <div class="azioni">${demo ? '<button class="btn" data-act="eliminaDemo">Elimina dati di prova</button>' : '<button class="btn" data-act="caricaDemo">Carica dati di prova</button>'}</div></div>
        <h2>Zona pericolosa</h2><div class="card"><button class="btn peric" data-act="eliminaTutto">Cancella tutti i dati</button></div>
        <p class="muto piccolo">Gestionale Basket ${VERSIONE_APP} · nessun dato lascia il telefono se non lo esporti tu.</p>`,
    });
  },
};

function elencoAtleti() {
  const f = F.atleti, t = norm(f.testo);
  const lista = D.atleti.filter(a => (f.archiviati || a.attivo) && (!f.sq || a.squadraId === f.sq)
    && (!t || norm(`${a.cognome} ${a.nome}`).includes(t) || norm(`${a.nome} ${a.cognome}`).includes(t))).sort(ordinaAtleti);
  return lista.length ? `<div class="lista">${lista.map(rigaAtleta).join('')}</div>`
    : vuoto(t ? `Nessun atleta trovato per "${esc(f.testo)}".` : 'Nessun atleta. Aggiungilo con il pulsante in basso.');
}

// ---------------------------------------------------------------- schede dal basso
let schedaAperta = false, ignoraPop = false, modificato = false;
function apriScheda(titolo, corpo, piede, form) {
  const tag = form ? `form class="foglio" data-form="${form}"` : 'div class="foglio"';
  fogli.innerHTML = `<div class="fondo" data-act="chiudi"></div><${tag}><header><h2>${esc(titolo)}</h2><button type="button" class="icona-btn" data-act="chiudi" aria-label="Chiudi">${icona('x')}</button></header>
    <div class="corpo">${corpo}</div>${piede ? `<footer>${piede}</footer>` : ''}</${form ? 'form' : 'div'}>`;
  fogli.classList.add('su');
  document.body.classList.add('fermo');
  if (!schedaAperta) history.pushState({ scheda: 1 }, '');
  schedaAperta = true;
  modificato = false;
}
function nascondiScheda() { fogli.classList.remove('su'); fogli.innerHTML = ''; document.body.classList.remove('fermo'); schedaAperta = false; }
function chiudiScheda() { if (!schedaAperta) return; nascondiScheda(); ignoraPop = true; history.back(); }
function chiudiEVai(indirizzo) { nascondiScheda(); location.replace(indirizzo); }
window.addEventListener('popstate', () => {
  if (ignoraPop) { ignoraPop = false; return; }
  if (!schedaAperta) return;
  if (modificato && !confirm('Uscire senza salvare?')) { history.pushState({ scheda: 1 }, ''); return; }
  nascondiScheda();
});
const salvaBtn = (testo = 'Salva') => `<button type="submit" class="btn prim">${testo}</button>`;
const campo = (etichetta, nome, valore = '', tipo = 'text', extra = '') => `<label>${etichetta}<input name="${nome}" type="${tipo}" value="${esc(valore ?? '')}" ${extra}></label>`;
const scelta = (etichetta, nome, opzioni, valore, extra = '') => `<label>${etichetta}<select name="${nome}" ${extra}>${opzioni.map(([v, t]) =>
  `<option value="${esc(v)}" ${String(v) === String(valore ?? '') ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
const elencoSuggerimenti = (id, valori) => `<datalist id="${id}">${valori.map(v => `<option value="${esc(v)}">`).join('')}</datalist>`;
const opzSquadre = (valore, vuota = '— nessuna —') => [['', vuota], ...D.squadre.filter(s => !s.archiviata || s.id === valore)
  .sort((a, b) => a.nome.localeCompare(b.nome, 'it', { numeric: true })).map(s => [s.id, s.stagione ? `${s.nome} · ${s.stagione}` : s.nome])];

// ---------------------------------------------------------------- azioni (data-act)
const AZ = {
  chiudi: () => (schedaAperta && modificato && !confirm('Uscire senza salvare?') ? null : chiudiScheda()),
  indietro: ({ a }) => (history.length > 1 ? history.back() : (location.hash = a)),
  filtro({ o, k, v }, el) {
    F[o][k] = v === 'true' ? true : v === 'false' ? false : v;
    if (o === 'cal' && k === 'giorno') F.cal.mese = v.slice(0, 7);
    if (el.dataset.vai) return (location.hash = el.dataset.vai);
    render();
  },
  sposta({ o, k, n }) {
    F[o][k] = k === 'mese' ? piuMesi(F[o][k], +n) : piuGiorni(F[o][k], +n);
    if (o === 'cal' && k === 'mese') F.cal.giorno = F.cal.mese === oggi().slice(0, 7) ? oggi() : F.cal.mese + '-01';
    render();
  },
  cercaAtleta() { F.atleti.testo = ''; cercaDaHome = true; location.hash = '#/atleti'; },

  atletaForm({ id, sq }) {
    const a = id ? atleta(id) : { squadraId: sq || '', attivo: true, genitori: [] };
    const g = i => a.genitori?.[i] || {};
    const genitore = i => `<div class="blocco-tit">Genitore ${i + 1}</div>${campo('Nome e cognome', `g${i}n`, g(i).nome, 'text', 'autocomplete="off"')}
      <div class="due">${scelta('Relazione', `g${i}r`, [['madre', 'Madre'], ['padre', 'Padre'], ['tutore', 'Tutore'], ['altro', 'Altro']], g(i).relazione || (i ? 'padre' : 'madre'))}
      ${campo('Telefono', `g${i}t`, g(i).telefono, 'tel', 'inputmode="tel" autocomplete="off"')}</div>`;
    apriScheda(id ? 'Modifica atleta' : 'Nuovo atleta', `<input type="hidden" name="id" value="${esc(id || '')}">
      <div class="due">${campo('Cognome *', 'cognome', a.cognome, 'text', 'required autocapitalize="words" autocomplete="off"')}${campo('Nome *', 'nome', a.nome, 'text', 'required autocapitalize="words" autocomplete="off"')}</div>
      <div class="due">${campo('Data di nascita', 'dataNascita', a.dataNascita, 'date')}${campo('Numero di maglia', 'maglia', a.maglia, 'text', 'inputmode="numeric"')}</div>
      ${scelta('Squadra', 'squadraId', opzSquadre(a.squadraId), a.squadraId)}
      ${campo('Scadenza certificato medico', 'scadenzaCertificato', a.scadenzaCertificato, 'date')}
      ${genitore(0)}${genitore(1)}
      <div class="blocco-tit">Altri dati</div>
      ${campo("Telefono dell'atleta", 'telefono', a.telefono, 'tel', 'inputmode="tel"')}${campo('Email', 'email', a.email, 'email')}
      ${campo('Codice fiscale', 'codiceFiscale', a.codiceFiscale, 'text', 'maxlength="16" autocapitalize="characters"')}
      <label>Note<textarea name="note" rows="2">${esc(a.note)}</textarea></label>
      ${id ? `<label class="spunta"><input type="checkbox" name="attivo" ${a.attivo ? 'checked' : ''}> Atleta attivo (togli la spunta per archiviarlo)</label>
        <button type="button" class="btn peric" data-act="eliminaAtleta" data-id="${id}">Elimina definitivamente</button>` : ''}`, salvaBtn(), 'atleta');
  },
  async eliminaAtleta({ id }) {
    const a = atleta(id);
    if (!confirm(`Eliminare definitivamente ${nomeAtleta(a)} con tutte le sue quote e i suoi pagamenti?\n\nPer toglierlo dagli elenchi basta archiviarlo.`)) return;
    if (!confirm("Confermi? L'operazione non si può annullare.")) return;
    await elimina({ atleti: [id], quote: D.quote.filter(q => q.atletaId === id).map(q => q.id), pagamenti: D.pagamenti.filter(p => p.atletaId === id).map(p => p.id) });
    toast('Atleta eliminato');
    chiudiEVai('#/atleti');
  },

  squadraForm({ id }) {
    const s = id ? squadra(id) : { stagione: IMP.stagione || stagioneDi(oggi()) };
    apriScheda(id ? 'Modifica squadra' : 'Nuova squadra', `<input type="hidden" name="id" value="${esc(id || '')}">
      ${campo('Nome *', 'nome', s.nome, 'text', 'required placeholder="es. Under 14"')}
      <div class="due">${campo('Categoria', 'categoria', s.categoria, 'text', 'placeholder="es. U14 maschile"')}${campo('Stagione', 'stagione', s.stagione, 'text', 'placeholder="2026/27"')}</div>
      ${campo('Allenatore', 'allenatore', s.allenatore)}${campo("Telefono dell'allenatore", 'telefonoAllenatore', s.telefonoAllenatore, 'tel', 'inputmode="tel"')}
      ${campo('Quota mensile (€)', 'quotaMensile', s.quotaMensile ?? '', 'text', 'inputmode="decimal" placeholder="es. 40"')}
      <label>Note<textarea name="note" rows="2">${esc(s.note)}</textarea></label>
      ${id ? `<label class="spunta"><input type="checkbox" name="archiviata" ${s.archiviata ? 'checked' : ''}> Squadra archiviata</label>
        <button type="button" class="btn peric" data-act="eliminaSquadra" data-id="${id}">Elimina squadra</button>` : ''}`, salvaBtn(), 'squadra');
  },
  async eliminaSquadra({ id }) {
    const legati = D.atleti.some(a => a.squadraId === id) || D.partite.some(p => p.squadraId === id) || D.allenamenti.some(x => x.squadraId === id);
    if (legati) return toast('La squadra ha atleti, partite o allenamenti: archiviala invece di eliminarla', true);
    if (!confirm('Eliminare la squadra?')) return;
    await elimina({ squadre: [id] });
    toast('Squadra eliminata');
    chiudiEVai('#/squadre');
  },

  pagamentoForm({ atleta: id, importo, quota }) {
    const a = id && atleta(id);
    const atleti = D.atleti.filter(x => x.attivo || x.id === id).sort(ordinaAtleti);
    const suggerito = importo || (a ? scaduto(a.id) || dovuto(a.id) || '' : '');
    apriScheda('Registra pagamento', `<input type="hidden" name="quotaId" value="${esc(quota || '')}">
      ${a ? `<input type="hidden" name="atletaId" value="${a.id}"><p><b>${esc(nomeAtleta(a))}</b><br><span class="muto piccolo">da pagare ${euro(dovuto(a.id))} · scaduto ${euro(scaduto(a.id))}</span></p>`
        : scelta('Atleta *', 'atletaId', [['', 'Scegli…'], ...atleti.map(x => [x.id, `${nomeAtleta(x)} · ${squadra(x.squadraId)?.nome || 'senza squadra'}${dovuto(x.id) > 0 ? ' · ' + euro(dovuto(x.id)) : ''}`])], '', 'required')}
      ${campo('Importo (€) *', 'importo', suggerito ? String(suggerito).replace('.', ',') : '', 'text', 'inputmode="decimal" required')}
      <div class="due">${campo('Data *', 'data', oggi(), 'date', 'required')}${scelta('Metodo', 'metodo', [['contanti', 'Contanti'], ['bonifico', 'Bonifico'], ['pos', 'POS / carta'], ['satispay', 'Satispay'], ['altro', 'Altro']], 'contanti')}</div>
      ${campo('Nota', 'nota')}
      <p class="muto piccolo">${quota ? 'Il pagamento va su questa quota.' : "L'importo salda prima le quote più vecchie. Puoi registrare anche pagamenti parziali."}</p>`, salvaBtn('Registra'), 'pagamento');
  },
  async annullaPagamento({ id }) {
    const p = D.pagamenti.find(x => x.id === id);
    if (!confirm(`Annullare il pagamento di ${euro(p.importo)} del ${dataIt(p.data)}? Le quote torneranno da pagare.`)) return;
    await elimina({ pagamenti: [id] });
    toast('Pagamento annullato');
    render();
  },
  quotaForm({ atleta: id }) {
    const a = id && atleta(id);
    apriScheda(a ? 'Aggiungi quota' : 'Quota extra', `${a ? `<input type="hidden" name="atletaId" value="${a.id}"><p><b>${esc(nomeAtleta(a))}</b></p>`
      : scelta('Squadra *', 'squadraId', [['', 'Scegli…'], ...squadreAttive().map(s => [s.id, `${s.nome} (${plur(D.atleti.filter(x => x.attivo && x.squadraId === s.id).length, 'atleta', 'atleti')})`])], '', 'required')}
      ${campo('Descrizione *', 'descrizione', '', 'text', 'required placeholder="es. Iscrizione 2026/27, divisa, torneo"')}
      <div class="due">${campo('Importo (€) *', 'importo', '', 'text', 'inputmode="decimal" required')}${campo('Scadenza *', 'scadenza', oggi(), 'date', 'required')}</div>
      ${a ? '' : '<p class="muto piccolo">Viene creata una quota per ogni atleta attivo della squadra.</p>'}`, salvaBtn('Crea quota'), 'quota');
  },
  async eliminaQuota({ id }) {
    if (D.pagamenti.some(p => p.parti.some(x => x.quotaId === id))) return toast('La quota ha già pagamenti: annullali prima', true);
    if (!confirm('Eliminare questa quota?')) return;
    await elimina({ quote: [id] });
    toast('Quota eliminata');
    render();
  },
  async generaQuote({ mese }) {
    const giorno = String(Math.min(+IMP.giornoScadenza || 10, 28)).padStart(2, '0');
    const descrizione = `Quota ${nomeMese(mese)}`;
    const conQuota = D.atleti.filter(a => a.attivo && squadra(a.squadraId)?.quotaMensile > 0);
    const nuove = conQuota.filter(a => !D.quote.some(q => q.atletaId === a.id && q.mese === mese))
      .map(a => ({ atletaId: a.id, mese, descrizione, importo: squadra(a.squadraId).quotaMensile, scadenza: `${mese}-${giorno}` }));
    if (!conQuota.length) return toast('Imposta prima la quota mensile nelle squadre', true);
    if (!nuove.length) return toast(`Le quote di ${nomeMese(mese)} sono già state generate`);
    if (!confirm(`Creare ${plur(nuove.length, 'quota', 'quote')} di ${nomeMese(mese)} con scadenza il ${giorno}?`)) return;
    await salvaMolti('quote', nuove);
    toast(`Create ${plur(nuove.length, 'quota', 'quote')}`);
    render();
  },

  partita({ id }) {
    const p = D.partite.find(x => x.id === id), s = squadra(p.squadraId);
    const stato = { programmata: 'Programmata', disputata: 'Disputata', rinviata: 'Rinviata', annullata: 'Annullata' }[p.stato];
    apriScheda(`${s?.nome || '?'} – ${p.avversario}`, `<dl class="dati">
        <dt>Data</dt><dd>${GIORNI[gSett(p.data)]} ${dataIt(p.data)}${p.ora ? ' · ' + esc(p.ora) : ''}</dd>
        <dt>Campionato</dt><dd>${esc(p.campionato || '—')}${s?.categoria ? ` · ${esc(s.categoria)}` : ''}</dd>
        <dt>Dove</dt><dd>${p.casa ? 'In casa' : 'In trasferta'}${p.luogo ? ' · ' + esc(p.luogo) : ''}</dd>
        <dt>Stato</dt><dd>${stato}</dd>
        ${p.puntiNostri != null ? `<dt>Risultato</dt><dd class="ris">${esc(s?.nome)} ${p.puntiNostri} – ${p.puntiAvversari} ${esc(p.avversario)}</dd>` : ''}
        ${p.note ? `<dt>Note</dt><dd>${esc(p.note)}</dd>` : ''}</dl>`,
    `<button type="button" class="btn" data-act="partitaForm" data-id="${p.id}">Modifica</button><button type="button" class="btn prim" data-act="risultatoForm" data-id="${p.id}">Risultato</button>`);
  },
  partitaForm({ id, sq }) {
    const p = id ? D.partite.find(x => x.id === id) : { squadraId: sq || F.cal.sq || '', casa: true, stato: 'programmata', data: oggi() };
    const sugg = k => unici(D.partite.map(x => x[k]));
    apriScheda(id ? 'Modifica partita' : 'Nuova partita', `<input type="hidden" name="id" value="${esc(id || '')}">
      ${scelta('Squadra della società *', 'squadraId', opzSquadre(p.squadraId, 'Scegli…'), p.squadraId, 'required')}
      ${campo('Avversario *', 'avversario', p.avversario, 'text', 'required list="dl-avv" autocomplete="off"')}
      ${campo('Campionato', 'campionato', p.campionato, 'text', 'list="dl-camp" autocomplete="off" placeholder="es. Under 14 Regionale"')}
      <div class="due">${campo('Data *', 'data', p.data, 'date', 'required')}${campo('Orario', 'ora', p.ora, 'time')}</div>
      <fieldset><legend>Dove si gioca</legend><div class="scelta2"><input type="radio" name="casa" id="r-casa" value="1" ${p.casa ? 'checked' : ''}><label for="r-casa">In casa</label>
        <input type="radio" name="casa" id="r-tras" value="0" ${p.casa ? '' : 'checked'}><label for="r-tras">In trasferta</label></div></fieldset>
      ${campo('Luogo e campo', 'luogo', p.luogo, 'text', 'list="dl-luogo" autocomplete="off"')}
      ${scelta('Stato', 'stato', [['programmata', 'Programmata'], ['disputata', 'Disputata'], ['rinviata', 'Rinviata'], ['annullata', 'Annullata']], p.stato)}
      <div class="due">${campo('Punti nostri', 'puntiNostri', p.puntiNostri, 'number', 'inputmode="numeric" min="0"')}${campo('Punti avversari', 'puntiAvversari', p.puntiAvversari, 'number', 'inputmode="numeric" min="0"')}</div>
      <label>Note<textarea name="note" rows="2">${esc(p.note)}</textarea></label>
      ${id ? `<button type="button" class="btn peric" data-act="eliminaPartita" data-id="${id}">Elimina partita</button>` : ''}
      ${elencoSuggerimenti('dl-avv', sugg('avversario'))}${elencoSuggerimenti('dl-camp', sugg('campionato'))}${elencoSuggerimenti('dl-luogo', unici([...sugg('luogo'), ...D.allenamenti.map(x => x.campo)]))}`,
    salvaBtn(), 'partita');
  },
  risultatoForm({ id }) {
    const p = D.partite.find(x => x.id === id), s = squadra(p.squadraId);
    apriScheda('Risultato finale', `<input type="hidden" name="id" value="${p.id}"><p class="muto">${dataBreve(p.data)} · ${p.casa ? 'in casa' : 'in trasferta'}</p>
      <div class="punteggio"><label>${esc(s?.nome || 'Noi')}<input name="puntiNostri" type="number" inputmode="numeric" min="0" required value="${esc(p.puntiNostri ?? '')}"></label><span>–</span>
      <label>${esc(p.avversario)}<input name="puntiAvversari" type="number" inputmode="numeric" min="0" required value="${esc(p.puntiAvversari ?? '')}"></label></div>`, salvaBtn('Salva risultato'), 'risultato');
  },
  async eliminaPartita({ id }) {
    if (!confirm('Eliminare questa partita?')) return;
    await elimina({ partite: [id] });
    toast('Partita eliminata');
    chiudiScheda();
    render();
  },

  allenamento({ id, sq }) {
    const x = id ? D.allenamenti.find(y => y.id === id) : { squadraId: sq || '', giorno: gSett(oggi()), inizio: '17:00', fine: '18:30' };
    apriScheda(id ? 'Modifica allenamento' : 'Nuovo allenamento', `<input type="hidden" name="id" value="${esc(id || '')}">
      ${scelta('Squadra *', 'squadraId', opzSquadre(x.squadraId, 'Scegli…'), x.squadraId, 'required')}
      ${scelta('Giorno *', 'giorno', GIORNI.map((g, i) => [i, g]), x.giorno)}
      <div class="due">${campo('Inizio *', 'inizio', x.inizio, 'time', 'required')}${campo('Fine *', 'fine', x.fine, 'time', 'required')}</div>
      ${campo('Campo', 'campo', x.campo, 'text', 'list="dl-campi" autocomplete="off" placeholder="es. Palestra comunale"')}
      ${campo('Allenatore', 'allenatore', x.allenatore, 'text', `placeholder="${esc(squadra(x.squadraId)?.allenatore || "se diverso da quello della squadra")}"`)}
      ${id ? `<button type="button" class="btn peric" data-act="eliminaAllenamento" data-id="${id}">Elimina allenamento</button>` : ''}
      ${elencoSuggerimenti('dl-campi', unici([...D.allenamenti.map(y => y.campo), ...D.partite.filter(p => p.casa).map(p => p.luogo)]))}`, salvaBtn(), 'allenamento');
  },
  async eliminaAllenamento({ id }) {
    if (!confirm("Eliminare questo orario di allenamento?")) return;
    await elimina({ allenamenti: [id] });
    toast('Allenamento eliminato');
    chiudiScheda();
    render();
  },

  // --- impostazioni, PIN, backup
  pinForm() {
    apriScheda('Cambia PIN', `${campo('PIN attuale', 'attuale', '', 'password', 'inputmode="numeric" pattern="[0-9]{4,6}" required autocomplete="off"')}
      ${campo('Nuovo PIN (4–6 cifre)', 'nuovo', '', 'password', 'inputmode="numeric" pattern="[0-9]{4,6}" required autocomplete="off"')}
      ${campo('Ripeti il nuovo PIN', 'conferma', '', 'password', 'inputmode="numeric" pattern="[0-9]{4,6}" required autocomplete="off"')}`, salvaBtn('Cambia PIN'), 'pin');
  },
  blocca: () => blocca(),
  backupForm() {
    apriScheda('Esporta backup', `<p class="muto">Il file conterrà tutti i dati, cifrati con la password che scegli ora. Senza password il file non si può aprire: conservala con cura.</p>
      ${campo('Password del backup (almeno 8 caratteri)', 'password', '', 'password', 'required minlength="8" autocomplete="new-password"')}
      ${campo('Ripeti la password', 'conferma', '', 'password', 'required minlength="8" autocomplete="new-password"')}`, salvaBtn('Crea backup'), 'backup');
  },
  async scaricaBackup() {
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(backupPronto), download: backupPronto.name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    await imposta({ ultimoBackup: new Date().toISOString() });
    toast('Backup salvato nella cartella Download');
    chiudiScheda();
    render();
  },
  async condividiBackup() {
    try {
      await navigator.share({ files: [backupPronto], title: 'Backup gestionale' });
    } catch (e) {
      if (e.name === 'AbortError') return;
      throw new Error('Condivisione non riuscita: usa "Salva nel telefono"');
    }
    await imposta({ ultimoBackup: new Date().toISOString() });
    toast('Backup condiviso');
    chiudiScheda();
    render();
  },
  ripristinoForm() {
    apriScheda('Ripristina backup', `<p class="muto">Scegli il file di backup e inserisci la sua password. Prima di sostituire i dati ti mostro cosa contiene.</p>
      <label>File di backup<input type="file" name="file" accept=".json,application/json" required></label>
      ${campo('Password del backup', 'password', '', 'password', 'required autocomplete="off"')}`, salvaBtn('Leggi il backup'), 'ripristino');
  },
  async confermaRipristino() {
    if (!confirm('Sostituire TUTTI i dati di questo telefono con quelli del backup?')) return;
    const { dati } = backupLetto;
    const pin = ['pinHash', 'pinSale', 'pinLunghezza'].filter(k => IMP[k] !== undefined).map(k => ({ chiave: k, valore: IMP[k] }));
    const imp = (dati.impostazioni || []).filter(x => !['pinHash', 'pinSale', 'pinLunghezza'].includes(x.chiave));
    await db.scrivi({ impostazioni: [...imp, ...pin], ...Object.fromEntries(db.ARCHIVI.map(s => [s, dati[s] || []])) }, {}, ['impostazioni', ...db.ARCHIVI]);
    await carica();
    backupLetto = null;
    toast('Backup ripristinato');
    chiudiEVai('#/home');
    render();
  },
  async caricaDemo() {
    if (D.squadre.some(x => !x.demo) || D.atleti.some(x => !x.demo)) return toast("I dati di prova si caricano solo con l'archivio vuoto, per non mescolarli ai dati veri", true);
    if (!confirm('Caricare squadre, atleti, pagamenti e partite inventati per provare l\'app?')) return;
    await caricaDatiDiProva();
    toast('Dati di prova caricati');
    location.hash = '#/home';
    render();
  },
  async eliminaDemo() {
    if (!confirm('Eliminare tutti i dati di prova? I dati inseriti da te restano.')) return;
    await elimina(Object.fromEntries(Object.keys(D).map(s => [s, D[s].filter(x => x.demo).map(x => x.id)])));
    toast('Dati di prova eliminati');
    render();
  },
  async eliminaTutto() {
    if (!confirm('Cancellare TUTTI i dati, compreso il PIN? Fai prima un backup.')) return;
    if (prompt('Per confermare scrivi CANCELLA') !== 'CANCELLA') return toast('Operazione annullata');
    await db.scrivi({}, {}, ['impostazioni', ...db.ARCHIVI]);
    history.replaceState(null, '', location.pathname);
    location.reload();
  },
};

// ---------------------------------------------------------------- invio dei moduli (data-form)
let backupPronto = null, backupLetto = null;
const FORM = {
  async atleta(d) {
    const vecchio = d.id ? atleta(d.id) : {};
    const genitori = [0, 1].map(i => ({ nome: d[`g${i}n`].trim(), relazione: d[`g${i}r`], telefono: d[`g${i}t`].trim() })).filter(g => g.nome || g.telefono);
    const a = { ...vecchio, cognome: d.cognome.trim(), nome: d.nome.trim(), dataNascita: d.dataNascita, squadraId: d.squadraId || null, maglia: d.maglia.trim(),
      scadenzaCertificato: d.scadenzaCertificato, genitori, telefono: d.telefono.trim(), email: d.email.trim(), codiceFiscale: d.codiceFiscale.trim().toUpperCase(),
      note: d.note.trim(), attivo: d.id ? 'attivo' in d : true };
    if (!a.cognome || !a.nome) throw new Error('Cognome e nome sono obbligatori');
    if (a.dataNascita && a.dataNascita > oggi()) throw new Error('La data di nascita è nel futuro');
    const doppio = D.atleti.find(x => x.id !== d.id && norm(x.cognome) === norm(a.cognome) && norm(x.nome) === norm(a.nome) && (x.dataNascita || '') === (a.dataNascita || ''));
    if (doppio && !confirm('Esiste già un atleta con lo stesso nome e la stessa data di nascita. Salvare comunque?')) return;
    const x = await salva('atleti', a);
    toast('Atleta salvato');
    if (d.id) { chiudiScheda(); render(); } else chiudiEVai('#/atleta/' + x.id);
  },
  async squadra(d) {
    const vecchio = d.id ? squadra(d.id) : {};
    const quota = d.quotaMensile.trim() ? numero(d.quotaMensile) : 0;
    if (!(quota >= 0)) throw new Error('Quota mensile non valida');
    const s = { ...vecchio, nome: d.nome.trim(), categoria: d.categoria.trim(), stagione: d.stagione.trim(), allenatore: d.allenatore.trim(),
      telefonoAllenatore: d.telefonoAllenatore.trim(), quotaMensile: quota, note: d.note.trim(), archiviata: d.id ? 'archiviata' in d : false };
    if (!s.nome) throw new Error('Il nome è obbligatorio');
    if (D.squadre.some(x => x.id !== d.id && norm(x.nome) === norm(s.nome) && norm(x.stagione) === norm(s.stagione))) throw new Error('Esiste già una squadra con questo nome in questa stagione');
    const x = await salva('squadre', s);
    toast('Squadra salvata');
    if (d.id) { chiudiScheda(); render(); } else chiudiEVai('#/squadra/' + x.id);
  },
  async pagamento(d) {
    if (!d.atletaId) throw new Error("Scegli l'atleta");
    const importo = numero(d.importo);
    const parti = ripartisci(d.atletaId, importo, d.quotaId);
    await salva('pagamenti', { atletaId: d.atletaId, data: d.data, importo, metodo: d.metodo, nota: d.nota.trim(), parti });
    toast(`Pagamento di ${euro(importo)} registrato`);
    chiudiScheda();
    render();
  },
  async quota(d) {
    const importo = numero(d.importo);
    if (!(importo > 0)) throw new Error('Importo non valido');
    const destinatari = d.atletaId ? [d.atletaId] : D.atleti.filter(a => a.attivo && a.squadraId === d.squadraId).map(a => a.id);
    const nuove = destinatari.filter(id => !D.quote.some(q => q.atletaId === id && norm(q.descrizione) === norm(d.descrizione)))
      .map(atletaId => ({ atletaId, mese: null, descrizione: d.descrizione.trim(), importo, scadenza: d.scadenza }));
    if (!nuove.length) throw new Error(destinatari.length ? 'Esiste già una quota con questa descrizione' : 'La squadra non ha atleti attivi');
    await salvaMolti('quote', nuove);
    toast(`Create ${plur(nuove.length, 'quota', 'quote')}`);
    chiudiScheda();
    render();
  },
  async partita(d) {
    const vecchio = d.id ? D.partite.find(x => x.id === d.id) : {};
    const punti = v => (String(v).trim() === '' ? null : Math.max(0, Math.round(+v)));
    const p = { ...vecchio, squadraId: d.squadraId, avversario: d.avversario.trim(), campionato: d.campionato.trim(), data: d.data, ora: d.ora,
      casa: d.casa === '1', luogo: d.luogo.trim(), stato: d.stato, puntiNostri: punti(d.puntiNostri), puntiAvversari: punti(d.puntiAvversari), note: d.note.trim() };
    if (!squadra(p.squadraId)) throw new Error('Scegli la squadra della società');
    if (!p.avversario || !p.data) throw new Error('Avversario e data sono obbligatori');
    if ((p.puntiNostri === null) !== (p.puntiAvversari === null)) throw new Error('Inserisci entrambi i punteggi o nessuno');
    if (p.puntiNostri !== null && p.stato === 'programmata') p.stato = 'disputata';
    await salva('partite', p);
    toast('Partita salvata');
    chiudiScheda();
    render();
  },
  async risultato(d) {
    const p = D.partite.find(x => x.id === d.id);
    await salva('partite', { ...p, puntiNostri: Math.round(+d.puntiNostri), puntiAvversari: Math.round(+d.puntiAvversari), stato: 'disputata' });
    toast('Risultato salvato');
    chiudiScheda();
    render();
  },
  async allenamento(d) {
    const x = { ...(d.id ? D.allenamenti.find(y => y.id === d.id) : {}), squadraId: d.squadraId, giorno: +d.giorno, inizio: d.inizio, fine: d.fine, campo: d.campo.trim(), allenatore: d.allenatore.trim() };
    if (!squadra(x.squadraId)) throw new Error('Scegli la squadra');
    if (x.fine <= x.inizio) throw new Error("L'ora di fine deve essere dopo l'inizio");
    const conflitto = x.campo && D.allenamenti.find(y => y.id !== d.id && y.giorno === x.giorno && norm(y.campo) === norm(x.campo) && y.inizio < x.fine && x.inizio < y.fine);
    if (conflitto && !confirm(`Il campo "${x.campo}" è già occupato da ${squadra(conflitto.squadraId)?.nome} (${conflitto.inizio}–${conflitto.fine}). Salvare comunque?`)) return;
    await salva('allenamenti', x);
    toast('Allenamento salvato');
    chiudiScheda();
    render();
  },
  async impostazioni(d) {
    const giorno = +d.giornoScadenza, minuti = +d.bloccoMinuti;
    if (!d.nomeSocieta.trim()) throw new Error('Il nome della società è obbligatorio');
    if (!(giorno >= 1 && giorno <= 28) || !(minuti >= 1 && minuti <= 60)) throw new Error('Controlla giorno di scadenza (1–28) e minuti di blocco (1–60)');
    await imposta({ nomeSocieta: d.nomeSocieta.trim(), stagione: d.stagione.trim(), giornoScadenza: giorno, bloccoMinuti: minuti });
    toast('Impostazioni salvate');
    render();
  },
  async pin(d) {
    if (await db.impronta(d.attuale, IMP.pinSale) !== IMP.pinHash) throw new Error('PIN attuale errato');
    if (!/^\d{4,6}$/.test(d.nuovo) || d.nuovo !== d.conferma) throw new Error('Il nuovo PIN deve avere 4–6 cifre e coincidere nei due campi');
    const sale = db.nuovoSale();
    await imposta({ pinSale: sale, pinHash: await db.impronta(d.nuovo, sale), pinLunghezza: d.nuovo.length });
    toast('PIN cambiato');
    chiudiScheda();
  },
  async backup(d) {
    if (d.password.length < 8 || d.password !== d.conferma) throw new Error('La password deve avere almeno 8 caratteri e coincidere nei due campi');
    const t = await db.leggiTutto();
    t.impostazioni = t.impostazioni.filter(x => !['pinHash', 'pinSale', 'pinLunghezza'].includes(x.chiave));
    const contenuto = { app: 'gestionale-basket', versioneApp: VERSIONE_APP, creato: new Date().toISOString(), societa: IMP.nomeSocieta, dati: t };
    const file = await db.cifra(contenuto, d.password);
    backupPronto = new File([JSON.stringify(file)], `gestionale-backup-${oggi()}.json`, { type: 'application/json' });
    const puoCondividere = navigator.canShare?.({ files: [backupPronto] });
    apriScheda('Backup pronto', `<p>Il backup contiene ${plur(t.squadre.length, 'squadra', 'squadre')}, ${plur(t.atleti.length, 'atleta', 'atleti')}, ${plur(t.pagamenti.length, 'pagamento', 'pagamenti')} e ${plur(t.partite.length, 'partita', 'partite')}.</p>
      <p class="muto piccolo">Conservalo fuori dal telefono (PC, chiavetta o un cloud di tua scelta). Senza la password non si può aprire.</p>`,
    `<button type="button" class="btn prim" data-act="scaricaBackup">Salva nel telefono</button>${puoCondividere ? '<button type="button" class="btn" data-act="condividiBackup">Condividi…</button>' : ''}`);
  },
  async ripristino(d, form) {
    const file = form.file.files[0];
    if (!file) throw new Error('Scegli il file di backup');
    let grezzo;
    try { grezzo = JSON.parse(await file.text()); } catch { throw new Error('Il file non è un backup valido'); }
    const contenuto = await db.decifra(grezzo, d.password);
    if (contenuto.app !== 'gestionale-basket' || !contenuto.dati || !db.ARCHIVI.every(s => Array.isArray(contenuto.dati[s] || []))) throw new Error('Il backup non è leggibile');
    backupLetto = contenuto;
    const n = s => (contenuto.dati[s] || []).length;
    apriScheda('Contenuto del backup', `<dl class="dati"><dt>Società</dt><dd>${esc(contenuto.societa || '—')}</dd><dt>Creato il</dt><dd>${new Date(contenuto.creato).toLocaleString('it-IT', { dateStyle: 'medium', timeStyle: 'short' })}</dd>
      <dt>Squadre</dt><dd>${n('squadre')}</dd><dt>Atleti</dt><dd>${n('atleti')}</dd><dt>Quote</dt><dd>${n('quote')}</dd><dt>Pagamenti</dt><dd>${n('pagamenti')}</dd>
      <dt>Allenamenti</dt><dd>${n('allenamenti')}</dd><dt>Partite</dt><dd>${n('partite')}</dd></dl>
      <p class="muto piccolo">Ripristinando, i dati attuali del telefono vengono sostituiti da questi. Il PIN resta quello attuale.</p>`,
    '<button type="button" class="btn prim" data-act="confermaRipristino">Sostituisci i dati</button>');
  },
  async setup(d) {
    if (!d.nomeSocieta.trim()) throw new Error('Inserisci il nome della società');
    if (!/^\d{4,6}$/.test(d.pin) || d.pin !== d.conferma) throw new Error('Il PIN deve avere 4–6 cifre e coincidere nei due campi');
    const sale = db.nuovoSale();
    await imposta({ nomeSocieta: d.nomeSocieta.trim(), stagione: d.stagione.trim() || stagioneDi(oggi()), giornoScadenza: 10, bloccoMinuti: 5,
      pinSale: sale, pinHash: await db.impronta(d.pin, sale), pinLunghezza: d.pin.length });
    await chiediPersistenza();
    sblocca();
  },
};

// ---------------------------------------------------------------- primo avvio, blocco con PIN
let bloccato = true, pinInserito = '', errori = 0, attesaFino = 0, nascostoDa = 0;
function schermataSetup() {
  document.body.classList.add('senza-nav');
  app.innerHTML = `<div class="accesso"><div class="logo">${icona('squadre')}</div><h1>Benvenuto</h1>
    <p class="muto">Configura il gestionale. I dati resteranno solo su questo telefono, protetti da un PIN.</p>
    <form data-form="setup">${campo('Nome della società', 'nomeSocieta', '', 'text', 'required autocapitalize="words"')}
      ${campo('Stagione', 'stagione', stagioneDi(oggi()), 'text', 'required')}
      <div class="due">${campo('PIN (4–6 cifre)', 'pin', '', 'password', 'inputmode="numeric" pattern="[0-9]{4,6}" required autocomplete="off"')}
      ${campo('Ripeti il PIN', 'conferma', '', 'password', 'inputmode="numeric" pattern="[0-9]{4,6}" required autocomplete="off"')}</div>
      <button class="btn prim" type="submit">Inizia</button></form>
    <p class="muto piccolo">Hai un backup? Dopo la configurazione lo ripristini da Impostazioni.</p></div>`;
}
function schermataBlocco() {
  document.body.classList.add('senza-nav');
  const n = +IMP.pinLunghezza || 4;
  app.innerHTML = `<div class="accesso blocco"><div class="logo">${icona('squadre')}</div><h1>${esc(IMP.nomeSocieta || 'Gestionale')}</h1><p class="muto" id="msg-pin">Inserisci il PIN</p>
    <div class="pallini" id="pallini">${Array.from({ length: n }, (_, i) => `<i class="${i < pinInserito.length ? 'pieno' : ''}"></i>`).join('')}</div>
    <div class="tastierino">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(c => `<button data-act="cifra" data-c="${c}">${c}</button>`).join('')}
      <button class="vuoto-tasto" disabled></button><button data-act="cifra" data-c="0">0</button><button class="vuoto-tasto" data-act="cifra" data-c="canc" aria-label="Cancella">${icona('canc')}</button></div></div>`;
}
AZ.cifra = async ({ c }) => {
  if (Date.now() < attesaFino) return toast(`Troppi tentativi: riprova tra ${Math.ceil((attesaFino - Date.now()) / 1000)} secondi`, true);
  const n = +IMP.pinLunghezza || 4;
  pinInserito = c === 'canc' ? pinInserito.slice(0, -1) : (pinInserito + c).slice(0, n);
  schermataBlocco();
  if (pinInserito.length < n) return;
  const ok = await db.impronta(pinInserito, IMP.pinSale) === IMP.pinHash;
  pinInserito = '';
  if (ok) { errori = 0; return sblocca(); }
  errori++;
  if (errori >= 5) attesaFino = Date.now() + 30000 * (errori - 4);
  navigator.vibrate?.(200);
  schermataBlocco();
  document.getElementById('pallini').classList.add('errore');
  document.getElementById('msg-pin').textContent = errori >= 5 ? `PIN errato. Attendi ${30 * (errori - 4)} secondi` : 'PIN errato, riprova';
};
function sblocca() {
  bloccato = false;
  document.body.classList.remove('senza-nav');
  chiediPersistenza();
  ultimaRotta = null;
  render();
}
function blocca() {
  if (!IMP.pinHash) return;
  if (schedaAperta) nascondiScheda();
  bloccato = true;
  pinInserito = '';
  schermataBlocco();
}
async function chiediPersistenza() {
  try {
    persistente = await navigator.storage?.persisted?.() ?? null;
    if (persistente === false) persistente = await navigator.storage.persist();
  } catch { persistente = null; }
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) nascostoDa = Date.now();
  else if (!bloccato && nascostoDa && Date.now() - nascostoDa > (+IMP.bloccoMinuti || 5) * 60000) blocca();
});

// ---------------------------------------------------------------- disegno della pagina
let ultimaRotta = null;
function render() {
  if (bloccato) return;
  const [nome, id] = location.hash.slice(2).split('/');
  const rotta = PAGINE[nome] ? nome : 'home';
  app.innerHTML = PAGINE[rotta](id && decodeURIComponent(id));
  if (location.hash !== ultimaRotta) { window.scrollTo(0, 0); ultimaRotta = location.hash; }
  if (rotta === 'atleti' && cercaDaHome) { cercaDaHome = false; document.getElementById('cerca-atleti')?.focus(); }
}

// ---------------------------------------------------------------- eventi
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  e.preventDefault();
  try { await AZ[el.dataset.act](el.dataset, el); } catch (err) { toast(err.message, true); console.error(err); }
});
document.addEventListener('submit', async e => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  const bottone = form.querySelector('[type=submit]');
  if (bottone) bottone.disabled = true;
  try { await FORM[form.dataset.form](Object.fromEntries(new FormData(form)), form); } catch (err) { toast(err.message, true); console.error(err); } finally { if (bottone) bottone.disabled = false; }
});
document.addEventListener('input', e => {
  if (e.target.id === 'cerca-atleti') { F.atleti.testo = e.target.value; document.getElementById('elenco-atleti').innerHTML = elencoAtleti(); }
  if (fogli.contains(e.target)) modificato = true;
});
window.addEventListener('hashchange', render);

// Aggiornamenti dell'app: il service worker scarica la nuova versione, l'utente sceglie quando ricaricare
function registraServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').then(reg => {
    const pronta = w => {
      if (!w || !navigator.serviceWorker.controller || document.querySelector('.aggiorna')) return;
      const b = Object.assign(document.createElement('button'), { className: 'aggiorna', textContent: 'Nuova versione disponibile · Aggiorna' });
      b.addEventListener('click', () => w.postMessage('aggiorna'));
      document.body.append(b);
    };
    pronta(reg.waiting);
    reg.addEventListener('updatefound', () => { const w = reg.installing; w.addEventListener('statechange', () => w.state === 'installed' && pronta(w)); });
  }).catch(e => console.warn('Service worker non registrato:', e));
  let ricaricato = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!ricaricato) { ricaricato = true; location.reload(); } });
}

// ---------------------------------------------------------------- dati di prova (tutti inventati)
async function caricaDatiDiProva() {
  const o = oggi(), m = o.slice(0, 7), mPrima = piuMesi(m, -1), stag = IMP.stagione || stagioneDi(o);
  const anno = +o.slice(0, 4), demo = true;
  const sq = [['Under 13', 'U13 maschile', 'Luca Ferraro', 35, anno - 13], ['Under 14', 'U14 maschile', 'Paolo Neri', 40, anno - 14], ['Under 16', 'U16 maschile', 'Marco Galli', 45, anno - 16]]
    .map(([nome, categoria, allenatore, quotaMensile, nascita]) => ({ id: crypto.randomUUID(), nome, categoria, stagione: stag, allenatore, telefonoAllenatore: '3330000100', quotaMensile, archiviata: false, demo, nascita }));
  const cognomi = ['Bianchi', 'Colombo', 'Esposito', 'Ferri', 'Greco', 'Longo', 'Gallo', 'Conti', 'Marchetti', 'Costa', 'Fontana', 'Moretti', 'Barbieri', 'Lombardi', 'Rinaldi',
    'Caruso', 'Ferrara', 'Santoro', 'Mariani', 'Rizzi', 'Monti', 'Cattaneo', 'Martini', 'Leone', 'Serra', 'Villa', 'Pellegrini', 'Palumbo', 'Sanna', 'Farina'];
  const nomi = ['Luca', 'Andrea', 'Marco', 'Davide', 'Paolo', 'Simone', 'Pietro', 'Elia', 'Leo', 'Tommaso', 'Matteo', 'Gabriele', 'Riccardo', 'Lorenzo', 'Edoardo',
    'Filippo', 'Giacomo', 'Samuele', 'Nicolò', 'Alessio', 'Michele', 'Diego', 'Emanuele', 'Giulio', 'Federico', 'Stefano', 'Alberto', 'Daniele', 'Enea', 'Mattia'];
  const atleti = cognomi.map((cognome, i) => {
    const s = sq[i % 3], mese = String(1 + (i * 5) % 12).padStart(2, '0'), giorno = String(1 + (i * 7) % 27).padStart(2, '0');
    return { id: crypto.randomUUID(), cognome, nome: nomi[i], dataNascita: `${s.nascita}-${mese}-${giorno}`, squadraId: s.id, maglia: String(4 + (i * 3) % 20),
      scadenzaCertificato: piuGiorni(o, [-12, 9, 25, 120, 200, 300][i % 6]), telefono: '', email: '', codiceFiscale: '', note: '', attivo: true, demo,
      genitori: [{ nome: `${['Anna', 'Maria', 'Laura', 'Sara', 'Elena'][i % 5]} ${cognome}`, relazione: 'madre', telefono: `33300${String(1000 + i).slice(-4)}0` }] };
  });
  const scad = mm => `${mm}-${String(+IMP.giornoScadenza || 10).padStart(2, '0')}`;
  const quote = atleti.flatMap(a => [mPrima, m].map(mm => ({ id: crypto.randomUUID(), atletaId: a.id, mese: mm, descrizione: `Quota ${nomeMese(mm)}`,
    importo: sq.find(s => s.id === a.squadraId).quotaMensile, scadenza: scad(mm), demo })));
  const pagamenti = [];
  atleti.forEach((a, i) => {
    const [q1, q2] = quote.filter(q => q.atletaId === a.id);
    if (i % 4 !== 3) pagamenti.push({ id: crypto.randomUUID(), atletaId: a.id, data: piuGiorni(q1.scadenza, -(i % 5)), importo: q1.importo, metodo: i % 3 ? 'contanti' : 'bonifico', nota: '', parti: [{ quotaId: q1.id, importo: q1.importo }], demo });
    if (i % 3 === 0 && q2.scadenza <= o) pagamenti.push({ id: crypto.randomUUID(), atletaId: a.id, data: o, importo: q2.importo, metodo: 'contanti', nota: '', parti: [{ quotaId: q2.id, importo: q2.importo }], demo });
    if (i % 7 === 1) pagamenti.push({ id: crypto.randomUUID(), atletaId: a.id, data: o, importo: 20, metodo: 'contanti', nota: 'acconto', parti: [{ quotaId: q2.id, importo: 20 }], demo });
  });
  const allenamenti = [[0, 0, '17:00', '18:30'], [0, 2, '17:00', '18:30'], [1, 1, '18:30', '20:00'], [1, 3, '18:30', '20:00'], [2, 0, '18:30', '20:00'], [2, 4, '18:30', '20:00']]
    .map(([s, giorno, inizio, fine]) => ({ id: crypto.randomUUID(), squadraId: sq[s].id, giorno, inizio, fine, campo: s === 2 ? 'Palazzetto' : 'Palestra comunale', allenatore: '', demo }));
  const avversari = ['Basket Orione', 'Polisportiva Aurora', 'Valverde Basket', 'Gli Aironi', 'Basket Libeccio', 'Atletico Collina'];
  const partite = [];
  sq.forEach((s, k) => {
    [-17, -10, -3, 4, 11, 18].forEach((dd, j) => {
      const data = piuGiorni(o, dd + k), passata = data < o, casa = j % 2 === 0;
      const noi = 40 + ((j * 13 + k * 7) % 30), loro = 38 + ((j * 11 + k * 5) % 32);
      partite.push({ id: crypto.randomUUID(), squadraId: s.id, avversario: avversari[(j + k) % 6], campionato: `${s.nome} Regionale`, data, ora: ['10:00', '16:30', '18:00'][j % 3],
        casa, luogo: casa ? (k === 2 ? 'Palazzetto' : 'Palestra comunale') : `Palestra ${avversari[(j + k) % 6]}`, stato: passata ? 'disputata' : j === 4 && k === 1 ? 'rinviata' : 'programmata',
        puntiNostri: passata ? noi : null, puntiAvversari: passata ? loro : null, note: '', demo });
    });
  });
  const ora = new Date().toISOString(), timbro = x => ({ ...x, creato: ora, modificato: ora });
  const righe = { squadre: sq.map(({ nascita, ...s }) => timbro(s)), atleti: atleti.map(timbro), quote: quote.map(timbro), pagamenti: pagamenti.map(timbro), allenamenti: allenamenti.map(timbro), partite: partite.map(timbro) };
  await db.scrivi(righe);
  for (const [s, l] of Object.entries(righe)) D[s].push(...l);
}

// ---------------------------------------------------------------- avvio
(async function avvio() {
  try {
    await db.apri();
    await carica();
  } catch (e) {
    app.innerHTML = `<div class="accesso"><h1>Archivio non disponibile</h1><p class="muto">${esc(e.message)}</p><p class="muto">Apri l'app con Chrome e controlla che la memoria del telefono non sia piena.</p></div>`;
    return;
  }
  registraServiceWorker();
  if (!IMP.pinHash) schermataSetup(); else schermataBlocco();
})();
