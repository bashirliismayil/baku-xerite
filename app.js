/* Bakı Xəritəsi — Mərhələ 1 (düzəliş 2: xəbərdarlıq cari görünən aktiv tile-lardan hesablanır)
 * Statik veb tətbiq: Leaflet 1.9.4 + OpenStreetMap standart xəritə tile-ları.
 * GPS, marşrut, server, hesab YOXDUR (bu mərhələdə qəsdən).
 * Köhnə Chromium (Tesla brauzeri) üçün ES5 sintaksisi saxlanılıb.
 */
(function () {
  'use strict';

  // ---------- Parametrlər ----------
  var CONFIG = {
    center: [40.3777, 49.8460],   // Bakı mərkəzi (Bulvar / İçərişəhər ətrafı)
    zoom: 13,
    minZoom: 3,
    maxZoom: 19,                  // OSM standart tile-ların maksimumu
    tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> töhfəçiləri',
    loadTimeoutMs: 15000          // hər loading cycle üçün ayrıca timeout
  };

  var TEXT = {
    loading:   'Xəritə yüklənir…',
    ok:        'Xəritə hazırdır',
    partial:   'Xəritənin bəzi hissələri yüklənmədi',
    offline:   'İnternet bağlantısı yoxdur',
    errTitle:  'Xəritə yüklənmədi',
    errNet:    'Xəritə serverinə qoşulmaq alınmadı. İnternet bağlantısını yoxlayın və “Yenidən yoxla” düyməsini basın.',
    errOffline:'Avtomobil hazırda internetə qoşulmayıb. Bağlantı bərpa olunanda “Yenidən yoxla” düyməsini basın.',
    errLib:    'Xəritə proqramı yüklənmədi. Səhifəni yeniləmək üçün “Yenidən yoxla” düyməsini basın.'
  };

  // ---------- DOM ----------
  var $ = function (id) { return document.getElementById(id); };
  var statusEl   = $('status');
  var statusIcon = statusEl.querySelector('.status__icon');
  var statusText = statusEl.querySelector('.status__text');
  var errorEl    = $('error');
  var errorTitle = $('error-title');
  var errorText  = $('error-text');
  var btnIn      = $('btn-zoom-in');
  var btnOut     = $('btn-zoom-out');
  var btnHome    = $('btn-home');
  var btnRetry   = $('btn-retry');
  var btnRetrySm = $('btn-retry-partial');

  var hideStatusTimer = null;

  // Status: həmişə işarə + mətn (yalnız rəng deyil)
  function setStatus(kind, text) {
    var icons = { loading: '⏳', ok: '✓', warn: '⚠', error: '✕' };
    clearTimeout(hideStatusTimer);
    statusEl.className = 'status status--' + kind;
    statusIcon.textContent = icons[kind] || '';
    statusText.textContent = text;
    btnRetrySm.hidden = (kind !== 'warn');      // partial xəbərdarlıqda “Yenidən yoxla”
    if (kind === 'ok') {
      hideStatusTimer = setTimeout(function () {
        statusEl.className = 'status status--ok status--hidden';
      }, 3000);
    }
  }

  function showError(message) {
    errorTitle.textContent = TEXT.errTitle;
    errorText.textContent = message;
    errorEl.hidden = false;
    setStatus('error', TEXT.errTitle);
    btnRetry.focus();
  }

  function hideError() { errorEl.hidden = true; }

  function netErrorText() {
    return navigator.onLine === false ? TEXT.errOffline : TEXT.errNet;
  }

  // ---------- Leaflet yüklənməyibsə ----------
  if (typeof window.L === 'undefined') {
    showError(TEXT.errLib);
    btnRetry.addEventListener('click', function () { window.location.reload(); });
    btnIn.disabled = btnOut.disabled = btnHome.disabled = true;
    return;
  }

  // ---------- Xəritə ----------
  var map = L.map('map', {
    center: CONFIG.center,
    zoom: CONFIG.zoom,
    minZoom: CONFIG.minZoom,
    maxZoom: CONFIG.maxZoom,
    zoomControl: false,          // öz böyük düymələrimiz var
    attributionControl: true,
    tap: true,
    touchZoom: true,
    dragging: true,
    worldCopyJump: true
  });
  map.attributionControl.setPrefix(
    '<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>'
  );

  var tiles = L.tileLayer(CONFIG.tileUrl, {
    maxZoom: CONFIG.maxZoom,
    attribution: CONFIG.attribution,
    crossOrigin: false,
    keepBuffer: 4
  });

  /* ======================================================================
   * Loading-cycle nəzarəti
   *
   * Hər tile sorğusu ayrıca qeyd (record) kimi izlənir:
   *   records[açar] = { el: <img>, c: {x,y,z}, cycleId, state: 'pending'|'ok'|'error' }
   *
   * Cycle = bir "yüklənmə dövrü": öz sayğacları və öz 15 san timeout-u var.
   *   started / ok / error / cancelled, pending = records-da 'pending' olanlar.
   *
   * Yeni cycle nə vaxt başlayır:
   *   - aktiv cycle yoxdursa (əvvəlki bitib) və yeni tile sorğusu başlayırsa;
   *   - pan/zoom başlayıb (movestart) və ondan sonra ilk yeni sorğu gəlirsə;
   *   - “Yenidən yoxla” basılanda.
   * Yeni cycle başlayanda köhnə cycle-ın timeout-u ləğv olunur. Köhnə cycle-ın
   * hələ ekranda qalan pending sorğuları yeni cycle-a köçürülür (onlar cari
   * görünən sahəyə aiddir). Ekrandan çıxarılan sorğular 'cancelled' sayılır.
   *
   * Hər event yalnız o halda nəzərə alınır ki, record cari cycle-a aiddir və
   * event-in <img> elementi həmin record-un elementidir. Beləliklə köhnə
   * cycle-ın gecikmiş event-i yeni cycle-ın state-ini dəyişmir.
   * ====================================================================== */
  var records = {};          // açar -> record
  var cycle = null;          // cari cycle
  var cycleSeq = 0;
  var boundary = true;       // növbəti sorğu yeni cycle açmalıdır?

  function tileKey(c) { return c.z + ':' + c.x + ':' + c.y; }

  function countState(cycleId, state) {
    var n = 0, k;
    for (k in records) {
      if (records.hasOwnProperty(k) && records[k].cycleId === cycleId && records[k].state === state) n++;
    }
    return n;
  }

  // CARİ vəziyyət: hazırda layer-də olan (records-dan silinməmiş) tile-lar.
  //   visible.* — yalnız ekranın görünən sahəsi ilə kəsişən tile-lar (keepBuffer ilə
  //               ekrandan kənarda saxlananlar sayılmır);
  //   allPending — layer-də hələ cavab gözləyən bütün sorğular (cycle-ın bitməsi üçün).
  // Xəbərdarlıq YALNIZ bundan hesablanır; cycle.ok/error tarixçə sayğaclarıdır (diaqnostika).
  function activeState() {
    var s = { ok: 0, error: 0, pending: 0, allPending: 0 };
    var k, r, ts = 256, view = map.getBounds(), b;
    for (k in records) {
      if (!records.hasOwnProperty(k)) continue;
      r = records[k];
      if (r.state === 'pending') s.allPending++;
      b = L.latLngBounds(
        map.unproject([r.c.x * ts, r.c.y * ts], r.c.z),
        map.unproject([(r.c.x + 1) * ts, (r.c.y + 1) * ts], r.c.z)
      );
      if (view.intersects(b)) s[r.state]++;
    }
    return s;
  }

  function snapshot() {
    if (!cycle) return null;
    return {
      id: cycle.id,
      // tarixçə (diaqnostika üçün; qərarda istifadə olunmur)
      started: cycle.started,
      ok: cycle.ok,
      error: cycle.error,
      cancelled: cycle.cancelled,
      pending: countState(cycle.id, 'pending'),
      // cari vəziyyət (qərar bundan verilir)
      active: activeState(),
      timedOut: cycle.timedOut,
      finished: cycle.finished,
      result: cycle.result
    };
  }

  function startCycle() {
    if (cycle) clearTimeout(cycle.timer);
    var prev = cycle;
    cycleSeq++;
    cycle = {
      id: cycleSeq, started: 0, ok: 0, error: 0, cancelled: 0,
      timedOut: false, finished: false, result: 'loading', timer: null
    };
    boundary = false;

    // Köhnə cycle-ın ekranda qalan pending sorğularını yeni cycle-a köçür
    if (prev) {
      var k, r;
      for (k in records) {
        if (records.hasOwnProperty(k)) {
          r = records[k];
          if (r.cycleId === prev.id && r.state === 'pending') {
            r.cycleId = cycle.id;
            cycle.started++;
          }
        }
      }
    }

    var myId = cycle.id;
    cycle.timer = setTimeout(function () {
      if (!cycle || cycle.id !== myId) return;       // köhnə timer — yox say
      cycle.timedOut = true;
      evaluate();
    }, CONFIG.loadTimeoutMs);

    // Xəta paneli və ya partial xəbərdarlıq açıqdırsa, yeni cycle nəticə verənə qədər saxlanılır.
    // Əks halda 0.8 san sonra hələ yüklənirsə “yüklənir” göstərilir (hər pan-da yanıb-sönməsin deyə).
    setTimeout(function () {
      if (!cycle || cycle.id !== myId || cycle.finished || cycle.timedOut) return;
      var warnShown = statusEl.className.indexOf('status--warn') !== -1;
      if (errorEl.hidden && !warnShown) { setStatus('loading', TEXT.loading); shownResult = 'loading'; }
    }, 800);
  }

  var shownResult = 'loading';   // ekranda hazırda göstərilən nəticə (təkrar göstərməmək üçün)

  function applyResult(result) {
    cycle.result = result;
    if (result === shownResult) return;
    shownResult = result;
    if (result === 'error') {
      showError(netErrorText());
    } else if (result === 'partial') {
      hideError();
      setStatus('warn', TEXT.partial);
    } else if (result === 'ok') {
      hideError();
      setStatus('ok', TEXT.ok);
    }
  }

  // Nəticəni CARİ görünən aktiv tile vəziyyətlərindən hesabla.
  // Çağırılır: hər tileload/tileerror, hər tileunload/tileabort (istənilən vəziyyətdə),
  // cycle timeout-u və moveend (görünən sahə dəyişəndə).
  function evaluate() {
    if (!cycle) return;
    var a = activeState();

    if (a.allPending === 0 && !cycle.finished) {
      // Layer-də cavab gözləyən sorğu qalmayıb — cycle bitdi
      clearTimeout(cycle.timer);
      cycle.finished = true;
      boundary = true;                                  // növbəti sorğu yeni cycle açır
    }

    if (a.ok + a.error + a.pending === 0) return;      // görünən sahədə tile yoxdur — dəyişmə

    if (a.pending === 0) {
      // Görünən sahədə hər şey cavab verib
      if (a.error === 0)   applyResult('ok');           // warning/error təmizlənir
      else if (a.ok > 0)   applyResult('partial');
      else                 applyResult('error');
    } else if (cycle.timedOut) {
      // 15 san keçib, görünən sahədə hələ cavabsız sorğu var
      applyResult(a.ok > 0 ? 'partial' : 'error');
    }
    // Əks halda: timeout hələ bitməyib — gözləyirik
  }

  tiles.on('tileloadstart', function (e) {
    if (boundary || !cycle) startCycle();
    var key = tileKey(e.coords);
    var old = records[key];
    if (old && old.state === 'pending' && old.cycleId === cycle.id && old.el !== e.tile) {
      cycle.cancelled++;                                // eyni yer üçün köhnə sorğu əvəzləndi
    }
    records[key] = { el: e.tile, c: { x: e.coords.x, y: e.coords.y, z: e.coords.z }, cycleId: cycle.id, state: 'pending' };
    cycle.started++;
  });

  function finishTile(e, state) {
    var r = records[tileKey(e.coords)];
    if (!r || !cycle || r.el !== e.tile || r.state !== 'pending') return;   // köhnə/yad event
    if (r.cycleId !== cycle.id) return;                                     // köhnə cycle
    r.state = state;
    if (state === 'ok') cycle.ok++; else cycle.error++;
    evaluate();
  }

  tiles.on('tileload',  function (e) { finishTile(e, 'ok'); });
  tiles.on('tileerror', function (e) { finishTile(e, 'error'); });

  // Tile ekrandan çıxarıldı (pan/zoom/redraw) — artıq gözlənilmir
  function dropTile(e) {
    var key = tileKey(e.coords);
    var r = records[key];
    if (!r || r.el !== e.tile) return;
    delete records[key];
    if (cycle && r.cycleId === cycle.id && r.state === 'pending') cycle.cancelled++;
    evaluate();          // uğurlu, xətalı və ya pending — istənilən tile çıxanda yenidən hesabla
  }
  tiles.on('tileunload', dropTile);
  tiles.on('tileabort',  dropTile);

  // Pan və ya zoom başlayanda: növbəti yeni sorğu yeni cycle açır
  map.on('movestart zoomstart', function () { boundary = true; });

  tiles.addTo(map);   // listener-lər qoşulandan SONRA — ilk sorğular da izlənsin

  // Görünən sahə dəyişdi (tile event-i olmasa belə) — yenidən hesabla.
  // Layer-dən SONRA qeydiyyat: Leaflet yeni sorğuları yaratdıqdan sonra işləsin.
  map.on('moveend', evaluate);

  window.addEventListener('offline', function () { setStatus('warn', TEXT.offline); shownResult = 'offline'; });
  window.addEventListener('online',  function () { retry(); });

  // “Yenidən yoxla”: köhnə cycle və bütün köhnə sorğular atılır, yeni cycle başlayır.
  // Qeyd: tile-ları dərhal yenidən yaratmaq (tiles.redraw) kifayət etmir — Chromium eyni
  // ünvanlı yeni şəkil sorğusunu hələ cavabsız qalan köhnə sorğuya birləşdirir və yeni sorğu
  // serverə getmir. Ona görə layer çıxarılır (köhnə sorğular ləğv olunur) və qısa fasilədən
  // sonra yenidən əlavə edilir.
  var RETRY_GAP_MS = 300;
  var retryTimer = null;

  function retry() {
    if (retryTimer) return;                             // təkrar basma — artıq gedir
    if (cycle) { clearTimeout(cycle.timer); cycle = null; }
    records = {};          // köhnə sorğuların gecikmiş event-ləri artıq heç nəyə təsir etmir
    boundary = true;
    hideError();
    setStatus('loading', TEXT.loading);
    shownResult = 'loading';
    tiles.remove();
    retryTimer = setTimeout(function () {
      retryTimer = null;
      records = {};
      boundary = true;
      tiles.addTo(map);    // yeni sorğular → yeni cycle
    }, RETRY_GAP_MS);
  }

  // ---------- Düymələr ----------
  function updateZoomButtons() {
    btnIn.disabled  = map.getZoom() >= map.getMaxZoom();
    btnOut.disabled = map.getZoom() <= map.getMinZoom();
  }

  btnIn.addEventListener('click',  function () { map.zoomIn(1); });
  btnOut.addEventListener('click', function () { map.zoomOut(1); });
  btnHome.addEventListener('click', function () {
    map.setView(CONFIG.center, CONFIG.zoom, { animate: true });
  });
  btnRetry.addEventListener('click', retry);
  btnRetrySm.addEventListener('click', retry);
  map.on('zoomend', updateZoomButtons);

  // Brauzer pəncərə ölçüsü dəyişəndə xəritəni yenilə
  window.addEventListener('resize', function () { map.invalidateSize(); });

  updateZoomButtons();

  // Testlər üçün (istifadəçiyə təsir etmir)
  window.__bakuMap = { map: map, tiles: tiles, config: CONFIG, cycle: snapshot };
})();
