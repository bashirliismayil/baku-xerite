/* Bakı Xəritəsi — Mərhələ 2: brauzerin öz mövqe (geolocation) imkanı
 *
 * Yalnız brauzerin navigator.geolocation API-si istifadə olunur. Server, hesab,
 * telefonla qoşulma, saxta və ya simulyasiya edilmiş mövqe YOXDUR.
 * Mərhələ 1 kodu (app.js) dəyişdirilmir; bu fayl yalnız onun xəritəsinə qoşulur.
 * Köhnə Chromium (Tesla brauzeri) üçün ES5 sintaksisi.
 *
 * Əsas qaydalar:
 *  - İlk etibarlı və TƏZƏ koordinat gəlmədən işarə göstərilmir.
 *  - Ölçmə vaxtı (position.timestamp) 15 san-dən köhnədirsə, ölçmə canlı sayılmır:
 *      * gələn anda köhnədirsə (keş) — istifadə edilmir;
 *      * sonradan təzə ölçmə gəlmirsə — işarə “Köhnə mövqe” kimi göstərilir.
 *  - Eyni koordinatın təkrar gəlməsi normaldır (avtomobil dayanıb) — xəta sayılmır.
 *  - Ölçmə vaxtı (timestamp) yoxdursa, rəqəm deyilsə və ya 5 san-dən çox gələcəkdədirsə —
 *    ölçmənin təzəliyi sübut olunmur: nümunə rədd edilir, “indi” ilə əvəz EDİLMİR.
 *  - Son QƏBUL EDİLMİŞ təzə ölçmədən 10 san keçibsə (watch susur və ya yalnız rədd edilən
 *    nümunələr göndərir) getCurrentPosition({maximumAge:0}) ilə təzə ölçmə istənilir.
 *    Rədd edilən callback-lər bu sorğunu bloklamır. Sorğular arasında ən azı 10 san,
 *    eyni anda ən çox 1 açıq sorğu.
 */
(function () {
  'use strict';

  var VERSION = 'M2-diaqnostika1';

  var GEO = {
    staleMs: 15000,            // bu müddətdən köhnə ölçmə canlı sayılmır
    pollAfterMs: 10000,        // son qəbul edilmiş ölçmədən bu qədər sonra — təzə ölçmə sorğusu
    firstFixTimeoutMs: 30000,  // ilk təzə ölçmə bu müddətdə gəlmirsə — xəbərdarlıq
    followMinZoom: 16,         // ilk mərkəzləşdirmədə minimum zoom
    futureToleranceMs: 5000,   // timestamp bundan çox “gələcəkdə”dirsə — etibarsız, rədd edilir
    pollIntervalMs: 10000,     // təzələmə sorğuları arasında minimum fasilə
    watchOptions: { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    pollOptions:  { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
  };

  var T = {
    btnStart:      'Mövqeyimi göstər',
    searching:     'Mövqe axtarılır…',
    searchingHint: 'Brauzer icazə soruşarsa, “İcazə ver” seçin.',
    live:          'Canlı mövqe',
    stale:         'Köhnə mövqe — canlı deyil',
    staleHint:     'Son 15 saniyədə təzə ölçmə gəlməyib. Göstərilən yer köhnədir.',
    accuracy:      'Dəqiqlik: ',
    lastFix:       'Son ölçmə: ',
    followOn:      'Məni izlə: açıq',
    followOff:     'Məni izlə: dayandırılıb — qayıtmaq üçün “Mövqeyimi göstər” basın',
    cachedIgnored: 'Köhnə (yaddaşda saxlanmış) mövqe gəldi və istifadə edilmədi. Təzə ölçmə gözlənilir…',
    badTime:       'Mövqe gəldi, lakin ölçmə vaxtı etibarsızdır — istifadə edilmədi. Təzə ölçmə istənilir…',
    denied:        'Mövqe icazəsi verilmədi. Brauzerin parametrlərində bu sayt üçün mövqe (location) icazəsini açın və “Mövqeyimi göstər” düyməsini yenidən basın.',
    deniedTitle:   'Mövqe icazəsi yoxdur',
    unavailable:   'Mövqe hazırda müəyyən edilə bilmir. Açıq səmada olduğunuzu yoxlayın. Axtarış davam edir…',
    timeout:       'Mövqe vaxtında alınmadı. Axtarış davam edir…',
    firstTimeout:  'Mövqe hələ alınmayıb. GPS siqnalı zəif ola bilər. Axtarış davam edir…',
    unsupported:   'Bu brauzer mövqe funksiyasını dəstəkləmir.',
    insecure:      'Mövqe yalnız təhlükəsiz (https://) ünvanda işləyir.',
    noMap:         'Xəritə yüklənmədiyi üçün mövqe göstərilə bilmir.',
    errTitle:      'Mövqe göstərilə bilmir'
  };

  // ---------- DOM ----------
  var $ = function (id) { return document.getElementById(id); };
  var btnLocate = $('btn-locate');
  var btnStop   = $('btn-locate-stop');
  var btnClose  = $('btn-geo-close');
  var btnHome   = $('btn-home');
  var card      = $('geo-card');
  var cardIcon  = $('geo-icon');
  var cardTitle = $('geo-title');
  var cardLines = $('geo-lines');

  var app = window.__bakuMap;
  var map = app && app.map;

  // ---------- State ----------
  var session = 0;           // hər start/stop yeni sessiya: köhnə callback-lər yox sayılır
  var active = false;        // izləmə gedir?
  var follow = false;        // “Məni izlə” rejimi
  var watchId = null;
  var last = null;           // son QƏBUL edilmiş ölçmə {lat,lng,acc,measuredAt,receivedAt}
  var lastAcceptedAt = 0;    // son QƏBUL EDİLMİŞ təzə ölçmənin gəlmə anı (start-da start anı)
  var lastPollAt = 0;
  var pollSeq = 0;           // təzələmə sorğularının sayğacı (hər sorğuya ayrıca id)
  var currentPollId = 0;     // hazırda gözlənilən sorğunun id-si; 0 — açıq sorğu yoxdur
  var softError = null;      // izləməni dayandırmayan xəta mesajı
  var cachedNote = false;    // ilk fix-dən əvvəl keş ölçmə rədd edilib
  var badTimeNote = false;   // son nümunə etibarsız vaxta görə rədd edilib
  var fatal = null;          // izləməni dayandıran xəta {title,text,diag?}
  var sessionStartAt = 0;    // cari sessiyanın başlama anı (diaqnostika üçün)
  var sessionNo = 0;         // “Mövqeyimi göstər” ilə neçənci izləmə sessiyası (diaqnostika üçün)
  var diagSeq = 0;           // hər diaqnostika qeydinin öz nömrəsi (gecikmiş Permissions cavabı üçün)
  var centeredOnce = false;
  var tickTimer = null, firstFixTimer = null;
  var marker = null, circle = null;
  var stats = { accepted: 0, rejectedStale: 0, rejectedInvalid: 0, rejectedBadTime: 0, rejectedOutOfOrder: 0, polls: 0,
                pollsTimedOut: 0, ignoredLatePoll: 0 };

  // ---------- Köməkçilər ----------
  function now() { return Date.now(); }

  function fmtAge(ms) {
    var s = Math.max(0, Math.round(ms / 1000));
    if (s <= 1) return 'indicə';
    if (s < 60) return s + ' san əvvəl';
    var m = Math.floor(s / 60);
    if (m < 60) return m + ' dəq əvvəl';
    return Math.floor(m / 60) + ' saat əvvəl';
  }

  function fmtAcc(m) { return '±' + Math.round(m) + ' m'; }

  function isValidCoords(c) {
    if (!c) return false;
    var lat = c.latitude, lng = c.longitude, acc = c.accuracy;
    if (typeof lat !== 'number' || typeof lng !== 'number' || typeof acc !== 'number') return false;
    if (!isFinite(lat) || !isFinite(lng) || !isFinite(acc)) return false;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
    if (lat === 0 && lng === 0) return false;          // “boş” koordinat
    if (acc <= 0) return false;
    return true;
  }

  // Ölçmə vaxtı: position.timestamp. Etibarsızdırsa (yoxdur, rəqəm deyil, ≤0, 5 san-dən çox
  // gələcəkdə) — null: nümunə rədd edilir. Kiçik gələcək fərqi (≤5 san, yuvarlaqlaşdırma) — indi.
  function measuredTime(pos, t) {
    var ts = pos && pos.timestamp;
    if (typeof ts !== 'number' || !isFinite(ts) || ts <= 0) return null;
    if (ts > t + GEO.futureToleranceMs) return null;
    return Math.min(ts, t);
  }

  // Təzə ölçmə sorğusu: yalnız açıq sorğu yoxdursa və son sorğudan ≥10 san keçibsə
  // Hər sorğu öz id-si ilə göndərilir; callback yalnız id hələ də currentPollId-dirsə qəbul olunur.
  function requestFresh(t) {
    if (!active || currentPollId !== 0 || t - lastPollAt < GEO.pollIntervalMs) return;
    pollSeq++;
    currentPollId = pollSeq;
    lastPollAt = t;
    stats.polls++;
    navigator.geolocation.getCurrentPosition(onPosition(session, currentPollId), onError(session, currentPollId), GEO.pollOptions);
  }

  function isLive() { return !!last && (now() - last.measuredAt) <= GEO.staleMs; }

  // ---------- Xəritə qatları ----------
  function drawFix() {
    var ll = [last.lat, last.lng];
    if (!marker) {
      marker = L.marker(ll, {
        icon: L.divIcon({ className: 'geo-marker', html: '<div class="geo-dot"></div>', iconSize: [36, 36], iconAnchor: [18, 18] }),
        interactive: false, keyboard: false, zIndexOffset: 1000
      }).addTo(map);
      circle = L.circle(ll, { radius: last.acc, interactive: false, className: 'geo-acc' }).addTo(map);
    } else {
      marker.setLatLng(ll);
      circle.setLatLng(ll);
      circle.setRadius(last.acc);
    }
  }

  function removeLayers() {
    if (marker) { map.removeLayer(marker); marker = null; }
    if (circle) { map.removeLayer(circle); circle = null; }
  }

  function centerOnFix() {
    if (!last) return;
    var ll = [last.lat, last.lng];
    if (!centeredOnce) {
      map.setView(ll, Math.max(map.getZoom(), GEO.followMinZoom), { animate: false });
      centeredOnce = true;
    } else {
      map.panTo(ll, { animate: true, duration: 0.5 });
    }
  }

  // ---------- Görünüş ----------
  // Bütün mətnlər textContent ilə yazılır (brauzerin xəta mətni də) — HTML kimi şərh edilmir.
  function setCard(kind, icon, title, lines, showClose, diagLines) {
    card.hidden = false;
    card.className = 'geo-card geo-card--' + kind;
    cardIcon.textContent = icon;
    cardTitle.textContent = title;
    while (cardLines.firstChild) cardLines.removeChild(cardLines.firstChild);
    var i, p;
    for (i = 0; i < lines.length; i++) {
      p = document.createElement('div');
      p.className = 'geo-card__line';
      p.textContent = lines[i];
      cardLines.appendChild(p);
    }
    if (diagLines && diagLines.length) {
      var box = document.createElement('div');
      box.className = 'geo-card__diag';
      box.id = 'geo-diag';
      for (i = 0; i < diagLines.length; i++) {
        p = document.createElement('div');
        p.className = 'geo-card__diag-line';
        p.textContent = diagLines[i];
        box.appendChild(p);
      }
      cardLines.appendChild(box);
    }
    btnClose.hidden = !showClose;
  }

  // ---------- Diaqnostika (M2-diaqnostika1) ----------
  // Koordinat YAZILMIR, heç yerə göndərilmir — yalnız xəta kartında göstərilir.
  var CODE_NAMES = { 1: 'PERMISSION_DENIED', 2: 'POSITION_UNAVAILABLE', 3: 'TIMEOUT' };

  function fmtSec(ms) { return (Math.round(ms / 100) / 10).toFixed(1).replace('.', ',') + ' san'; }

  // stopInternal()-dən ƏVVƏL çağırılır: sessiya, sorğu və son ölçmə məlumatı hələ sıfırlanmayıb.
  function buildDiag(err, sid, pollId, t) {
    var msg = (err && err.message !== undefined && err.message !== null) ? String(err.message) : '';
    if (msg.length > 300) msg = msg.slice(0, 300) + '…';
    diagSeq++;
    return {
      seq: diagSeq,
      version: VERSION,
      source: pollId ? 'getCurrentPosition' : 'watchPosition',
      code: err ? err.code : undefined,
      message: msg,
      sessionId: sessionNo,             // sid yalnız callback yoxlaması üçündür; burada istifadəçi sessiyası
      pollId: pollId || 0,
      elapsedMs: t - sessionStartAt,
      lastFixAgeMs: last ? t - last.measuredAt : null,
      permission: 'yoxlanılır…'
    };
  }

  // Permissions API ilə icazə vəziyyəti. Cavab yalnız həmin diaqnostika hələ göstərilirsə yazılır.
  function queryPermission(d) {
    function apply(text) {
      if (fatal && fatal.diag && fatal.diag.seq === d.seq) { d.permission = text; render(); }
    }
    var perms = navigator.permissions;
    if (!perms || typeof perms.query !== 'function') { d.permission = 'Permissions API dəstəklənmir'; return; }
    try {
      perms.query({ name: 'geolocation' }).then(function (st) {
        apply(st && st.state ? String(st.state) : 'naməlum (cavabda state yoxdur)');
      }, function (e) {
        apply('Permissions API sorğusu uğursuz: ' + String((e && e.message) || e));
      });
    } catch (e) {
      d.permission = 'Permissions API sorğusu uğursuz: ' + String((e && e.message) || e);
    }
  }

  function diagLines(d) {
    var name = CODE_NAMES[d.code] ? ' (' + CODE_NAMES[d.code] + ')' : '';
    return [
      'Diaqnostika · versiya ' + d.version,
      'Mənbə: ' + d.source + (d.source === 'getCurrentPosition' ? ' (təzələmə sorğusu)' : ' (davamlı izləmə)'),
      'error.code: ' + String(d.code) + name,
      'error.message: ' + (d.message ? '“' + d.message + '”' : '(boş)'),
      'Sessiya: #' + d.sessionId + ' · Sorğu: ' + (d.pollId ? '#' + d.pollId : '— (watch)'),
      'Sessiya başlayandan: ' + fmtSec(d.elapsedMs),
      'Son uğurlu ölçmənin yaşı: ' + (d.lastFixAgeMs === null ? 'uğurlu ölçmə olmayıb' : fmtSec(d.lastFixAgeMs)),
      'İcazə (Permissions API): ' + d.permission
    ];
  }

  function render() {
    btnStop.hidden = !active;

    if (!active) {
      if (fatal) setCard('error', '✕', fatal.title, [fatal.text], true,
                         fatal.diag ? diagLines(fatal.diag) : ['Versiya: ' + VERSION]);
      else card.hidden = true;
      return;
    }

    if (!last) {
      var lines = [T.searchingHint];
      if (cachedNote) lines.push(T.cachedIgnored);
      if (badTimeNote) lines.push(T.badTime);
      if (softError) lines.push(softError);
      setCard(softError ? 'warn' : 'wait', softError ? '⚠' : '⏳', T.searching, lines, false);
      return;
    }

    var live = isLive();
    var age = now() - last.measuredAt;
    var info = [
      T.accuracy + fmtAcc(last.acc),
      T.lastFix + fmtAge(age),
      follow ? T.followOn : T.followOff
    ];
    if (!live) info.unshift(T.staleHint);
    if (badTimeNote) info.push(T.badTime);
    if (softError) info.push(softError);

    if (live) setCard('live', '●', T.live, info, false);
    else      setCard('stale', '⚠', T.stale, info, false);

    if (marker) {
      var el = marker.getElement();
      if (el) {
        if (live) L.DomUtil.removeClass(el, 'geo-marker--stale');
        else      L.DomUtil.addClass(el, 'geo-marker--stale');
      }
      var cel = circle.getElement && circle.getElement();
      if (cel) {
        if (live) L.DomUtil.removeClass(cel, 'geo-acc--stale');
        else      L.DomUtil.addClass(cel, 'geo-acc--stale');
      }
    }
  }

  // ---------- Geolocation callback-ləri ----------
  // pollId: 0 — watchPosition callback-i; >0 — həmin id-li getCurrentPosition sorğusu.
  // Sorğu callback-i yalnız onun id-si hələ cari sorğu id-sidirsə emal olunur. Timeout nəzarəti
  // sorğunu bitmiş sayıbsa (id etibarsızlaşdırılıb) və ya sessiya dəyişibsə — tamamilə yox sayılır.
  function acceptPollCallback(pollId) {
    if (!pollId) return true;                         // watch callback-i
    if (pollId !== currentPollId) { stats.ignoredLatePoll++; return false; }
    currentPollId = 0;                                // bu sorğu bitdi
    return true;
  }

  function onPosition(sid, pollId) {
    return function (pos) {
      if (sid !== session || !active) return;          // köhnə sessiya — yox say
      if (!acceptPollCallback(pollId)) return;         // köhnə (etibarsızlaşdırılmış) sorğu — yox say
      var t = now();
      // Rədd edilən nümunə lastAcceptedAt-ı YENİLƏMİR → təzələmə sorğusu bloklanmır.

      if (!isValidCoords(pos && pos.coords)) { stats.rejectedInvalid++; requestFresh(t); render(); return; }

      var measuredAt = measuredTime(pos, t);
      if (measuredAt === null) {                        // vaxt etibarsız — təzəlik sübut olunmur
        stats.rejectedBadTime++;
        badTimeNote = true;
        requestFresh(t);
        render();
        return;
      }
      if (t - measuredAt > GEO.staleMs) {               // keş / köhnə ölçmə — canlı kimi göstərilmir
        stats.rejectedStale++;
        if (!last) cachedNote = true;
        requestFresh(t);
        render();
        return;
      }
      if (last && measuredAt < last.measuredAt) {       // sıradan çıxmış köhnə ölçmə
        stats.rejectedOutOfOrder++;
        render();
        return;
      }

      // Qəbul (eyni koordinat təkrar gəlsə də — bu normaldır)
      last = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        acc: pos.coords.accuracy,
        measuredAt: measuredAt,
        receivedAt: t
      };
      stats.accepted++;
      lastAcceptedAt = t;
      softError = null;
      cachedNote = false;
      badTimeNote = false;
      if (firstFixTimer) { clearTimeout(firstFixTimer); firstFixTimer = null; }
      drawFix();
      if (follow) centerOnFix();
      render();
    };
  }

  function onError(sid, pollId) {
    return function (err) {
      if (sid !== session || !active) return;
      if (!acceptPollCallback(pollId)) return;         // köhnə sorğunun gecikmiş xətası — yox say
      var code = err && err.code;
      if (code === 1) {                                 // PERMISSION_DENIED — izləmə dayanır
        var d = buildDiag(err, sid, pollId, now());     // vəziyyət sıfırlanmazdan ƏVVƏL
        stopInternal();
        fatal = { title: T.deniedTitle, text: T.denied, diag: d };
        queryPermission(d);
        render();
        return;
      }
      if (pollId) { render(); return; }                 // təzələmə sorğusunun xətası — səssiz
      softError = (code === 3) ? T.timeout : T.unavailable;
      render();
    };
  }

  // ---------- Dövri yoxlama (hər saniyə) ----------
  function tick() {
    if (!active) return;
    var t = now();
    // Brauzer sorğuya heç cavab verməsə — öz timeout-undan 2 san sonra bitmiş say və id-sini
    // etibarsızlaşdır: həmin sorğunun gecikmiş callback-ləri artıq heç nəyi dəyişməyəcək.
    if (currentPollId !== 0 && t - lastPollAt > GEO.pollOptions.timeout + 2000) {
      stats.pollsTimedOut++;
      currentPollId = 0;
    }
    // Son qəbul edilmiş təzə ölçmədən 10 san keçib — təzə ölçmə istə (maximumAge: 0 → keş yox)
    if (t - lastAcceptedAt >= GEO.pollAfterMs) requestFresh(t);
    render();
  }

  // ---------- Başlat / dayandır ----------
  function start() {
    if (!map) { fatal = { title: T.errTitle, text: T.noMap }; render(); return; }
    if (!navigator.geolocation) { fatal = { title: T.errTitle, text: T.unsupported }; render(); return; }
    if (window.isSecureContext === false) { fatal = { title: T.errTitle, text: T.insecure }; render(); return; }

    if (active) {                    // artıq izlənir: “Məni izlə”-ni bərpa et və mərkəzləşdir
      follow = true;
      if (last) centerOnFix();
      render();
      return;
    }

    session++;
    var sid = session;
    active = true;
    follow = true;
    fatal = null;
    softError = null;
    cachedNote = false;
    badTimeNote = false;
    last = null;
    centeredOnce = false;
    lastAcceptedAt = now();
    sessionStartAt = now();
    sessionNo++;
    lastPollAt = now();
    currentPollId = 0;

    watchId = navigator.geolocation.watchPosition(onPosition(sid, 0), onError(sid, 0), GEO.watchOptions);
    firstFixTimer = setTimeout(function () {
      firstFixTimer = null;
      if (sid === session && active && !last) { softError = T.firstTimeout; render(); }
    }, GEO.firstFixTimeoutMs);
    tickTimer = setInterval(tick, 1000);
    render();
  }

  function stopInternal() {
    session++;                       // gecikmiş callback-lər artıq heç nəyə təsir etmir
    if (watchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
    if (firstFixTimer) { clearTimeout(firstFixTimer); firstFixTimer = null; }
    active = false;
    follow = false;
    last = null;
    softError = null;
    cachedNote = false;
    badTimeNote = false;
    currentPollId = 0;
    removeLayers();
  }

  function stop() {
    stopInternal();
    fatal = null;
    render();
  }

  // ---------- Düymələr və xəritə hadisələri ----------
  btnLocate.addEventListener('click', start);
  btnStop.addEventListener('click', stop);
  btnClose.addEventListener('click', function () { fatal = null; render(); });

  if (map) {
    // İstifadəçi xəritəni əl ilə sürüşdürür — “Məni izlə” dayanır
    map.on('dragstart', function () {
      if (active && follow) { follow = false; render(); }
    });
    // “Bakıya qayıt” da izləməni dayandırır (yoxsa növbəti ölçmə xəritəni geri çəkərdi)
    if (btnHome) btnHome.addEventListener('click', function () {
      if (active && follow) { follow = false; render(); }
    });
  } else {
    btnLocate.disabled = true;
  }

  // Testlər üçün vəziyyət (istifadəçiyə təsir etmir, mövqe yaratmır)
  window.__bakuGeo = {
    config: GEO,
    state: function () {
      return {
        version: VERSION,
        diag: fatal && fatal.diag ? JSON.parse(JSON.stringify(fatal.diag)) : null,
        active: active, follow: follow, watching: watchId !== null,
        hasFix: !!last, live: isLive(),
        fix: last ? { lat: last.lat, lng: last.lng, acc: last.acc, measuredAt: last.measuredAt } : null,
        markerShown: !!marker, circleRadius: circle ? circle.getRadius() : null,
        softError: softError, fatal: fatal ? fatal.text : null,
        stats: { accepted: stats.accepted, rejectedStale: stats.rejectedStale, rejectedInvalid: stats.rejectedInvalid, rejectedBadTime: stats.rejectedBadTime,
                 rejectedOutOfOrder: stats.rejectedOutOfOrder, polls: stats.polls,
                 pollsTimedOut: stats.pollsTimedOut, ignoredLatePoll: stats.ignoredLatePoll },
        currentPollId: currentPollId
      };
    }
  };
})();
