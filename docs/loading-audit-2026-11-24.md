# FLOWIE: аудит доступности и холодной загрузки, 24 ноября 2026

Статус: read-only live-диагностика и один локальный ограниченный fix. Production,
DNS и данные не изменялись; заказы и платежи не создавались. Проверен checkout
`52530d9`. Production работает на другом SHA:
`10d952563a5d8c615e09093e9ec73e2d23492a31`.

## Вывод

Доступность зависит от сетевого пути. Из исходной среды и сети владельца сайт не
открывался: TCP принимался, но TLS/HTTP не отдавали байты. В то же время через
узел SPEKA тот же публичный домен стабильно отвечал HTTP 200 за 0,18–0,23 с, а
локально на production-хосте root/health/API отвечали за 0,009–0,060 с. Поэтому
это не глобальное падение приложения и не медленный React; отдельно нужно найти
причину недоступности конкретных внешних путей.

После восстановления остаются задачи производительности: ограничить ожидание
API, сократить первичный веер запросов, отделить компактный публичный каталог от
полной карточки. Отдельно локально убрана подтверждённая загрузка оригиналов всей
галереи поверх адаптивных AVIF/WebP; этот fix не развёрнут.

## Live-проверка

Новая серия: 2026-11-24 19:53 UTC (23:53 Europe/Samara).

| Слой | Результат | Вывод |
| --- | --- | --- |
| DNS | `flowie.art` и `admin.flowie.art` → `168.113.209.147` за 1–7 мс | DNS исправен в этой серии |
| TCP 443 | Витрина и админка соединяются; curl connect около 0,002 с | IP/порт достижимы |
| TLS 443 | Обе точки: 0 байт, `SSL connection timeout` через 3–4 с | Отказ на общем edge/хосте до маршрута приложения |
| HTTP 80 | TCP соединяется, но 0 байт за 8 с, нет redirect | Проблема не только в TLS/сертификате |
| Контроль | `https://example.com/`: HTTP 200, TLS 0,299 с, total 0,380 с | Исходящий интернет среды работал |
| Через SPEKA | `/` 200 за 0,182 с, `/api/health` 200 за 0,180 с, `/api/products` 200 за 0,232 с | Публичный сайт и API доступны хотя бы из другой внешней сети |
| На хосте | root 0,009 с, health 0,010 с, products 0,060 с | Контейнерный путь и БД отвечают быстро в момент замера |
| Браузер | Browser surface в сессии отсутствовала | Mobile render/Web Vitals не измерены |

Наблюдение владельца о недоступности остаётся валидным для его пути, но его нельзя
обобщать до глобального outage. Нужна проверка маршрута/фильтрации между проблемной
сетью и `168.113.209.147`; frontend-оптимизация этого не исправит.

## Проверка после аварийного proxy, 25 ноября

После перевода DNS на `129.101.123.117` обычный HTTPS без обхода сертификата
ответил 200. В чистом isolated Chrome с viewport 390×844 пройден путь:

`/` → `/catalog` → `/product/55` → добавление в корзину → `/cart` → `/checkout`.

На checkout отображались выбор получателя, доставки и кнопка оплаты; проверка
остановлена до её нажатия. Заказ и платёж не создавались.

Лабораторные цифры без network throttling:

- root TTFB 209 мс, DOMContentLoaded 906 мс, load 2 738 мс;
- catalog с 51 карточкой готов за 456 мс после навигации;
- product готов за 234 мс; checkout — за 1 517 мс;
- 44 root-ресурса и около 1 104 562 байт same-origin transfer; cross-origin
  изображения и счётчики в эту сумму не входят;
- нет failed request, кроме отфильтрованных browser abort при смене hero;
- начальные `/api/auth/me` и `/api/orders` возвращают ожидаемые для нового гостя
  401, но создают console error; затем guest auth, повторный auth/me и recipients
  успешно отвечают 200.

Root загрузил девять hero URLs: bundled AVIF-кандидаты, bundled originals и три
runtime upload AVIF. Это браузерно подтверждает L05 и объясняет значительную долю
лишнего cold transfer. Метрики одного unthrottled запуска не являются RUM/p75.

## Факты production payload

- Live HTML: 2 012 байт raw / 826 байт gzip.
- Live main JS: 84 411 байт gzip; CSS: 3 385 байт gzip.
- Preloaded bundled hero 640 AVIF: 41 350 байт.
- Live runtime hero 640 AVIF: 55 197 байт; его original JPEG — 207 985 байт.
- Products: 51 товар, 238 gallery rows, 39 composition rows; 76 481 байт raw /
  9 449 байт gzip, TTFB на хосте 0,060 с.
- Upsells: 13 товаров / 1 392 байт gzip; collections: 576 байт gzip;
  home-banners: 917 байт.
- Маршруты каталога, карточки, корзины и checkout уже lazy chunks.
- Nginx gzip-сжимает JS/CSS/JSON и даёт immutable cache статическим файлам.

Это live HTTP timings/bytes, но не браузерный waterfall и не Web Vitals. Оснований
для полной переписи frontend нет.

## Подтверждённые задачи

### L01 · P1 · API может ждать без ограничения

`src/api.js:8-29` вызывает `fetch` без общего timeout. На старте
`src/App.jsx:80-85` запускает products, upsells и collections; Home добавляет
home-banners и orders (`src/components/Home.jsx:154-205`). При зависшем upstream
запрос может долго оставаться pending.

Fix: timeout/AbortSignal для идемпотентных GET (ориентир 8–10 с), максимум один
retry только для network error/503, явное «повторить». Не ретраить автоматически
POST заказа, оплаты и авторизации.

### L02 · P1 · Лишний первичный веер запросов

Cold Home начинает products, upsells, collections, home-banners и orders. Auth
bootstrap отдельно делает `GET auth/me`; для нового гостя затем `POST auth/guest`,
ещё `GET auth/me` через `loadMe` и `GET recipients` (`src/App.jsx:206-234`,
`src/state/AppState.jsx:580-605`). Orders стартует до подтверждения пользователя.

Fix: оставить критичными shell/hero/compact products; orders/recipients — после
auth и по необходимости; upsells — при cart/checkout; collections — при catalog
или после первого content-ready.

### L03 · P2 · List catalog возвращает полные карточки

`server/routes/products.js:17-27` выбирает все активные товары со всеми `images`
и `composition`; `src/state/AppState.jsx:646-652` сохраняет весь ответ. Сейчас это
51 товар, 238 gallery rows и 39 composition rows: 76 481 байт raw / 9 449 байт
gzip. Payload избыточен по контракту, но не является главным текущим байтовым
узким местом.

Fix: публичный list `select` только id/name/price/discount/cover/category/flags;
галерея и состав — `GET /products/:id`. Добавить короткий public cache с
stale-while-revalidate и ETag/version, сохранив серверную проверку цены в checkout.

### L04 · P2 · Оригиналы галереи дублировали responsive variants

До локального fix `ProductDetails` трижды вызывал `prefetchImages` для всей
галереи. Helper создаёт `new Image()` на исходный URL (до восьми оригиналов), а
`ProductGallery` одновременно показывает первый кадр через `AppImage`, который
выбирает AVIF/WebP по размеру. Это могло конкурировать с LCP и скачивать два
формата одного фото.

Локальный fix удаляет эти три prefetch и не меняет display pipeline: первый кадр
остаётся `eager`/high, остальные — `lazy`, все через существующий `AppImage`.

### L05 · P1 · Runtime banner подтверждённо обесценивает preload

Build preload берётся из `public/config/home.json` (`vite.config.js:6-27`), а Home
заменяет slides ответом `/api/home-banners` (`Home.jsx:154-168`). Live HTML
preload указывает на `/hero/flowie-hero-wishlist-grounded...` (41 350 байт для
640 AVIF), а production API первым возвращает другой `/uploads/...jpg` (55 197
байт для 640 AVIF). Холодный Home приоритетно скачивает оба LCP-кандидата.

Fix: единый источник первого hero либо не менять уже показанный первый hero в
текущем cold view, применяя обновление со следующей загрузки.

### L06 · Наблюдение · Third-party preconnect пока оправдан

`index.html:19-20` прогревает два Flowwow image origin. Production catalog реально
содержит 239 image URLs с `content2` и 11 с `content3`; QuickPicks использует эти
товары близко к первому экрану. Без browser waterfall удалять preconnect рано.

## Очерёдность

1. Сравнить проблемную сеть владельца с успешной SPEKA-проверкой: маршрут,
   фильтрацию/firewall и provider network; контейнеры в момент замера здоровы.
2. Исправить L05 единым источником первого hero, затем L01/L02.
3. Снять реальный mobile cold waterfall: HTML, JS/CSS, оба hero, API count/bytes,
   content-ready, LCP/CLS/INP. Сейчас этих цифр нет.
4. L03 выполнять после более приоритетных задач; L04 проверить на product detail по
   отсутствию original+variant дублей и transfer bytes.

## Критерий закрытия

- TLS/HTTP стабильно отвечают; внешний монитор различает edge и API failure.
- Home показывает hero без API и не остаётся бесконечно в loading.
- Нет преждевременных upsells/orders/recipients.
- Catalog list измеренно компактный и без полных галерей.
- Product detail не скачивает originals поверх responsive variants.
- Записаны production SHA, устройство/сеть, waterfall и реальные p75 Web Vitals;
  лабораторный запуск не объявляется production p75.

## Mobile smoke после аварийного переключения

25 ноября 2026 проверен чистый Chromium с viewport 390×844 через новый ingress,
с валидным TLS и без обхода ошибок сертификата. Пройден сценарий: главная →
каталог → товар → корзина → checkout; проверка остановлена до нажатия «Оплатить»,
заказ и платёж не создавались. Главная: TTFB 209 мс, DOMContentLoaded 906 мс,
load 2,74 с. Каталог показал 51 карточку. Не было необработанных сетевых ошибок;
начальные гостевые 401 сменились успешной guest-авторизацией.

Waterfall подтвердил L05: девять hero-ресурсов и около 1,1 МБ same-origin
transfer на холодной главной. Локальный fix фиксирует набор слайдов на время
текущей загрузки и монтирует media только активного слайда; его эффект требуется
повторно измерить после production deploy. Эти значения — лабораторный smoke,
а не production p75 Web Vitals.
