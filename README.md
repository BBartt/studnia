# Studnia — Tetris kontra skoczek

Gra sieciowa dla dwóch osób. Jedna gra w Tetrisa, druga steruje skoczkiem w tej samej studni i próbuje nie dać się zgnieść. Po każdej rundzie gracze zamieniają się rolami.

## Szybki start

Wymagany Node.js 18.17+ (zalecany 22).

```bash
make            # lista wszystkich komend
make dev        # tryb deweloperski: http://localhost:5173
make test       # testy silnika i rozgrywki sieciowej
make prod       # wersja produkcyjna na jednym porcie: http://localhost:3001
```

Bez `make` (np. Windows bez WSL): `npm install`, potem `npm run dev`, `npm test`, `npm run build && npm start`.

Żeby testować na jednym komputerze, otwórz dwie karty. Każda karta to osobny gracz, a w lewym górnym rogu i w tytule karty widać, kim jesteś i jaką masz rolę.

## Zasady

- **Tetris** wygrywa, gdy zgniecie skoczka klockiem albo zepchnie go na dno.
- **Skoczek** wygrywa, gdy przetrwa do końca czasu albo gdy klocki dojdą do sufitu.
- **Lawa na dnie.** Dno studni jest bezpieczną platformą poza 2 polami lawy po 1 kratce. Pola są losowane w każdej rundzie i nigdy nie leżą obok siebie. Skoczek ginie, gdy ponad połowa jego ciała stanie nad lawą. Klocek leżący na lawie ją przykrywa. Liczbę pól zmienisz w `shared/protocol.js` (`LAVA_COUNT`).
- **Ograniczone pole widzenia:** skoczek widzi wycinek 7 kratek szerokości i 14 wysokości (proporcje 1:2 jak cała plansza), który podąża za nim. Rozmiar ustawisz w `shared/protocol.js` (`JUMPER_VIEW`). Przez pierwsze 3 sekundy odliczania widzi całą planszę, potem pojawia się ramka „Twoje pole widzenia” i następuje zbliżenie. Gdy klocek spada nad kadrem, strzałka u góry pokazuje jego kierunek i odległość. Tetris widzi całą planszę i przerywaną ramkę tego, co widzi skoczek.
- **Odbicie od ściany:** skok przy ścianie lub boku klocka wybija skoczka wyżej niż zwykły skok. Każde kolejne odbicie w serii daje więcej siły.
- **Natychmiastowy zrzut (spacja)** jest domyślnie wyłączony. Włącza się tylko wtedy, gdy obaj gracze zagłosują „za” w pokoju. Wycofanie jednego głosu go wyłącza.
- **Zamiana ról** następuje po każdej rundzie, także po ostatniej, więc rewanż zaczyna się na odwrót.
- **Punkty:** wygrana runda daje 100, Tetris dostaje 20 za każdą linię, skoczek 2 za każdą przetrwaną sekundę.

| | Tetris | Skoczek |
|---|---|---|
| Ruch | ← → lub A D | ← → lub A D |
| Akcja | ↑ obrót, ↓ w dół, Spacja zrzut (gdy obaj się zgodzą) | ↑ / W / Spacja skok, przy ścianie odbicie |

## Wdrożenie, czyli granie ze znajomymi przez internet

Gra to jeden proces Node, który serwuje stronę, API i WebSocket na jednym porcie. Stan pokoi jest w pamięci, więc zawsze uruchamiaj **jedną instancję**.

### Opcja A: Render.com (najprościej, za darmo)

`render.yaml` ustawia region **Frankfurt**, najbliższy Polsce. Domyślny region Rendera to Oregon (USA), co dodaje ok. 150 ms opóźnienia do każdego ruchu. Usługa założona wcześniej bez regionu we Frankfurcie wymaga utworzenia na nowo, bo regionu istniejącej usługi nie da się zmienić.

1. Wrzuć projekt na GitHuba.
2. Na render.com wybierz **New + → Blueprint** i wskaż repozytorium. Plik `render.yaml` skonfiguruje resztę (Docker, health check, jedna instancja).
3. Po kilku minutach dostaniesz adres `https://studnia-xxxx.onrender.com`. Wyślij go znajomym.

Ograniczenia darmowego planu: serwer zasypia po 15 minutach bezczynności, więc pierwsze wejście trwa około minuty. Ranking zeruje się przy każdym wdrożeniu, bo darmowy plan nie ma trwałego dysku.

### Opcja B: własny serwer (VPS) z Dockerem

Na serwerze z zainstalowanym Dockerem:

```bash
git clone <repo> studnia && cd studnia
make up                                  # http://IP_SERWERA:3001
# albo z HTTPS i własną domeną (rekord A domeny → IP serwera):
make up-https DOMAIN=gra.twojadomena.pl  # https://gra.twojadomena.pl
make logs                                # podgląd logów
make down                                # zatrzymanie
```

Caddy sam pobiera certyfikat Let's Encrypt i przepuszcza WebSockety. Ranking leży w wolumenie Dockera i przetrwa restarty oraz aktualizacje (`git pull && make up`).

### Opcja C: szybki test z własnego komputera

```bash
make prod      # w jednym terminalu
make tunnel    # w drugim: wypisze publiczny adres https://….trycloudflare.com
```

Działa bez konta i bez konfiguracji routera, dopóki masz włączony komputer.

### Zmienne środowiskowe

| Zmienna | Domyślnie | Opis |
|---|---|---|
| `PORT` | `3001` | port serwera |
| `HOST` | `0.0.0.0` | interfejs nasłuchu |
| `DATA_DIR` | `server/data` (`/data` w Dockerze) | katalog na `leaderboard.json` |
| `ALLOWED_ORIGINS` | pusto (każdy) | dozwolone adresy strony dla WebSocketów, np. `https://gra.twojadomena.pl` |
| `TRUST_PROXY` | `true` | czy ufać nagłówkom reverse proxy |
| `SIMULATED_LATENCY_MS` | `0` | tylko do testów: sztuczne opóźnienie każdej wiadomości w jedną stronę, np. `60` daje ping ok. 120 ms |
| `VITE_WS_URL` | — | (build) pełny adres WebSocketu, gdy frontend stoi osobno |

## Architektura

```
shared/   wspólny kod: protokół, schemat ustawień i silnik gry (shared/engine)
server/   Node + Express + ws
  src/game/Engine.js     re-eksport silnika z shared/engine (fizyka, kolizje, lawa, odbicia)
  src/rooms/Room.js      gracze, role, fazy meczu, pętla 60 Hz
  src/rooms/RoomManager  sesje, kody pokoi, routing wiadomości
  src/config.js          konfiguracja ze zmiennych środowiskowych
  test/                  testy (node:test): silnik + pełny mecz przez WebSocket
client/   React 18 + Vite
  src/game/renderer.js   canvas: kamera skoczka, intro, animacje, efekty
  src/game/predictor.js  predykcja ruchu skoczka (płynność mimo pingu)
  src/game/theme.js      motyw ciemny/jasny (localStorage + ustawienia systemu)
  src/game/uiFx.js       wstrząsy i uderzenia interfejsu (Web Animations API)
  src/game/outerFx.js    efekty poza planszą: gwiazdki, promienie linii, odłamki, fale, kurz, rozbłysk ramki, poświata, „+punkty”
Dockerfile, docker-compose.yml, deploy/Caddyfile, render.yaml, Makefile
```

- **Serwer jest autorytatywny.** Fizyka liczy się na serwerze krokami 1/60 s, a timer budzi się 30 razy na sekundę (2 kroki naraz) i od razu wysyła stan. Stan jest serializowany raz dla wszystkich graczy. Klient wysyła tylko wejście.
- **Predykcja skoczka.** Silnik leży w `shared/engine`, więc przeglądarka skoczka liczy jego ruch tym samym kodem co serwer i pokazuje go bez czekania na odpowiedź. Gdy przychodzi stan z serwera, klient porównuje go ze swoją pozycją sprzed czasu pingu i łagodnie poprawia różnicę. Przy dużym rozjeździe, np. po zepchnięciu przez klocek, przyjmuje stan serwera. O wyniku zawsze decyduje serwer.
- **Ping** jest mierzony co 2 s i widoczny w grze obok nicku przeciwnika: zielony poniżej 70 ms, żółty poniżej 150 ms, czerwony powyżej.
- **Pole widzenia skoczka to kamera po stronie klienta.** Serwer wysyła obu graczom pełny stan, bo tak jest prościej i szybciej. Technicznie obeznany gracz mógłby więc podejrzeć całą planszę w narzędziach przeglądarki. Między znajomymi nie ma to znaczenia.
- **Stan gry omija React.** Canvas subskrybuje store bezpośrednio, HUD wybiera pola przez `useSyncExternalStore`, a efekty DOM działają przez Web Animations API.
- **Odporność:** limit rozmiaru wiadomości, limiter zapytań, heartbeat, walidacja wejścia i ustawień, opcjonalna lista dozwolonych originów, pauza i 30 s na powrót po zerwaniu połączenia, łagodne zamykanie przy `docker stop`.
- **Dostępność:** etykiety ARIA, widoczny focus, `prefers-reduced-motion` (bez wstrząsów, mniej cząsteczek), oba motywy z kontrastowym tekstem.

## Ustawienia

Ustawienia zmienia się w pokoju, między meczami. Każda sekcja ma przycisk „Ustawienia fabryczne”.

- **Zasady meczu** (wspólne, może je zmienić każdy gracz): czas rundy i liczba wygranych rund do końca meczu. W pokoju widać, kto ostatnio je zmienił.
- **Twoje ustawienia** (każdy gracz ma własne):
  - prędkość klocków i przyspieszanie działają w rundach, w których jesteś Tetrisem;
  - siła skoku i szybkość biegu działają w rundach, w których jesteś skoczkiem;
  - podświetlanie zagrożenia i poziom efektów (pełne lub oszczędne) dotyczą tylko twojego ekranu.

Ustawienia przeciwnika widać w pokoju jako podsumowanie, z wyróżnionymi wartościami innymi niż fabryczne.
