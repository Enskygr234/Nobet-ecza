# Nöbetçi Eczane

Türkiye'nin 81 ilinde nöbetçi eczaneleri gösteren statik site. GitHub Pages'te ücretsiz çalışır.

```
NöbetEcza API  →  GitHub Actions (günde 2 kez)  →  data/il/<il>.json  →  Site
```

- API anahtarı **hiçbir zaman sitenin koduna yazılmaz**, GitHub Secrets içinde durur. Ziyaretçiler anahtarı göremez.
- Site sadece `data/il/` içindeki dosyaları okur.
- Bir il çekilemezse o ilin eski listesi silinmez, yerinde kalır.
- Şu an sadece `data/il/istanbul.json` var ve içindeki veriler **örnektir**. Sitede bunu belirten bir uyarı görünür.

## Kurulum

1. GitHub'da yeni bir depo aç ve bu klasördeki tüm dosyaları yükle (`.github` klasörü dahil).
2. **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `NOBETECZA_KEY`
   - Secret: API anahtarın
3. **Settings → Pages → Source: Deploy from a branch**, branch `main`, klasör `/ (root)`.
4. **Actions → Nöbet listesini güncelle → Run workflow**. `test_il` kutusuna `istanbul` yaz ve çalıştır.
   Kayıtlarda API'nin cevabı, bulunan alanlar ve sitede görünecek ilk 2 eczane yazar.
5. Test düzgünse aynı işi `test_il` kutusunu **boş** bırakarak tekrar çalıştır. 81 il çekilir ve site güncellenir.

## Test hata verirse

**`HTTP 401` veya `HTTP 403`:** Anahtar yanlış biçimde gönderiliyor demektir. `config/api.json` içindeki `auth` ayarını API'nin dokümantasyonuna göre değiştir:

```json
"auth": { "type": "header", "name": "Authorization", "prefix": "Bearer " }   // Authorization: Bearer ANAHTAR
"auth": { "type": "header", "name": "x-api-key", "prefix": "" }              // x-api-key: ANAHTAR
"auth": { "type": "query",  "name": "apikey" }                                // ?il=istanbul&apikey=ANAHTAR
```

**Eczane adı veya adres boş geliyorsa:** Kayıtlarda yazan ham cevaba bak ve `config/api.json` → `fields` içine doğru alan adlarını yaz. Örneğin `"ad": "eczaneAdi"`. İç içe alanlar da yazılabilir: `"lat": "konum.enlem"`.

**İl adı farklı biçimde isteniyorsa:** API `istanbul` yerine plaka (`34`) ya da `İstanbul` istiyorsa `data/iller.json` içindeki `slug` değerleri buna göre değiştirilmeli. Bu durumda bana haber ver, ben düzenleyeyim.

## Güncelleme saatleri

`.github/workflows/guncelle.yml` dosyası her gün 08:47 ve 17:47'de (Türkiye saati) çalışır. 81 il, iller arasında 2 saniye beklenerek çekilir (hız sınırına takılırsa bekleyip tekrar dener); yani her çalıştırma 81 istek yapar. API'nin günlük istek sınırı varsa saatleri ona göre ayarla.

## Dosyalar

```
index.html                       Sayfa
assets/style.css                 Tasarım (açık ve koyu tema)
assets/app.js                    İl ve ilçe seçimi, yakınımdakiler, arama ve yol tarifi
data/iller.json                  81 il
data/il/<il>.json                Nöbet listeleri (otomatik yazılır)
config/api.json                  API adresi, anahtar biçimi, alan adları
scripts/fetch.mjs                Veri çekici (Node 20, paket gerekmez)
.github/workflows/guncelle.yml   Zamanlanmış güncelleme
```

## Yerelde deneme

```bash
python3 -m http.server 8000                                # http://localhost:8000
NOBETECZA_KEY=anahtarın node scripts/fetch.mjs --test istanbul
```

## Uygulama (PWA)

Site aynı zamanda telefona yüklenebilen bir uygulamadır:

- **Android (Chrome):** Sitenin üstünde "Uygulamayı yükle" butonu çıkar. Çıkmazsa menüden "Ana ekrana ekle"yi seç.
- **iPhone (Safari):** Paylaş → "Ana Ekrana Ekle".
- Son açılan nöbet listesi internet yokken de görünür.
- `index.html`, `assets/` veya `icons/` içindeki dosyalarda değişiklik yaptığında `sw.js` içindeki `VERSION` değerini artır (`v1` → `v2`), yüklü uygulamalar yeni sürümü alsın.

Play Store'a koymak istersen aynı kod Capacitor ile Android uygulamasına paketlenebilir.

## Android APK

`.github/workflows/apk.yml` site dosyaları her değiştiğinde APK'yı otomatik derler ve şu adrese koyar:

https://github.com/Enskygr234/nobet-ecza/releases/latest/download/nobetci-eczane.apk

Sitedeki "APK indir" butonu da bu adrese gider. Uygulama nöbet listesini canlı siteden çeker; günlük veri güncellemesi için APK'yı yeniden derlemek gerekmez. İnternet yokken son açılan liste gösterilir.

**İmza anahtarı:** Anahtar tanımlı değilse APK, her derlemede değişen geçici (debug) bir anahtarla imzalanır. Bu durumda yeni sürümü kurmak için eskisini silmek gerekebilir. Kalıcı anahtar için iki secret ekle:
`ANDROID_KEYSTORE_BASE64` (keystore dosyasının base64 hali, alias `nobetci`) ve `ANDROID_KEYSTORE_PASSWORD`.
Play Store'a koymak için de bu kalıcı anahtar gerekir.
