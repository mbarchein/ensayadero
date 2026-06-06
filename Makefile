.PHONY: dev db-start db-stop db-reset migrate-new functions-serve preview infra-plan infra-apply

dev: db-start ## Supabase local + frontend dev
	cd app && npm run dev

db-start: ## Levanta stack Supabase local (docker via CLI)
	supabase start

db-stop:
	supabase stop

db-reset: ## Recrea DB local aplicando migraciones + seed
	supabase db reset

migrate-new: ## make migrate-new name=add_x
	supabase migration new $(name)

functions-serve: ## Edge functions en local
	supabase functions serve --env-file .env

preview: ## Build prod servido en :8080
	docker compose --profile preview up --build app-preview

infra-plan:
	cd infra && terraform plan

infra-apply:
	cd infra && terraform apply
