.DEFAULT_GOAL := setup

setup: ssl-generate build up ## First-time project setup: generates SSL, builds images, starts all services
	@echo ""
	@echo "Setup complete! Migrations are running inside the backend container."
	@echo "Run 'make logs-backend' to follow progress."
	@echo ""

up:
	docker compose up -d

stop:
	docker compose stop

down:
	docker compose down

build:
	docker compose build

rebuild:
	docker compose build --no-cache

logs:
	docker compose logs -f

logs-backend:
	docker compose logs -f backend

logs-frontend:
	docker compose logs -f frontend

restart:
	docker compose restart

restart-backend:
	docker compose restart backend

status:
	docker compose ps

migrate: ## Run Django database migrations
	docker compose exec backend python manage.py migrate

makemigrations: ## Generate Django migrations after model changes
	docker compose exec backend python manage.py makemigrations

shell: ## Open Django interactive shell
	docker compose exec backend python manage.py shell

collectstatic: ## Collect Django static files
	docker compose exec backend python manage.py collectstatic --noinput

lint: ## Run linting on backend code
	docker compose exec backend flake8 .

db-shell: ## Open PostgreSQL interactive shell
	docker compose exec db psql -U $${POSTGRES_USER:-ft_user} -d $${POSTGRES_DB:-ft_transcendence}

redis-cli: ## Open Redis CLI
	docker compose exec redis redis-cli

ssl-generate: ## Generate self-signed SSL certificates for local development
	@echo " Generating self-signed SSL certificates..."
	@mkdir -p nginx/ssl
	@bash nginx/ssl/generate-ssl.sh
	@echo "SSL certificates generated in nginx/ssl/"

clean: ## Stop services and remove volumes
	docker compose down -v --remove-orphans
	@echo "All containers, networks, and volumes removed."

fclean: ## Full clean: stop services, remove volumes, and remove all built images
	docker compose down -v --remove-orphans --rmi all
	@echo "All containers, networks, volumes, and images removed."

prune: ## Remove all unused Docker resources
	docker system prune -f
	@echo "Docker system pruned."

.PHONY: help setup up down build rebuild logs \
        migrate makemigrations shell \
        lint clean fclean ssl-generate \
        db-shell redis-cli
