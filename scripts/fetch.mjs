// Nöbetçi eczane verisini API'den çekip data/il/<il>.json dosyalarına yazar.
// Node 20+ gerekir, ek paket gerekmez.
//
//   NOBETECZA_KEY=... node scripts/fetch.mjs            → 81 ilin hepsi
//   NOBETECZA_KEY=... node scripts/fetch.mjs --test istanbul
//        → tek il çeker, ham cevabı ve bulunan alanları ekrana yazar, dosya yazmaz.
//
// Anahtarın nasıl gönderileceği config/api.json içindeki "auth" ayarındadır:
//   { "type": "header", "name": "Authorization", "prefix": "Bearer " }   → Authorization: Bearer KEY
//   { "type": "header", "name": "x-api-key", "prefix": "" }              → x-api-key: KEY
//   { "type": "query",  "name": "apikey" }                                → ...?il=istanbul&apikey=KEY

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// GitHub Actions'ta mesajı, API'den de okunabilen bir not (annotation) olarak da yazar.
const esc = (s) => String(s).slice(0, 6000).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
function note(kind, title, text) {
  if (process.env.GITHUB_ACTIONS) console.log(`::${kind} title=${title}::${esc(text)}`);
}

// API alan adları bilinmediği için yaygın adları sırayla dener.
// config/api.json → fields içine bir ad yazılırsa önce o kullanılır ("konum.lat" gibi iç içe yol da olur).
const CANDIDATES = {
  ad: ['ad', 'adi', 'isim', 'name', 'eczane', 'eczaneAdi', 'eczane_adi', 'pharmacyName', 'title', 'unvan'],
  ilce: ['ilce', 'ilceAdi', 'ilce_adi', 'district', 'dist', 'semt', 'county', 'town'],
  adres: ['adres', 'address', 'acikAdres', 'acik_adres', 'fullAddress'],
  telefon: ['telefon', 'tel', 'phone', 'telefonNo', 'telefon_no', 'phoneNumber', 'gsm'],
  lat: ['lat', 'latitude', 'enlem', 'y', 'konum.lat', 'location.lat', 'loc.lat', 'koordinat.lat'],
  lng: ['lng', 'lon', 'long', 'longitude', 'boylam', 'x', 'konum.lng', 'konum.lon', 'location.lng', 'location.lon', 'loc.lng'],
  tarif: ['tarif', 'adresTarifi', 'adres_tarifi', 'directions', 'aciklama', 'description', 'not']
};

function getPath(obj, p) {
  if (!p) return undefined;
  return String(p).split('.').reduce((o, k) => {
    if (o == null || typeof o !== 'object') return undefined;
    if (k in o) return o[k];
    const hit = Object.keys(o).find((x) => x.toLowerCase() === k.toLowerCase());
    return hit ? o[hit] : undefined;
  }, obj);
}

// Cevabın içindeki ilk "nesne dizisini" bulur: [..], {data:[..]}, {result:{items:[..]}} vb.
export function findList(body, depth = 0) {
  if (Array.isArray(body)) return body.length && typeof body[0] === 'object' ? body : body.length === 0 ? body : null;
  if (!body || typeof body !== 'object' || depth > 4) return null;
  for (const k of ['data', 'result', 'results', 'items', 'eczaneler', 'pharmacies', 'list']) {
    const v = getPath(body, k);
    const r = v !== undefined ? findList(v, depth + 1) : null;
    if (r) return r;
  }
  for (const v of Object.values(body)) {
    const r = findList(v, depth + 1);
    if (r) return r;
  }
  return null;
}

export function detectFields(sample, overrides = {}) {
  const map = {};
  for (const [key, list] of Object.entries(CANDIDATES)) {
    const tries = overrides[key] ? [overrides[key], ...list] : list;
    map[key] = tries.find((p) => {
      const v = getPath(sample, p);
      return v !== undefined && v !== null && v !== '' && typeof v !== 'object';
    }) || null;
  }
  // "41.01,28.97" gibi tek alanda koordinat
  if (!map.lat || !map.lng) {
    for (const p of ['konum', 'koordinat', 'location', 'coords', 'latlng']) {
      const v = getPath(sample, p);
      if (typeof v === 'string' && /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(v.trim())) { map.pair = p; break; }
    }
  }
  return map;
}

const clean = (v) => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim());
const num = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : null; };

export function normalize(list, map) {
  return list.map((r) => {
    let lat = num(getPath(r, map.lat));
    let lng = num(getPath(r, map.lng));
    if (map.pair) {
      const [a, b] = String(getPath(r, map.pair)).split(',').map(num);
      lat = a; lng = b;
    }
    // Türkiye sınırları dışında kalan koordinatı (ters yazılmış olabilir) düzelt ya da at
    const inLat = (v) => v > 35 && v < 43;
    if (lat != null && lng != null && !inLat(lat) && inLat(lng)) { const t = lat; lat = lng; lng = t; }
    if (!(lat > 35 && lat < 43 && lng > 25 && lng < 45.5)) { lat = null; lng = null; }
    const tel = clean(getPath(r, map.telefon));
    return {
      ad: clean(getPath(r, map.ad)),
      ilce: clean(getPath(r, map.ilce)),
      adres: clean(getPath(r, map.adres)),
      telefon: tel,
      lat, lng,
      tarif: clean(getPath(r, map.tarif))
    };
  }).filter((e) => e.ad);
}

async function callApi(cfg, key, ilSlug) {
  const u = new URL(cfg.url);
  u.searchParams.set(cfg.ilParam || 'il', ilSlug);
  const headers = { Accept: 'application/json', 'User-Agent': 'nobetci-eczane-site/1.0' };
  const a = cfg.auth || {};
  if (a.type === 'query') u.searchParams.set(a.name || 'apikey', key);
  else headers[a.name || 'Authorization'] = (a.prefix ?? 'Bearer ') + key;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), cfg.timeoutMs || 20000);
  try {
    const res = await fetch(u, { headers, signal: ctrl.signal });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    try { return JSON.parse(text); } catch { throw new Error('Cevap JSON değil: ' + text.slice(0, 200)); }
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  // Yapıştırırken araya girmiş boşluk, tırnak veya "X-API-Key:" yazısını temizle
  const key = String(process.env.NOBETECZA_KEY || '')
    .replace(/^\s*(x-api-key\s*:)?\s*/i, '')
    .replace(/["'\s]/g, '');
  if (!key) { console.error('NOBETECZA_KEY tanımlı değil (GitHub → Settings → Secrets → Actions).'); note('error', 'Anahtar', 'NOBETECZA_KEY tanimli degil'); process.exit(1); }

  const cfg = JSON.parse(await readFile(path.join(root, 'config', 'api.json'), 'utf8'));
  const iller = JSON.parse(await readFile(path.join(root, 'data', 'iller.json'), 'utf8'));
  const ti = process.argv.indexOf('--test');

  if (ti > -1) {
    const slug = process.argv[ti + 1] || 'istanbul';
    note('notice', 'Anahtar', 'Uzunluk: ' + key.length + ', baslangic: ' + key.slice(0, 5) + '..., bitis: ...' + key.slice(-4));
    const body = await callApi(cfg, key, slug);
    const raw = JSON.stringify(body, null, 1).slice(0, 2500);
    console.log('--- Ham cevabın başı ---\n' + raw);
    note('notice', 'Ham cevap', raw);
    const list = findList(body);
    if (!list) { note('error', 'Test', 'Cevapta eczane listesi bulunamadı.'); console.error('Cevapta eczane listesi bulunamadı.'); process.exit(1); }
    const map = detectFields(list[0] || {}, cfg.fields);
    const first = normalize(list, map).slice(0, 2);
    console.log('--- Bulunan alanlar ---\n', map);
    console.log('--- İlk 2 kayıt (sitede görünecek hali) ---\n', first);
    note('notice', 'Sonuc', 'Kayit sayisi: ' + list.length + '\nAlanlar: ' + JSON.stringify(map) + '\nIlk kayitlar: ' + JSON.stringify(first));
    return;
  }

  await mkdir(path.join(root, 'data', 'il'), { recursive: true });
  const now = new Date().toISOString();
  let ok = 0, fail = 0, map = null;

  for (const il of iller) {
    try {
      const body = await callApi(cfg, key, il.slug);
      const list = findList(body);
      if (!list) throw new Error('eczane listesi bulunamadı');
      if (!map && list.length) map = detectFields(list[0], cfg.fields);
      const eczaneler = map ? normalize(list, map) : [];
      if (list.length && !eczaneler.length) throw new Error('kayıtlarda eczane adı okunamadı');
      eczaneler.sort((a, b) => a.ilce.localeCompare(b.ilce, 'tr') || a.ad.localeCompare(b.ad, 'tr'));
      await writeFile(
        path.join(root, 'data', 'il', il.slug + '.json'),
        JSON.stringify({ il: il.ad, updatedAt: now, sample: false, eczaneler }) + '\n'
      );
      ok++;
      console.log(`✓ ${il.ad}: ${eczaneler.length}`);
    } catch (e) {
      fail++;
      console.error(`✗ ${il.ad}: ${e.message}`); // eski dosya yerinde kalır
      if (fail <= 3) note('warning', il.ad, e.message);
    }
    await sleep(cfg.delayMs ?? 800);
  }

  console.log(`Bitti: ${ok} il güncellendi, ${fail} il hata verdi.`);
  if (map) console.log('Kullanılan alanlar:', map);
  if (!ok) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error('Hata: ' + e.message); note('error', 'Hata', e.message); process.exitCode = 1; });
}
