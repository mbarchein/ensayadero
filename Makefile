.DEFAULT_GOAL := help
.PHONY: help up down reset logs ps psql seed-users test typecheck build preview clean infra-plan infra-apply

help: ## List of commands
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

up: ## Bring up the full local stack (app :5173, API :54321, db :54322)
	docker compose up -d
	@echo "App:      http://localhost:5173"
	@echo "API:      http://localhost:54321"
	@echo "Mailpit:  http://localhost:54324"
	@echo "Postgres: localhost:54322 (supabase_admin/postgres)"

down: ## Stop the stack
	docker compose down

reset: ## Destroy the DB and re-apply migrations + seed
	docker compose down -v
	docker compose up -d

logs: ## Logs of all services
	docker compose logs -f --tail=50

ps: ## Service status
	docker compose ps

psql: ## SQL shell on the local DB
	docker compose exec db psql -U supabase_admin -d postgres

seed-users: ## Create test users + demo group (password123)
	bash docker/seed-users.sh

test: ## Frontend tests
	docker compose exec app npm test

typecheck: ## Frontend typecheck
	docker compose exec app npm run typecheck

build: ## Production build of the frontend
	docker compose exec app npm run build

preview: ## Prod build served on :8080
	docker compose --profile preview up --build -d app-preview

clean: ## Stop everything and delete volumes (DB included)
	docker compose --profile preview down -v

infra-plan: ## terraform plan
	cd infra && terraform plan

infra-apply: ## terraform apply
	cd infra && terraform apply
