# Bakı Xəritəsi — Mərhələ 2, düzəliş 2 (brauzer mövqeyi): texniki qeyd (yoxlayıcı üçün)

Mərhələ 1 (düzəliş 2) qəbul edilib; aşağıda əvvəlcə Mərhələ 2, sonra dəyişməyən Mərhələ 1 məntiqi təsvir olunur.

## Mərhələ 2: brauzerin öz mövqe imkanı (`geo.js`)
- Yalnız `navigator.geolocation` (watchPosition + təzələmə üçün getCurrentPosition). Server, hesab, telefonla qoşulma,
  Waze API, saxta/simulyasiya edilmiş mövqe YOXDUR. Mərhələ 1 kodu (`app.js`) məntiq baxımından dəyişməyib
  (yalnız `window.__bakuMap` şərhi yeniləndi); `geo.js` həmin obyektdəki xəritəyə qoşulur.
- watchPosition parametrləri: `enableHighAccuracy:true, maximumAge:0, timeout:20000`.
- **Qəbul qaydaları** (hər callback):
  1. Etibarsız koordinat rədd: NaN/sonsuz, enlik ∉[-90,90], uzunluq ∉[-180,180], (0,0), dəqiqlik ≤0 və ya yoxdur.
  2. Ölçmə vaxtı = `position.timestamp`. **Düzəliş 1:** timestamp yoxdur / rəqəm deyil / NaN / ≤0 / 5 san-dən çox
     gələcəkdədirsə — nümunə **rədd edilir** (“indi” ilə əvəz edilmir, canlı sayılmır), kartda “ölçmə vaxtı
     etibarsızdır” yazılır və təzə ölçmə istənilir. ≤5 san gələcək fərqi (yuvarlaqlaşdırma) “indi”yə endirilir.
  3. Ölçmə gələn anda 15 san-dən köhnədirsə (keş) — rədd; ilk fix-dən əvvəldirsə kartda “istifadə edilmədi” yazılır.
  4. Ölçmə vaxtı son qəbul ediləndən köhnədirsə (sıradan çıxmış) — rədd.
  5. Əks halda qəbul — **eyni koordinatın təkrarı da qəbul edilir** (xəta sayılmır), yaşı sıfırlanır.
- **İşarə:** ilk qəbul edilmiş təzə ölçmədən əvvəl işarə yoxdur. `L.marker` (divIcon) + `L.circle` (radius = accuracy m).
- **Canlı/köhnə:** hər saniyə `now − measuredAt` yoxlanır. ≤15 san → “● Canlı mövqe”; >15 san → “⚠ Köhnə mövqe — canlı deyil”,
  işarə boz, içi boş, qırıq xətt + “!”, dairə boz qırıq xətt, kart qırıq çərçivə. Kartda dəqiqlik (±N m) və ölçmənin yaşı.
- **Təzələmə sorğusu (düzəliş 1):** qərar son **qəbul edilmiş** təzə ölçməyə (`lastAcceptedAt`) əsaslanır; rədd edilən
  callback-lər (köhnə, etibarsız vaxt, etibarsız koordinat) onu yeniləmir, əksinə dərhal `requestFresh()` çağırır.
  `requestFresh()`: `getCurrentPosition({maximumAge:0, timeout:10000})`, yalnız açıq sorğu yoxdursa və son sorğudan
  ≥10 san keçibsə (tezlik və paralel sorğu məhdudiyyəti). `tick()` hər saniyə: son qəbuldan ≥10 san → `requestFresh()`.
  Cavabsız sorğu 12 san sonra bitmiş sayılır.
- **Sorğu identifikatoru (düzəliş 2):** hər `getCurrentPosition` sorğusu ardıcıl id alır (`pollSeq`), cari sorğu
  `currentPollId`-də saxlanılır (0 — açıq sorğu yoxdur). Callback-lər id ilə bağlanır: `onPosition(session, pollId)`,
  `onError(session, pollId)`; watch callback-ləri `pollId = 0`. Callback yalnız `pollId === currentPollId` olduqda
  emal olunur və sorğunu bitirir (`currentPollId = 0`). Timeout nəzarəti sorğunu bitmiş sayanda `currentPollId = 0`
  edir — həmin id etibarsızlaşır; onun gecikmiş uğur və xəta callback-ləri (o cümlədən PERMISSION_DENIED) heç bir
  vəziyyəti dəyişmir (`stats.ignoredLatePoll`). İcazə rəddi watch callback-i ilə ayrıca tutulur. Yeni sorğu yalnız
  `currentPollId === 0` və son sorğudan ≥10 san keçibsə göndərilir. Səbəb: bəzi brauzerlər mövqe dəyişmirsə watch-u susdurur və ya
  köhnə nümunələri təkrar göndərir.
- **Məni izlə:** start-da açıq; hər qəbul edilmiş ölçmədə xəritə mərkəzləşir (ilk dəfə `setView`, zoom ≥16; sonra `panTo`).
  `dragstart` (əl ilə sürüşdürmə) və “Bakıya qayıt” izləməni dayandırır. İzləmə gedərkən “Mövqeyimi göstər” yenidən basılsa —
  izləmə bərpa olunur və xəritə mövqeyə qayıdır (yeni watch açılmır). +/− zoom izləməni dayandırmır.
- **Xətalar:** `PERMISSION_DENIED` → watch bağlanır, işarə silinir, kartda icazə mesajı + “Bağla”.
  `POSITION_UNAVAILABLE` / `TIMEOUT` → mesaj, izləmə davam edir; növbəti təzə ölçmədə mesaj təmizlənir.
  30 san ərzində heç bir təzə ölçmə yoxdursa — “Mövqe hələ alınmayıb”. API yoxdursa / HTTPS deyilsə / xəritə yoxdursa — ayrıca mesaj.
  Təzələmə sorğusunun xətaları (icazə rəddi istisna) səssizdir.
- **Dayandır:** `clearWatch`, taymerlər, işarə və dairə silinir; sessiya sayğacı artır → gecikmiş callback-lər yox sayılır.
- `window.__bakuGeo.state()` yalnız testlər üçün oxuma funksiyasıdır; mövqe yaratmır.

### Yerləşmə (düzəliş 1)
- Xəritə statusu (`#status`) və mövqe kartı (`#geo-card`) bir `.top-stack` sütunundadır — heç vaxt üst-üstə düşmür;
  sütun aşağı idarəetmə zonasına (`--bottom-reserve`) qədər uzanır, uzun kart sürüşür. Sütunun boş sahəsi
  `pointer-events:none` — xəritə orada da barmaqla sürüşdürülür.
- ≤600 px enində (telefon şaquli): aşağı sətir [Bakıya qayıt] … [+][−]; GPS düymələri onun üstündə sağda sütun;
  status zolağı sətrə sığmasa bükülür.
- ≤520 px hündürlükdə və ≥601 px enində (telefon üfüqi): GPS düymələri yan-yana, zoom düymələrinin altında.
- Tesla ölçülərində (≥1180 px) yerləşmə əvvəlki kimidir.
- `tests/test_layout.py`: 6 ekran ölçüsü (1920×1200, 1440×900, 1180×820, 390×844, 844×390, 360×640) × 3 vəziyyət
  (boş, mövqe izlənir, mövqe izlənir + xəritə xəbərdarlığı): bütün görünən idarəetmə elementləri cüt-cüt kəsişmir və
  ekrandan çıxmır — 18/18 PASS (düzəlişdən əvvəl telefonlarda 8 FAIL idi).

### Mərhələ 2 testləri — HAMISI MOCK (`tests/test_geo.py`, 69/69 PASS)
- **Saxta geolocation obyekti** (navigator.geolocation əvəzlənir) + Playwright saxta saatı: G1–G16 — işarənin ilk fix-ə
  qədər olmaması, dairə radiusu, dəqiqlik/yaş mətni, izləmə, sürüşdürmədə dayanma, “Bakıya qayıt”, 15 san köhnəlmə,
  keş rəddi (5 dəq, 16 san), eyni koordinat təkrarı, sıradan çıxmış/etibarsız ölçmələr, təzələmə sorğusu və onun
  ilişməməsi, 3 xəta kodu, 30 san ilk-fix xəbərdarlığı, dayandırma və gecikmiş callback, API olmaması.
- **Düzəliş 1 testləri:** G17 — timestamp yoxdur / NaN / mətn / 0 / 10 dəq və 6 san gələcəkdə → işarə yoxdur;
  2 san gələcək → qəbul; canlı mövqedən sonra yalnız etibarsız vaxtlı nümunələr → 15 san sonra “Köhnə mövqe”,
  sonra təzə nümunə → bərpa. G18 — 40 san hər 5 san köhnə nümunə (sorğulara da köhnə cavab) → 4 sorğu, ən çox 1
  açıq; sonra təzə nümunə → normal bərpa, əlavə sorğu yoxdur; ilk fix-siz və cavabsız sorğularla da sorğular davam edir.
  G13 — 4 rədd edilmiş nümunə cəmi 1 sorğu yaradır.
- **Düzəliş 2 testləri:** G19 — A cavabsız → timeout A-nı etibarsızlaşdırır → B göndərilir → A gec UĞUR (təzə
  koordinatla) cavab verir: yox sayılır, B cari qalır, B açıq ikən yeni sorğu yoxdur, sonra B-nin öz cavabı qəbul
  edilir. G20 — eyni ardıcıllıq, A gec XƏTA ilə (kod 2, 3, 1): yox sayılır, izləmə aktiv, mesaj yoxdur; B-nin öz
  xətası B-ni bitirir; növbəti sorğu 10 san limitinə əməl edir. G-all/G18 — bütün sorğular arası fasilə ≥10 san.
  Fake hər sorğunu çağırış sırası ilə ayrıca cavablandıra bilir (`answerGet(i)`, `failGet(i, code)`).
- **Chromium-un öz geolocation emulyasiyası** (B1, B2): brauzerin real Geolocation API kodu, icazə verilib/verilməyib.
  Koordinat GPS-dən yox, Playwright-dan gəlir.
- **Real GPS, real Tesla brauzeri, real iPhone ilə HEÇ BİR test aparılmayıb** — bunu istifadəçi cihazda edəcək.

### Mərhələ 2 məlum məhdudiyyətləri
- Tesla brauzerinin mövqeyi haradan götürdüyü (avtomobil GPS-i və ya şəbəkə) və hansı tezlikdə yenilədiyi bilinmir.
- Tesla brauzeri icazə pəncərəsini necə göstərir və rədd ediləndə icazəni harada bərpa etmək olar — cihazda yoxlanmalıdır.
- Ölçmənin yaşı `position.timestamp`-a əsaslanır; cihaz saatı səhvdirsə (keçmişdə), təzə ölçmələr köhnə sayıla bilər.
- Ekran sönəndə / səhifə arxa plana keçəndə brauzer izləməni dayandıra bilər; qayıdanda ilk təzə ölçməyə qədər “Köhnə mövqe”.
- İstiqamət (heading), sürət, marşrut bu mərhələdə yoxdur.

---

# Mərhələ 1 (düzəliş 2) — dəyişməyib

## Məqsəd
Tesla Model 3 (2021) brauzerində açılan, Bakı mərkəzindən başlayan statik veb xəritə.
Bu mərhələdə GPS, marşrut, telefonla qoşulma, hesab, server, verilənlər bazası YOXDUR.

## Texnologiyalar
- Leaflet 1.9.4 (BSD-2-Clause) — repoda `vendor/leaflet/` altında saxlanılır, CDN-dən asılı deyil.
- Xəritə tile-ları: OpenStreetMap standart serveri `https://tile.openstreetmap.org/{z}/{x}/{y}.png`
  - API açarı tələb etmir.
  - Attribution: “© OpenStreetMap töhfəçiləri” + copyright səhifəsinə link, həmişə görünür.
  - `<meta name="referrer" content="strict-origin-when-cross-origin">` — OSM qaydası Referer tələb edir.
  - maxZoom 19, `keepBuffer: 4`; toplu yükləmə/prefetch yoxdur.
- Saf HTML/CSS/JS, build addımı yoxdur. JS ES5 sintaksisindədir (köhnə Chromium üçün).
- Hostinq: istənilən statik HTTPS host (tövsiyə: GitHub Pages).

## Fayllar
| Fayl | Təyinat |
|---|---|
| `index.html` | Səhifə strukturu: xəritə, status, +/− , “Bakıya qayıt”, xəta paneli |
| `style.css` | Tesla ekranı üçün böyük düymələr (88px), 24–40px mətn, tünd panellər |
| `app.js` | Xəritənin yaradılması, düymələr, yüklənmə/xəta izləməsi |
| `tests/` | Mock testlər: test_basic, test_cycles, test_active_state (Mərhələ 1), test_geo, test_layout (Mərhələ 2) |
| `geo.js` | Mərhələ 2: brauzer mövqeyi, işarə, dəqiqlik dairəsi, “Məni izlə”, xəta mesajları |
| `vendor/leaflet/*` | Leaflet kitabxanası və lisenziyası |

## Davranış
- Başlanğıc: [40.3777, 49.8460], zoom 13. “Bakıya qayıt” → `setView` bu görünüşə.
- Leaflet-in standart zoom düymələri söndürülüb, əvəzinə böyük xüsusi düymələr; min/max zoomda deaktiv olur.
- Status: hər vəziyyətdə işarə + mətn (⏳ / ✓ / ⚠ / ✕), rəng əlavə vasitədir.
- `leaflet.js` yüklənməsə → xəta paneli, “Yenidən yoxla” = səhifəni yeniləyir.
- `offline`/`online` hadisələri izlənir; `online` olanda avtomatik retry.
- `window.__bakuMap` (`cycle()` snapshot daxil) yalnız avtomatik testlər üçün açılıb.

## Loading-cycle nəzarəti (düzəliş 1)
Sessiya boyu flag (`everLoaded`) çıxarılıb. Hər tile sorğusu ayrıca record kimi izlənir:
`records["z:x:y"] = { el, c:{x,y,z}, cycleId, state: pending|ok|error }`.

**Cycle** = `{ id, started, ok, error, cancelled, timedOut, finished, result, timer }`;
`pending` = cari cycle-a aid `state==='pending'` record-ların sayı.

- **Yeni cycle başlayır:** aktiv cycle yoxdursa (əvvəlki bitib) və ya `movestart`/`zoomstart`-dan sonra
  ilk `tileloadstart` gələndə; həmçinin “Yenidən yoxla”da. Köhnə cycle-ın timer-i ləğv olunur, onun ekranda
  qalan pending sorğuları yeni cycle-a köçürülür (cari görünən sahəyə aiddirlər). Hər cycle-ın öz 15 san timer-i var.
- **Event qoruması:** `tileload`/`tileerror` yalnız `record.el === e.tile`, `record.state==='pending'` və
  `record.cycleId === cycle.id` olduqda sayılır. Köhnə cycle-ın gecikmiş event-ləri yox sayılır.
  `tileunload`/`tileabort` pending sorğunu `cancelled` edir (xəta sayılmır).
- **Qiymətləndirmə — düzəliş 2:** nəticə tarixçə sayğaclarından (`cycle.ok/error`) YOX, cari aktiv
  tile-lardan hesablanır. `activeState()`: hazırda layer-də olan (records-dan silinməmiş) və görünən sahə
  ilə kəsişən tile-ların `ok / error / pending` sayı; `allPending` = layer-də cavab gözləyən bütün sorğular.
  `cycle.ok/error/started/cancelled` yalnız diaqnostika üçün saxlanılır.
  - `allPending===0` → cycle bitdi (timer ləğv, növbəti sorğu yeni cycle).
  - görünən `pending===0`: `error===0` → OK (warning/error təmizlənir); `ok>0` → partial; əks halda xəta paneli.
  - görünən `pending>0` və timeout bitib → `ok>0` ? partial : xəta paneli.
  - görünən `pending>0`, timeout bitməyib → gözlə (0.8 san sonra “yüklənir”).
  - Görünən sahədə heç bir tile yoxdursa → göstərilən nəticə dəyişmir.
  - `evaluate()` çağırılır: hər `tileload`/`tileerror`, hər `tileunload`/`tileabort` (**tile-ın vəziyyətindən
    asılı olmayaraq** — əvvəl yalnız pending üçün idi), cycle timeout-u və `moveend` (layer-dən sonra qeydiyyatda).
  - Eyni nəticə təkrar göstərilmir (`shownResult`), ona görə “✓ hazırdır” hər event-də yenidən çıxmır.
- **Partial xəbərdarlıq:** status zolağında ⚠ mətn + “Yenidən yoxla” düyməsi.
- **Retry:** cycle və records sıfırlanır, layer çıxarılır və 300 ms sonra yenidən əlavə olunur → yeni cycle.
  Səbəb: `tiles.redraw()` ilə dərhal yaradılan eyni URL-li `<img>` sorğularını Chromium hələ cavabsız köhnə
  sorğulara birləşdirir və yeni sorğu serverə getmir (testdə təsdiqləndi: 0 ms fasilədə 0 yeni sorğu,
  100/500 ms fasilədə 54/54). URL-ə cache-busting parametri əlavə edilmir (OSM keşini pozmamaq üçün).

## Avtomatik yoxlama — HAMISI MOCK (Playwright, Chromium 141, 1920×1200, touch)
Test mühiti OSM serverinə çıxış vermir, ona görə **heç bir test real internet və real OSM tile-ları ilə
aparılmayıb**. Tile sorğuları Playwright route ilə tutulur: `ok` = 200 + PNG, `error` = 500,
`pending` = cavab verilmir. Timeout real 15 san-dir (saat saxtalaşdırılmayıb). Skriptlər: `tests/`.
- `test_cycles.py`: 4 ssenari + əlavə yoxlamalar — 18/18 PASS.
- `test_active_state.py` (düzəliş 2, real Leaflet 1.9.4): uğurlu tile çıxarılıb yalnız pending qalanda
  timeout-da xəta paneli (Leaflet `_removeTile` ilə və təbii pan/pruning ilə); xətalı tile-lar çıxarılıb
  yalnız uğurlu qalanda partial təmizlənir — 7/7 PASS. Düzəlişdən əvvəlki kodda P1-a və P2 FAIL verirdi.
- `test_basic.py`: Mərhələ 1 funksiyaları (mərkəz, +/−, toxunma ilə sürüşdürmə, “Bakıya qayıt”,
  attribution, xəta paneli, retry, Leaflet yüklənməməsi) — 13/13 PASS.

## Məlum məhdudiyyətlər
- Real OSM tile-larının yüklənməsi və real Tesla brauzeri test edilməyib (bütün testlər mock).
- 300 ms retry fasiləsinin köhnə sorğuları ləğv etməsi Chromium 141-də yoxlanıb; Tesla-nın Chromium versiyasında real şəraitdə təsdiqlənməlidir.
- 15 san-dən sonra pending qalan sorğunu brauzer özü sonradan ləğv edərsə, `tileerror` gəlir və nəticə yenidən qiymətləndirilir.
- Tesla brauzerinin Chromium versiyası proqram yeniləməsindən asılıdır; ES5 seçimi ehtiyat üçündür.
- OSM standart serveri yüngül/şəxsi istifadə üçündür; kommersiya və ya böyük trafik olarsa öz tile
  provayderinə (məs. ödənişli MapTiler/Stadia və ya öz tile serveri) keçmək lazımdır.
- İki barmaqla (pinch) zoom Leaflet-də aktivdir, amma real Tesla ekranında yoxlanmalıdır.
- Tesla brauzeri sürüş zamanı məhdudlaşdırıla bilər — naviqasiya mərhələsində nəzərə alınmalıdır.
