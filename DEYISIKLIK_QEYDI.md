# Dəyişiklik qeydi

## Mərhələ 2 — düzəliş 2 (2026-10-11)
**geo.js**
- Hər `getCurrentPosition` sorğusu ayrıca id alır; cari sorğu `currentPollId`-dədir (`pollInFlight` əvəzinə).
- Timeout nəzarəti sorğunu bitmiş sayanda onun id-si etibarsızlaşır; köhnə sorğunun gecikmiş uğur və xəta
  callback-ləri yox sayılır və yeni sorğunun vəziyyətini dəyişmir. 10 san sorğu fasiləsi saxlanılıb.

**Testlər**
- `test_geo.py`: G19 (A timeout → B → A gec uğur), G20 (A gec xəta: kod 2, 3, 1), sorğu fasiləsi yoxlamaları — 69/69.
- Mərhələ 1: 13/13, 18/18, 7/7; yerləşmə 18/18. Hamısı mock.

## Mərhələ 2 — düzəliş 1 (2026-10-11)
**geo.js**
- Etibarsız ölçmə vaxtı (timestamp yoxdur, NaN, rəqəm deyil, ≤0, 5 san-dən çox gələcəkdə) artıq “indi” ilə əvəz
  edilmir: nümunə rədd edilir, kartda “ölçmə vaxtı etibarsızdır” yazılır, təzə ölçmə istənilir. Tolerans 60 → 5 san.
- Təzələmə sorğusu qərarı son QƏBUL EDİLMİŞ təzə ölçməyə əsaslanır (`lastCallbackAt` → `lastAcceptedAt`).
  Rədd edilən callback-lər sorğunu bloklamır, əksinə təzə ölçmə istəyir. Tezlik (≥10 san) və eyni anda ən çox
  1 açıq sorğu məhdudiyyəti `requestFresh()`-də saxlanılır.

**Yerləşmə (index.html, style.css)**
- `#status` və `#geo-card` bir `.top-stack` sütununa salındı (heç vaxt üst-üstə düşmür).
- Telefon şaquli: “Bakıya qayıt” + zoom aşağı sətirdə, GPS düymələri onun üstündə; status zolağı bükülür.
- Telefon üfüqi: GPS düymələri yan-yana, zoom-un altında. Tesla ölçülərində yerləşmə dəyişməyib.

**Testlər**
- `test_geo.py`: G17 (etibarsız vaxt), G18 (köhnə nümunə seli), G13 sorğu limiti əlavə edildi — 54/54.
- Yeni `test_layout.py` — 6 ekran × 3 vəziyyət, 18/18.
- Mərhələ 1: test_basic 13/13, test_cycles 18/18, test_active_state 7/7. Hamısı mock.

## Mərhələ 2 — brauzerin öz mövqe imkanı (2026-10-11)
**Yeni fayllar**
- `geo.js` — “Mövqeyimi göstər” / “İzləməni dayandır”, `navigator.geolocation.watchPosition`, mövqe işarəsi,
  dəqiqlik dairəsi, dəqiqlik (±m) və son ölçmənin yaşı, “Məni izlə” rejimi, 15 san sonra “Köhnə mövqe” işarələməsi,
  keş/köhnə ölçmələrin rəddi, icazə rəddi / mövqe alınmaması / timeout mesajları (Azərbaycanca).
- `tests/test_geo.py` — 35 mock test (saxta geolocation + saxta saat; Chromium geolocation emulyasiyası).
- `DEYISIKLIK_QEYDI.md` — bu fayl.

**Dəyişdirilən fayllar**
- `index.html` — mövqe kartı (`#geo-card`), iki mövqe düyməsi (sağ aşağı), `geo.js` qoşuldu.
- `style.css` — mövqe düymələri, kart, canlı/köhnə işarə və dairə üslubları (sona əlavə; köhnə qaydalar dəyişməyib).
- `app.js` — yalnız `window.__bakuMap` sətrinin şərhi (məntiq dəyişməyib).
- `TEXNIKI_QEYD.md` — Mərhələ 2 bölməsi əlavə olundu.

**Yoxlama:** test_geo 35/35, test_basic 13/13, test_cycles 18/18, test_active_state 7/7 — hamısı mock.

**Testin tapdığı və düzəldilən problem:** təzələmə sorğusuna brauzer heç cavab verməsə, sonrakı sorğular
dayanırdı. İndi cavabsız sorğu 12 san sonra bitmiş sayılır.

## Mərhələ 1 — düzəliş 2 (2026-10-09)
Xəbərdarlıq cari görünən aktiv tile vəziyyətlərindən hesablanır (tarixçə sayğaclarından yox).

## Mərhələ 1 — düzəliş 1 (2026-10-09)
Hər tile yüklənmə dövrü üçün ayrıca state və 15 san timeout; “Yenidən yoxla” yeni dövr başladır.

## Mərhələ 1 (2026-10-09)
Bakı mərkəzindən başlayan Leaflet + OpenStreetMap xəritəsi, +/−, “Bakıya qayıt”, yüklənmə xətası paneli.
