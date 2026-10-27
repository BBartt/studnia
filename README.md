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
- **Dno studni zabija.** Bezpiecznie można stać tylko na klockach i na dwóch półkach po 2 kratki szerokości (kolumny 3–4 i 7–8, licząc od lewej). Skoczek zaczyna rundę na lewej półce. Układ półek zmienisz w `shared/protocol.js` (`SAFE_PADS`).
- **Ograniczone pole widzenia:** skoczek widzi wycinek 7 kratek szerokości i 14 wysokości (proporcje 1:2 jak cała plansza), który podąża za nim. Rozmiar ustawisz w `shared/protocol.js` (`JUMPER_VIEW`). Przez pierwsze 3 sekundy odliczania widzi całą planszę, potem pojawia się ramka „Twoje pole widzenia” i następuje zbliżenie. Gdy klocek spada nad kadrem, strzałka u góry pokazuje jego kierunek i odległość. Tetris widzi całą planszę i przerywaną ramkę tego, co widzi skoczek.
- **Odbicie od ściany:** skok przy ścianie lub boku klocka wybija skoczka wyżej niż zwykły skok. Każde kolejne odbicie w serii daje więcej siły.
- **Zamiana ról** następuje po każdej rundzie, także po ostatniej, więc rewanż zaczyna się na odwrót.
- **Punkty:** wygrana runda daje 100, Tetris dostaje 20 za każdą linię, skoczek 2 za każdą przetrwaną sekundę.

| | Tetris | Skoczek |
|---|---|---|
| Ruch | ← → lub A D | ← → lub A D |
| Akcja | ↑ obrót, ↓ w dół, Spacja zrzut | ↑ / W / Spacja skok, przy ścianie odbicie |

## Wdrożenie, czyli granie ze znajomymi przez internet

Gra to jeden proces Node, który serwuje stronę, API i WebSocket na jednym porcie. Stan pokoi jest w pamięci, więc zawsze uruchamiaj **jedną instancję**.

### Opcja A: Render.com (najprościej, za darmo)

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
| `VITE_WS_URL` | — | (build) pełny adres WebSocketu, gdy frontend stoi osobno |

## Architektura

```
shared/   wspólne stałe protokołu, pola widzenia, półek i schemat ustawień
server/   Node + Express + ws
  src/game/Engine.js     symulacja rundy (fizyka, kolizje, dno, odbicia)
  src/rooms/Room.js      gracze, role, fazy meczu, pętla 60 Hz
  src/rooms/RoomManager  sesje, kody pokoi, routing wiadomości
  src/config.js          konfiguracja ze zmiennych środowiskowych
  test/                  testy (node:test): silnik + pełny mecz przez WebSocket
client/   React 18 + Vite
  src/game/renderer.js   canvas: kamera skoczka, intro, animacje, efekty
  src/game/theme.js      motyw ciemny/jasny (localStorage + ustawienia systemu)
  src/game/uiFx.js       wstrząsy i uderzenia interfejsu (Web Animations API)
  src/game/outerFx.js    efekty poza planszą: gwiazdki, promienie linii, odłamki, fale, kurz, rozbłysk ramki, poświata, „+punkty”
Dockerfile, docker-compose.yml, deploy/Caddyfile, render.yaml, Makefile
```

- **Serwer jest autorytatywny.** Fizyka liczy się na serwerze (60 ticków/s), stan idzie do graczy 30 razy na sekundę, a klient wysyła tylko wejście.
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
