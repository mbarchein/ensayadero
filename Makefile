.DEFAULT_GOAL := help
.PHONY: help up down reset logs ps psql seed-users test typecheck build preview clean infra-plan infra-apply

help: ## Lista de comandos
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

up: ## Levanta stack completo local (app :5173, API :54321, db :54322)
	docker compose up -d
	@echo "App:     http://localhost:5173"
	@echo "API:     http://localhost:54321"
	@echo "Postgres: localhost:54322 (supabase_admin/postgres)"

down: ## Para el stack
	docker compose down

reset: ## Destruye la DB y re-aplica migraciones + seed
	docker compose down -v
	docker compose up -d

logs: ## Logs de todos los servicios
	docker compose logs -f --tail=50

ps: ## Estado de servicios
	docker compose ps

psql: ## Shell SQL en la DB local
	docker compose exec db psql -U supabase_admin -d postgres

seed-users: ## Crea usuarios de prueba + grupo demo (password123)
	bash docker/seed-users.sh

test: ## Tests del frontend
	docker compose exec app npm test

typecheck: ## Typecheck del frontend
	docker compose exec app npm run typecheck

build: ## Build de producción del frontend
	docker compose exec app npm run build

preview: ## Build prod servido en :8080
	docker compose --profile preview up --build -d app-preview

clean: ## Para todo y borra volúmenes (DB incluida)
	docker compose --profile preview down -v

infra-plan: ## terraform plan
	cd infra && terraform plan

infra-apply: ## terraform apply
	cd infra && terraform apply
