(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var state = { il: null, data: null, ilce: '', pos: null };
  var KEY = 'nobetci-il';

  // Android uygulamasının (APK) içinde çalışıyorsa nöbet listeleri canlı siteden çekilir.
  var IN_APP = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  var DATA_BASE = IN_APP ? 'https://enskygr234.github.io/Nobet-ecza/' : '';
  if (IN_APP) document.documentElement.classList.add('in-app');

  var dateFmt = new Intl.DateTimeFormat('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
  var timeFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  $('today').textContent = dateFmt.format(new Date());

  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

  function setStatus(text, err) {
    var s = $('status');
    s.textContent = text;
    s.classList.toggle('err', !!err);
  }

  function km(a, b) {
    var R = 6371, r = Math.PI / 180;
    var dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(x));
  }

  function telHref(t) {
    var d = String(t || '').replace(/[^\d+]/g, '');
    if (!d) return '';
    if (d.charAt(0) !== '+' && d.charAt(0) !== '0') d = '0' + d;
    return 'tel:' + d;
  }

  function routeHref(e) {
    if (e.lat != null && e.lng != null) {
      return 'https://www.google.com/maps/dir/?api=1&destination=' + e.lat + ',' + e.lng;
    }
    var q = [e.ad, e.adres, e.ilce, state.data && state.data.il].filter(Boolean).join(', ');
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
  }

  function render() {
    var list = $('list');
    var tpl = $('tpl');
    list.textContent = '';
    if (!state.data) return;

    var items = state.data.eczaneler.filter(function (e) { return !state.ilce || e.ilce === state.ilce; });

    if (state.pos) {
      items = items.map(function (e) {
        var d = (e.lat != null && e.lng != null) ? km(state.pos, e) : Infinity;
        return Object.assign({}, e, { _d: d });
      }).sort(function (a, b) { return a._d - b._d; });
    }

    var frag = document.createDocumentFragment();
    items.forEach(function (e) {
      var n = tpl.content.firstElementChild.cloneNode(true);
      n.querySelector('.ph-name').textContent = e.ad;
      n.querySelector('.ph-district').textContent = e.ilce || state.data.il;
      n.querySelector('.ph-addr').textContent = e.adres || 'Adres bilgisi yok';
      if (e.tarif) {
        var note = n.querySelector('.ph-note');
        note.textContent = e.tarif;
        note.hidden = false;
      }
      if (state.pos && isFinite(e._d)) {
        var dist = n.querySelector('.ph-dist');
        dist.textContent = e._d < 1 ? Math.round(e._d * 1000) + ' m' : e._d.toFixed(1).replace('.', ',') + ' km';
        dist.hidden = false;
      }
      var call = n.querySelector('.call');
      var href = telHref(e.telefon);
      if (href) {
        call.href = href;
        call.querySelector('.call-num').textContent = e.telefon;
        call.setAttribute('aria-label', e.ad + ' ara: ' + e.telefon);
      } else {
        call.setAttribute('aria-disabled', 'true');
        call.querySelector('.call-num').textContent = 'Telefon yok';
      }
      var route = n.querySelector('.route');
      route.href = routeHref(e);
      route.setAttribute('aria-label', e.ad + ' için yol tarifi');
      frag.appendChild(n);
    });
    list.appendChild(frag);

    $('empty').hidden = items.length > 0;
    if (!items.length) {
      $('emptyTitle').textContent = state.data.eczaneler.length ? 'Bu ilçe için kayıt yok' : 'Bu il için şu an nöbet kaydı yok';
      $('emptyText').textContent = state.data.eczaneler.length ? 'Tüm ilçeleri seçip yakındaki eczanelere bakabilirsin.' : 'Liste birazdan güncellenebilir. Acil durumda 112\'yi ara.';
    }

    var when = state.data.updatedAt ? ' · Güncellendi: ' + timeFmt.format(new Date(state.data.updatedAt)) : '';
    setStatus(items.length + ' nöbetçi eczane' + (state.pos ? ', yakından uzağa' : '') + when);
    onlineNote();
  }

  function fillIlce() {
    var sel = $('ilce');
    var seen = {};
    sel.textContent = '';
    sel.appendChild(new Option('Tüm ilçeler', ''));
    state.data.eczaneler.forEach(function (e) {
      if (e.ilce && !seen[e.ilce]) { seen[e.ilce] = 1; }
    });
    Object.keys(seen).sort(function (a, b) { return a.localeCompare(b, 'tr'); }).forEach(function (i) {
      sel.appendChild(new Option(i, i));
    });
    state.ilce = '';
  }

  function show(d) {
    state.data = { il: d.il, updatedAt: d.updatedAt, eczaneler: d.eczaneler || [] };
    $('sample').hidden = !d.sample;
    fillIlce();
    render();
  }

  function loadIl(slug) {
    state.il = slug;
    state.data = null;
    store(KEY, slug);
    $('list').textContent = '';
    $('empty').hidden = true;
    setStatus('Nöbet listesi yükleniyor…');
    fetch(DATA_BASE + 'data/il/' + slug + '.json', { cache: 'no-cache' })
      .then(function (r) {
        if (r.status === 404) throw new Error('none');
        if (!r.ok) throw new Error('http');
        return r.json();
      })
      .then(function (d) {
        if (state.il !== slug) return;
        store('liste-' + slug, JSON.stringify(d));
        show(d);
      })
      .catch(function (e) {
        if (state.il !== slug) return;
        var cached = null;
        try { cached = JSON.parse(store('liste-' + slug) || 'null'); } catch (x) { cached = null; }
        if (cached && e.message !== 'none') {
          show(cached);
          setStatus('İnternet yok. Son kaydedilen liste gösteriliyor, nöbet değişmiş olabilir.', true);
          return;
        }
        $('sample').hidden = true;
        $('ilce').textContent = '';
        $('ilce').appendChild(new Option('Tüm ilçeler', ''));
        setStatus(e.message === 'none' ? 'Bu il için henüz nöbet listesi yok. İlk güncellemeden sonra burada görünecek.' : 'Liste yüklenemedi. İnternet bağlantını kontrol edip sayfayı yenile.', true);
      });
  }

  function near() {
    var btn = $('near');
    if (state.pos) {
      state.pos = null;
      btn.setAttribute('aria-pressed', 'false');
      render();
      return;
    }
    if (!navigator.geolocation) { setStatus('Tarayıcın konum özelliğini desteklemiyor.', true); return; }
    setStatus('Konumun alınıyor…');
    navigator.geolocation.getCurrentPosition(function (p) {
      state.pos = { lat: p.coords.latitude, lng: p.coords.longitude };
      btn.setAttribute('aria-pressed', 'true');
      render();
    }, function () {
      setStatus('Konum alınamadı. Tarayıcı ayarlarından bu siteye konum izni ver ya da ilçe seç.', true);
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 });
  }

  // Uygulama (PWA): çevrimdışı çalışma ve ana ekrana ekleme
  if (!IN_APP && 'serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }

  // Android/Chrome: "Uygulamayı yükle" butonu
  var installEvt = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    installEvt = e;
    $('install').hidden = false;
  });
  $('install').addEventListener('click', function () {
    if (!installEvt) return;
    installEvt.prompt();
    installEvt.userChoice.finally(function () { installEvt = null; $('install').hidden = true; });
  });
  window.addEventListener('appinstalled', function () { $('install').hidden = true; });

  // Çevrimdışıyken haber ver
  function onlineNote() {
    if (!navigator.onLine && state.data) setStatus('İnternet yok. Son kaydedilen liste gösteriliyor, nöbet değişmiş olabilir.', true);
  }
  window.addEventListener('offline', onlineNote);
  window.addEventListener('online', function () { if (state.il) loadIl(state.il); });

  $('il').addEventListener('change', function (e) { loadIl(e.target.value); });
  $('ilce').addEventListener('change', function (e) { state.ilce = e.target.value; render(); });
  $('near').addEventListener('click', near);
  $('near').setAttribute('aria-pressed', 'false');

  fetch('data/iller.json')
    .then(function (r) { return r.json(); })
    .then(function (iller) {
      var sel = $('il');
      iller.forEach(function (il) {
        sel.appendChild(new Option(String(il.plaka).padStart(2, '0') + ' · ' + il.ad, il.slug));
      });
      var saved = store(KEY);
      var start = iller.some(function (i) { return i.slug === saved; }) ? saved : 'istanbul';
      sel.value = start;
      loadIl(start);
    })
    .catch(function () { setStatus('İl listesi yüklenemedi. Sayfayı yenile.', true); });
})();
