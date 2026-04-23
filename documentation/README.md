# 4i2e-Arena

A full-stack web application built with Django (backend), React + TypeScript (frontend), PostgreSQL, Redis, and Nginx.

## Architecture

- **Backend**: Django 5.1 with Django REST Framework, WebSockets (Channels), JWT authentication
- **Frontend**: React 18 + TypeScript + Vite with TailwindCSS, i18n support, Three.js
- **Database**: PostgreSQL 16
- **Cache/Queue**: Redis 7
- **Web Server**: Nginx with SSL/TLS support
- **Deployment**: Docker Compose orchestration

## Prerequisites

- Docker (version 20.10+)
- Docker Compose (version 2.0+)
- Make (optional, but recommended)

## Quick Start

### First-Time Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd 4i2e-Arena
   ```

2. **Configure environment variables**
   
   The project includes a `.env` file. Review and update it with your settings:
   ```bash
   # Database
   POSTGRES_DB=ft_transcendence
   POSTGRES_USER=ft_user
   POSTGRES_PASSWORD=ft_password
   POSTGRES_PORT=5432

   # Redis
   REDIS_PORT=6379

   # Django
   DJANGO_SECRET_KEY=change-me-in-production-very-secret-key
   DJANGO_DEBUG=True
   DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,backend

   # CORS
   CORS_ALLOWED_ORIGINS=https://localhost,https://127.0.0.1

   # OAuth (optional - for 42 OAuth)
   OAUTH_42_CLIENT_ID=
   OAUTH_42_CLIENT_SECRET=
   OAUTH_42_REDIRECT_URI=https://localhost/api/accounts/oauth/42/callback/

   # Ports
   HTTPS_PORT=443
   ```

3. **Run the setup command**
   ```bash
   make setup
   ```
   
   This will:
   - Generate self-signed SSL certificates
   - Build all Docker containers
   - Run database migrations
   - Start all services

4. **Access the application**
   - Frontend: https://localhost
   - Backend API: https://localhost/api
   - WebSocket: wss://localhost/ws

   **Note**: You'll see a security warning about the self-signed certificate. This is normal for local development.

### Manual Setup (without Make)

If you prefer not to use Make:

```bash
# 1. Generate SSL certificates
mkdir -p nginx/ssl
bash nginx/ssl/generate-ssl.sh

# 2. Build containers
docker compose build

# 3. Start services
docker compose up -d

# 4. Run migrations
docker compose exec backend python manage.py migrate
```

## Common Commands

### Using Make (Recommended)

| Command | Description |
|---------|-------------|
| `make up` | Start all services |
| `make down` | Stop all services |
| `make build` | Build/rebuild containers |
| `make rebuild` | Rebuild containers from scratch (no cache) |
| `make logs` | View logs from all services |
| `make logs-backend` | View backend logs only |
| `make logs-frontend` | View frontend logs only |
| `make restart` | Restart all services |
| `make status` | Check service status |
| `make migrate` | Run database migrations |
| `make makemigrations` | Create new migration files |
| `make createsuperuser` | Create Django admin user |
| `make shell` | Open Django shell |
| `make test` | Run backend tests |
| `make lint` | Run code linting |
| `make db-shell` | Open PostgreSQL shell |
| `make redis-cli` | Open Redis CLI |
| `make clean` | Stop and remove all containers + volumes ⚠️ |

### Using Docker Compose Directly

```bash
# Start services
docker compose up -d

# Stop services
docker compose down

# View logs
docker compose logs -f

# Restart a service
docker compose restart backend

# Run migrations
docker compose exec backend python manage.py migrate

# Create superuser
docker compose exec backend python manage.py createsuperuser

# Access backend shell
docker compose exec backend python manage.py shell

# Access database
docker compose exec db psql -U ft_user -d ft_transcendence

# Access Redis
docker compose exec redis redis-cli
```

## Development Workflow

### Backend Development

1. **Django shell**
   ```bash
   make shell
   ```

2. **Create migrations**
   ```bash
   make makemigrations
   make migrate
   ```

3. **Run tests**
   ```bash
   make test
   # or with verbose output
   make test-verbose
   ```

4. **Collect static files**
   ```bash
   make collectstatic
   ```

5. **Code formatting**
   ```bash
   docker compose exec backend black .
   docker compose exec backend isort .
   ```

### Frontend Development

The frontend uses Vite with hot module replacement (HMR). Changes are automatically reflected in the browser.

**Browser support target (minor requirement):**
- Chrome (latest 2 stable versions)
- Firefox (latest 2 stable versions + ESR)
- Brave (latest stable, Chromium-based; covered by Chrome target)

Detailed browser compatibility notes, smoke checklist, and known limitations are documented in:
- `documentation/browser-compatibility.md`

1. **Install dependencies** (if package.json changes)
   ```bash
   docker compose exec frontend npm install
   ```

2. **Type checking**
   ```bash
   docker compose exec frontend npm run type-check
   ```

3. **Linting**
   ```bash
   docker compose exec frontend npm run lint
   ```

4. **Build for production**
   ```bash
   docker compose exec frontend npm run build
   ```

## Project Structure

```
4i2e-Arena/
├── backend/              # Django backend application
│   ├── apps/            # Django apps
│   ├── config/          # Django settings and configuration
│   ├── manage.py        # Django management script
│   ├── requirements.txt # Python dependencies
│   └── Dockerfile       # Backend container definition
├── frontend/            # React frontend application
│   ├── src/            # Source code
│   ├── package.json    # Node.js dependencies
│   └── Dockerfile      # Frontend container definition
├── nginx/              # Nginx web server
│   ├── nginx.conf     # Nginx configuration
│   ├── ssl/           # SSL certificates
│   └── Dockerfile     # Nginx container definition
├── docker-compose.yml  # Docker orchestration
├── Makefile           # Convenient command shortcuts
└── .env               # Environment variables
```

## Services Overview

### Database (PostgreSQL)
- **Port**: 5432 (configurable)
- **Health check**: Automatic readiness probe
- **Data persistence**: Named volume `postgres_data`

### Cache (Redis)
- **Port**: 6379 (configurable)
- **Configuration**: Append-only file, 256MB max memory with LRU eviction
- **Data persistence**: Named volume `redis_data`

### Backend (Django)
- **Internal port**: 8000
- **Framework**: Django 5.1 with DRF
- **Features**: REST API, WebSockets, JWT auth, 2FA support
- **ASGI server**: Daphne

### Frontend (React)
- **Build tool**: Vite
- **Features**: TypeScript, TailwindCSS, i18n, Three.js ready
- **Dev server**: Hot module replacement enabled

### Web Server (Nginx)
- **Port**: 443 (HTTPS)
- **Features**: SSL/TLS termination, reverse proxy, static file serving
- **Certificate**: Self-signed (development only)

## Troubleshooting

### Services won't start
```bash
# Check service status
make status

# View logs
make logs

# Restart services
make restart
```

### Database connection issues
```bash
# Check database health
docker compose ps db

# Access database directly
make db-shell

# Reset database (⚠️ deletes all data)
make clean
make setup
```

### SSL certificate errors
```bash
# Regenerate certificates
make ssl-generate
make restart
```

### Port conflicts
If ports 443, 5432, or 6379 are already in use, update the `.env` file:
```bash
HTTPS_PORT=8443
POSTGRES_PORT=5433
REDIS_PORT=6380
```

### Clear everything and start fresh
```bash
# Stop services and remove all data
make clean

# Remove unused Docker resources
make prune

# Start fresh
make setup
```

## Production Considerations

⚠️ **This setup is for development only**. For production:

1. **Security**
   - Use a proper SSL certificate (Let's Encrypt, commercial CA)
   - Change `DJANGO_SECRET_KEY` to a strong random value
   - Set `DJANGO_DEBUG=False`
   - Use strong database passwords
   - Configure OAuth credentials properly

2. **Performance**
   - Increase Redis max memory
   - Configure PostgreSQL for production workload
   - Use production-grade ASGI server settings
   - Enable Django's static file serving via CDN

3. **Monitoring**
   - Add logging and monitoring solutions
   - Configure health checks
   - Set up backup strategies for database

## Contributing

1. Create a feature branch
2. Make your changes
3. Run tests: `make test`
4. Run linting: `make lint`
5. Submit a pull request

## License

[Your License Here]
