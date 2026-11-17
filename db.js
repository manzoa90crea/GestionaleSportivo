/*
 * db.js — Archivio locale del gestionale (IndexedDB), PIN e backup cifrati.
 *
 * - Un solo database "gestionale" sul telefono, con un archivio per tipo di dato.
 * - scrivi() salva e cancella in un'unica transazione: o tutto o niente.
 * - Il PIN è salvato solo come impronta PBKDF2; i backup sono cifrati con AES-GCM
 *   e una password scelta dall'utente. Tutto con la crittografia già presente in Chrome.
 */
const NOME = 'gestionale', VERSIONE = 1;
export const ARCHIVI = ['squadre', 'atleti', 'quote', 'pagamenti', 'allenamenti', 'partite'];
let db;

const attendi = r => new Promise((ok, ko) => { r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });

export function apri() {
  return new Promise((ok, ko) => {
    const r = indexedDB.open(NOME, VERSIONE);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('impostazioni')) d.createObjectStore('impostazioni', { keyPath: 'chiave' });
      for (const s of ARCHIVI) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' });
    };
    r.onsuccess = () => { db = r.result; ok(); };
    r.onerror = () => ko(r.error);
    r.onblocked = () => ko(new Error("Chiudi le altre schede del gestionale e riapri l'app"));
  });
}

// Legge tutti gli archivi in un colpo: { impostazioni: [...], squadre: [...], ... }
export async function leggiTutto() {
  const t = db.transaction(['impostazioni', ...ARCHIVI]);
  const righe = await Promise.all(['impostazioni', ...ARCHIVI].map(s => attendi(t.objectStore(s).getAll())));
  return Object.fromEntries(['impostazioni', ...ARCHIVI].map((s, i) => [s, righe[i]]));
}

// scrivi({ atleti: [obj] }, { quote: [id, id] }, svuota) — tutto nella stessa transazione
export function scrivi(salva = {}, cancella = {}, svuota = []) {
  const archivi = [...new Set([...Object.keys(salva), ...Object.keys(cancella), ...svuota])];
  return new Promise((ok, ko) => {
    const t = db.transaction(archivi, 'readwrite');
    for (const s of svuota) t.objectStore(s).clear();
    for (const [s, ids] of Object.entries(cancella)) for (const id of ids) t.objectStore(s).delete(id);
    for (const [s, righe] of Object.entries(salva)) for (const x of righe) t.objectStore(s).put(x);
    t.oncomplete = () => ok();
    t.onerror = () => ko(t.error);
    t.onabort = () => ko(t.error || new Error('Salvataggio non riuscito'));
  });
}

// --- Crittografia ---
const testo = new TextEncoder();
const casuale = n => crypto.getRandomValues(new Uint8Array(n));
const base64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
const daBase64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const materiale = segreto => crypto.subtle.importKey('raw', testo.encode(segreto), 'PBKDF2', false, ['deriveBits', 'deriveKey']);

export async function impronta(pin, sale) {
  const bit = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: daBase64(sale), iterations: 150000 }, await materiale(pin), 256);
  return base64(new Uint8Array(bit));
}
export const nuovoSale = () => base64(casuale(16));

async function chiave(password, sale) {
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: sale, iterations: 300000 }, await materiale(password),
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function cifra(contenuto, password) {
  const sale = casuale(16), iv = casuale(12);
  const dati = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await chiave(password, sale), testo.encode(JSON.stringify(contenuto)));
  return { formato: 'gestionale-basket-backup', versione: 1, sale: base64(sale), iv: base64(iv), dati: base64(new Uint8Array(dati)) };
}
export async function decifra(file, password) {
  if (file?.formato !== 'gestionale-basket-backup') throw new Error('Il file non è un backup del gestionale');
  try {
    const chiaro = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: daBase64(file.iv) }, await chiave(password, daBase64(file.sale)), daBase64(file.dati));
    return JSON.parse(new TextDecoder().decode(chiaro));
  } catch {
    throw new Error('Password errata o file danneggiato');
  }
}
