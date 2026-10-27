# Studnia — najczęstsze komendy. Wpisz `make` albo `make help`, żeby zobaczyć listę.
SHELL := /bin/sh
.DEFAULT_GOAL := help
PORT ?= 3001

.PHONY: help install dev build start prod test docker docker-run up up-https down logs tunnel clean

help: ## Pokazuje tę listę
	@echo "Studnia — dostępne komendy:"
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36mmake %-11s\033[0m %s\n", $$1, $$2}'

node_modules: package.json package-lock.json
	npm install
	@touch node_modules

install: node_modules ## Instaluje zależności

dev: node_modules ## Tryb deweloperski: frontend :5173 + backend :3001 z przeładowaniem
	npm run dev

build: node_modules ## Buduje frontend do client/dist
	npm run build

start: ## Uruchamia serwer produkcyjny (wymaga wcześniejszego make build)
	NODE_ENV=production PORT=$(PORT) npm start

prod: build start ## Buduje i uruchamia wersję produkcyjną na jednym porcie

test: node_modules ## Uruchamia testy silnika i rozgrywki sieciowej
	npm test

docker: ## Buduje obraz Dockera
	docker build -t studnia:latest .

docker-run: docker ## Uruchamia grę w Dockerze (port: PORT, domyślnie 3001)
	docker run --rm -it -p $(PORT):3001 -v studnia-data:/data studnia:latest

up: ## Uruchamia w tle przez docker compose (VPS, http://IP:3001)
	docker compose up -d --build

up-https: ## Uruchamia z HTTPS: make up-https DOMAIN=gra.example.com
	DOMAIN=$(DOMAIN) docker compose --profile https up -d --build

down: ## Zatrzymuje kontenery
	docker compose --profile https down

logs: ## Pokazuje logi serwera
	docker compose logs -f studnia

tunnel: ## Wystawia lokalny serwer do internetu przez Cloudflare (bez konta)
	npx --yes cloudflared tunnel --url http://localhost:$(PORT)

clean: ## Usuwa node_modules i zbudowane pliki
	rm -rf node_modules */node_modules client/dist
