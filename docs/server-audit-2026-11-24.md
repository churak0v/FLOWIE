# FLOWIE: диагностика доступности production, 24 ноября 2026

Статус: read-only диагностика. Выполнен вход через jump-host; перезапуск,
деплой, изменение firewall или другие записи на production не выполнялись.

## Обновление 25 ноября: причина локализована до upstream-сети

Через SPEKA как SSH jump-host получен read-only доступ к production. Это
обновление заменяет прежнюю границу «SSH/live неизвестны» ниже по документу.

- Маршрут: `ssh -J pum flowie-prod`; ключ остаётся на локальном Mac. Live repo:
  `/srv/flowie/app`, HEAD/image tag
  `10d952563a5d8c615e09093e9ec73e2d23492a31`.
- Все пять контейнеров healthy, restart count 0. Хост: 4 CPU, 7,8 GiB RAM,
  6,7 GiB available, swap 0/511 MiB, load 0,00/0,05/0,07; свободно 64/79 GiB.
- Из сети SPEKA root, `/api/health` и admin дали HTTP 200 за 0,14–0,27 с.
  За проверяемый период kernel OOM/ENOSPC, PostgreSQL ERROR/FATAL, Nginx 5xx и
  upstream failures не обнаружены. Watchdog контейнеры не восстанавливал.
- UFW разрешает 22/80/443. Совпадений проблемного внешнего адреса в
  nftables/iptables нет, fail2ban не установлен. `tcp_mtu_probing=1`; MTU eth0
  1280, Docker bridge 1500.
- Capture проверен контрольным HTTPS-запросом через SPEKA: 30 пакетов, TLS/HTTP
  прошли. При прямом запросе из проблемной сети с фиксированным исходным портом
  curl завершился TLS timeout, а VM увидела лишь по одному входящему и исходящему
  пакету без прикладного обмена. Это не доказывает конкретную реализацию SYN
  proxy, но делает selective provider/anti-DDoS filtering или дефект маршрута
  до VM гораздо вероятнее host firewall, nginx, Docker, RAM или диска.

### Решение

Не перезагружать и не деплоить FLOWIE: приложение и VM исправны для доступных
маршрутов. Передать провайдеру UTC-интервалы неуспешных проб и попросить проверить
anti-DDoS/SYN proxy, source filtering и маршрутизацию до `168.113.209.147` для
22/80/443. После изменения проверить домашнюю сеть, мобильного оператора,
независимый узел и SSH.

### Черновик обращения в AdminVPS

> 24–25 ноября наблюдается селективная недоступность VM 168.113.209.147 по TCP
> 22/80/443 из нескольких сетей. TCP connect на клиенте завершается, но SSH
> banner, HTTP response и TLS ServerHello не приходят. Из других российских и
> европейских узлов сайт отвечает HTTP 200 за 0,13–0,50 с. На VM все контейнеры
> healthy, restart count 0, нагрузка низкая, свободно 6,7 GiB RAM и 64 GiB диска;
> UFW разрешает 22/80/443, source ban в nftables/iptables и fail2ban отсутствуют.
> Контрольный tcpdump видит полный HTTPS-обмен через доступную сеть, но при пробе
> из проблемной сети прикладной обмен до VM не доходит. Просим проверить
> anti-DDoS/SYN proxy, source filtering и маршрутизацию до VM по приложенным
> UTC-интервалам. Перезагрузку VM без диагностики не выполнять.

### Перенос на SPEKA

На текущий SPEKA VPS переносить FLOWIE нельзя: 2 CPU, 3,8 GiB RAM, доступно
около 1,4 GiB, уже занято 1,8/4 GiB swap; root занят на 95%, свободно 2,9 GiB.
OpenClaw использует около 1,24 GiB, SPEKA backend 525 MiB, PostgreSQL 494 MiB,
`/opt/KPG/backups` снова около 14 GiB. Это недавняя зона ENOSPC/OOM и общая
точка отказа. FLOWIE сейчас имеет намного больший запас на отдельной VM; её
следует сохранить и исправить upstream-маршрут. Консолидация допустима только
на новой/расширенной VM с отдельными лимитами, volumes, backups и monitoring,
не на текущем SPEKA root filesystem.

## Краткий вывод

Полное падение приложения не подтверждается. В 23:53–23:55 SAMT локальный
путь до `168.113.209.147` устанавливал TCP-соединение на 22, 80 и 443, но не
получал ни SSH banner, ни HTTP-байта, ни TLS ServerHello. При этом внешние
проверки из пяти узлов в Европе/Иране и двух из трёх российских узлов получили
HTTP 200 от того же IP за 0,13–0,50 с. Один российский узел завершился connect
timeout; владелец независимо сообщил, что сайт не открывается через мобильную
сеть.

Таким образом, установлен класс инцидента: **селективная недоступность по
сетевому пути или источнику**, затрагивающая несколько реальных путей, а не
доказанное общее падение контейнеров. Наиболее вероятны фильтрация/бан источника
на host/provider firewall либо проблема маршрута/PMTU у части операторов.
Различить эти варианты без out-of-band консоли и packet capture на хосте нельзя.

## Наблюдаемые факты

- DNS-кэш на машине проверки разрешает `flowie.art` в `168.113.209.147`.
- Системные HTTP/HTTPS/SOCKS proxy отключены; `curl --noproxy '*'` использовался
  явно. Контрольный `https://example.com` прошёл: HTTP 200, TLS за 0,30 с.
- TCP connect к production прошёл на 22, 80 и 443.
- `https://flowie.art/`: TCP connect менее 1 мс, затем TLS timeout; HTTP 000.
- `http://168.113.209.147/` с Host `flowie.art`: TCP connect 2 мс, затем 10 с
  без единого байта; HTTP 000.
- SSH: соединение установлено, клиент отправил собственную строку версии, но за
  8 с не получил banner сервера (`Connection timed out during banner exchange`).
- Внешняя проверка root URL: Цюрих, Франкфурт, Шираз, Бухарест и Лондон получили
  HTTP 200 от `168.113.209.147` за 0,17–0,50 с:
  <https://check-host.net/check-report/5a6dd7a3kab2>.
- Отдельная проверка из России: Москва (один узел) и Санкт-Петербург получили
  HTTP 200 за 0,13–0,18 с; второй московский узел получил connect timeout:
  <https://check-host.net/check-report/5a6ddca1ka84>.
- ICMP в этой локальной сети недоступен даже до контрольного адреса, поэтому
  ping/DF-тест не является доказательством PMTU-проблемы.

## Что не удалось проверить

SSH недоступен по текущему пути, а панель/серийная консоль провайдера не была
доступна в этой сессии. Поэтому не получены live Git SHA/image tags, uptime,
CPU/RAM/disk, состояние и restart count контейнеров, journal, firewall/fail2ban,
логи Nginx/API, резервные копии и фактические ошибки 22–24 ноября. Версия live
не сопоставлена с локальным HEAD `52530d9eef312c03d34b7384df75c4c8a5372505`.
Нельзя делать вывод о потерянных визитах или заказах по отсутствующим логам.

## Проверка через консоль провайдера

Сначала открыть VNC/serial/rescue console AdminVPS, не перезагружая хост вслепую.
Выполнить только чтение и сохранить время каждого результата:

```sh
date -Is
uptime
free -h
df -h
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.PIDs}}'
systemctl --failed --no-pager
systemctl status docker ssh nginx flowie-watchdog.timer --no-pager
journalctl -u ssh -u docker -u flowie-watchdog.service --since '2026-11-22 00:00:00' --no-pager
ss -lntp
nft list ruleset
fail2ban-client status
ip -s link
ip route
sysctl net.ipv4.tcp_mtu_probing
```

Для Docker Compose затем перейти в production-каталог и использовать только
команды без раскрытия `.env.production`:

```sh
docker compose --env-file .env.production -f compose.production.yml ps
docker compose --env-file .env.production -f compose.production.yml images
docker compose --env-file .env.production -f compose.production.yml logs --since 48h --tail 500 edge api web admin
curl --fail --show-error --max-time 5 http://127.0.0.1/api/health
curl --fail --show-error --max-time 5 https://flowie.art/api/health
```

Последние два URL нужно уточнить по фактическим локальным портам/edge-конфигу;
не печатать expanded Compose config или environment.

Одновременно запустить краткий capture, повторив один запрос с проблемной сети:

```sh
timeout 30 tcpdump -ni any 'tcp port 22 or tcp port 80 or tcp port 443'
```

Он показывает, приходят ли после handshake клиентские данные и уходят ли ответы.
Не публиковать IP пользователей; в отчёте оставить только агрегированный итог.

## Решение по результату консоли

1. Если обнаружен fail2ban/nft/provider-firewall ban проблемного источника —
   удалить только ошибочную узкую блокировку и проверить 22/443 из проблемной и
   контрольной сети. Не отключать firewall целиком.
2. Если запросы из проблемной сети вообще не доходят — открыть срочный ticket
   провайдеру с UTC-временем, source ASN/оператором, destination IP и успешными/
   неуспешными probe results; это routing/provider filtering.
3. Если запросы доходят и ответы уходят, но клиент их не получает — проверить
   MSS/PMTU и ICMP packet-too-big. В репозитории уже есть
   `ops/sysctl/99-flowie-network.conf` с `net.ipv4.tcp_mtu_probing=1`, добавленный
   19 ноября именно для VPN/proxy PMTU black hole; нужно подтвердить, что файл
   установлен и sysctl реально равен 1. Изменять MTU только после capture.
4. Если локальный health/container unhealthy — сначала установить причину по
   ресурсам и логам, затем выполнять минимальный адресный restart. Не делать
   blind reboot и не деплоить новый SHA во время сетевого инцидента.

## Watchdog

`flowie-watchdog.timer` запускается каждые пять минут. Скрипт действительно
делает `compose up -d` для отсутствующего контейнера и `compose restart` для
контейнера со статусом, отличным от `healthy`/`running`. Неуспешный внешний HTTPS
check сам по себе только завершает unit с ошибкой и не перезапускает healthy
контейнеры. Нужно проверить journal на цикл recovery, но не запускать watchdog
вручную во время диагностики.

## Критерий восстановления

Инцидент закрыт только после одновременной проверки: root и `/api/health` через
проблемную домашнюю сеть, мобильный оператор и независимый внешний узел; SSH
banner/login; healthy containers без роста restart count; записанный live SHA;
отсутствие новых ошибок в journal/logs в течение хотя бы 15 минут. Историческую
полноту рекламы 22–24 ноября оценивать отдельно по уже сохранённым агрегатам.

## Дополнение: панель AdminVPS через Safari

Оркестратор осмотрел авторизованную панель услуги 397339. Статус «В сети»,
4 CPU / 8192 МБ / 80 ГБ; занято 15,2 ГБ, свободно 64,8 ГБ. На видимых графиках
за 24 часа нет устойчивой высокой CPU-нагрузки, RAM визуально около 14% с
небольшими колебаниями. Это показания панели, не заменяющие журналы ОС.
Qemu Agent обозначен доступным. HTML VNC открыл noVNC ready, но не показал
подключённый экран сервера, в том числе после обновления. Пароли, firewall,
питание VPS и доступ техподдержки не менялись.
