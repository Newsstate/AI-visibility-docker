#!/bin/bash

# ── Colors ────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

ok()   { echo -e "  ${GREEN}[OK]${NC} $1"; }
warn() { echo -e "  ${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "  ${RED}[ERROR]${NC} $1"; }
info() { echo -e "  ${BLUE}[INFO]${NC} $1"; }

echo ""
echo -e "${BOLD} ==========================================${NC}"
echo -e "${BOLD}  AI Visibility — Setup & Start${NC}"
echo -e "${BOLD} ==========================================${NC}"
echo ""

# ── Detect OS ─────────────────────────────────────────────────────
OS="linux"
if [[ "$OSTYPE" == "darwin"* ]]; then OS="mac"; fi

# ── Check Node.js ─────────────────────────────────────────────────
if ! command -v node &> /dev/null; then
    err "Node.js is not installed."
    echo ""
    if [ "$OS" == "mac" ]; then
        echo "  Install via Homebrew:  brew install node"
        echo "  Or download from:      https://nodejs.org"
    else
        echo "  Install:  sudo apt install nodejs npm   (Ubuntu/Debian)"
        echo "  Or:       https://nodejs.org/en/download"
    fi
    echo ""
    exit 1
fi
NODE_VER=$(node -v)
ok "Node.js $NODE_VER found"

# ── Check npm ─────────────────────────────────────────────────────
if ! command -v npm &> /dev/null; then
    err "npm not found. Re-install Node.js."
    exit 1
fi
ok "npm found"

# ── Check PostgreSQL ──────────────────────────────────────────────
if ! command -v psql &> /dev/null; then
    err "PostgreSQL not installed."
    echo ""
    if [ "$OS" == "mac" ]; then
        echo "  Install:  brew install postgresql@16"
        echo "  Start:    brew services start postgresql@16"
    else
        echo "  Install:  sudo apt install postgresql postgresql-contrib"
        echo "  Start:    sudo service postgresql start"
    fi
    echo ""
    exit 1
fi
ok "PostgreSQL found"

# ── Check Redis ───────────────────────────────────────────────────
if ! command -v redis-server &> /dev/null; then
    err "Redis not installed."
    echo ""
    if [ "$OS" == "mac" ]; then
        echo "  Install:  brew install redis"
        echo "  Start:    brew services start redis"
    else
        echo "  Install:  sudo apt install redis-server"
        echo "  Start:    sudo service redis-server start"
    fi
    echo ""
    exit 1
fi
ok "Redis found"

# ── Check project structure ───────────────────────────────────────
echo ""
echo -e "${BOLD}── Checking project structure ─────────────────────────────${NC}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -f "backend/package.json" ]; then
    err "Cannot find backend/package.json. Run this script from the ai-visibility folder."
    exit 1
fi
if [ ! -f "frontend/package.json" ]; then
    err "Cannot find frontend/package.json."
    exit 1
fi
ok "Project files found"

# ── Start Redis if not running ────────────────────────────────────
echo ""
echo -e "${BOLD}── Starting Redis ──────────────────────────────────────────${NC}"
if ! redis-cli ping &> /dev/null; then
    info "Redis not running — starting it..."
    if [ "$OS" == "mac" ]; then
        brew services start redis 2>/dev/null || redis-server --daemonize yes
    else
        sudo service redis-server start 2>/dev/null || redis-server --daemonize yes
    fi
    sleep 1
    if redis-cli ping &> /dev/null; then
        ok "Redis started"
    else
        err "Could not start Redis. Start it manually: redis-server"
        exit 1
    fi
else
    ok "Redis already running"
fi

# ── Start PostgreSQL if not running ───────────────────────────────
echo ""
echo -e "${BOLD}── Starting PostgreSQL ─────────────────────────────────────${NC}"
if ! pg_isready -q 2>/dev/null; then
    info "PostgreSQL not running — starting it..."
    if [ "$OS" == "mac" ]; then
        brew services start postgresql@16 2>/dev/null || \
        brew services start postgresql 2>/dev/null
    else
        sudo service postgresql start 2>/dev/null
    fi
    sleep 2
fi
if pg_isready -q 2>/dev/null; then
    ok "PostgreSQL running"
else
    err "Could not start PostgreSQL. Start it manually."
    exit 1
fi

# ── Setup database ────────────────────────────────────────────────
echo ""
echo -e "${BOLD}── Setting up database ─────────────────────────────────────${NC}"
# Create user + DB (suppress errors if already exists)
if [ "$OS" == "mac" ]; then
    psql postgres -c "CREATE USER aiv WITH PASSWORD 'aiv_secret';" 2>/dev/null
    psql postgres -c "CREATE DATABASE ai_visibility OWNER aiv;" 2>/dev/null
    psql postgres -c "GRANT ALL PRIVILEGES ON DATABASE ai_visibility TO aiv;" 2>/dev/null
else
    sudo -u postgres psql -c "CREATE USER aiv WITH PASSWORD 'aiv_secret';" 2>/dev/null
    sudo -u postgres psql -c "CREATE DATABASE ai_visibility OWNER aiv;" 2>/dev/null
    sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ai_visibility TO aiv;" 2>/dev/null
fi
ok "Database ready"

# ── Setup .env ────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}── Environment setup ───────────────────────────────────────${NC}"
if [ ! -f "backend/.env" ]; then
    cp backend/.env.example backend/.env
    warn "Created backend/.env — opening it for you to add API keys..."
    echo ""
    echo -e "  ${BOLD}IMPORTANT: Fill in at minimum:${NC}"
    echo -e "    ANTHROPIC_API_KEY  →  https://console.anthropic.com"
    echo -e "    OPENAI_API_KEY     →  https://platform.openai.com"
    echo ""
    sleep 1
    # Open in default editor
    if [ "$OS" == "mac" ]; then
        open -e backend/.env
    elif command -v nano &>/dev/null; then
        nano backend/.env
    elif command -v vim &>/dev/null; then
        vim backend/.env
    else
        echo "  Please edit backend/.env manually, then press Enter to continue."
    fi
    echo ""
    read -p "  Press Enter once you've saved your API keys..."
else
    ok "backend/.env already exists"
fi

# ── Install dependencies ──────────────────────────────────────────
echo ""
echo -e "${BOLD}── Installing dependencies ─────────────────────────────────${NC}"

if [ ! -d "backend/node_modules" ]; then
    info "Installing backend dependencies..."
    cd backend && npm install --silent && cd ..
    ok "Backend dependencies installed"
else
    ok "Backend node_modules present"
fi

if [ ! -d "frontend/node_modules" ]; then
    info "Installing frontend dependencies..."
    cd frontend && npm install --silent && cd ..
    ok "Frontend dependencies installed"
else
    ok "Frontend node_modules present"
fi

# ── Run migrations ────────────────────────────────────────────────
echo ""
echo -e "${BOLD}── Running database migrations ─────────────────────────────${NC}"
cd backend
node src/db/migrate.js
if [ $? -ne 0 ]; then
    err "Migration failed. Check DATABASE_URL in backend/.env"
    err "Should be: postgresql://aiv:aiv_secret@localhost:5432/ai_visibility"
    cd ..
    exit 1
fi
cd ..
ok "Database migrated"

# ── Launch ────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD} ==========================================${NC}"
echo -e "${BOLD}  Launching AI Visibility...${NC}"
echo -e "${BOLD} ==========================================${NC}"
echo ""
echo -e "  Backend API  →  ${BLUE}http://localhost:4000${NC}"
echo -e "  Frontend     →  ${BLUE}http://localhost:3000${NC}"
echo ""
echo -e "  ${YELLOW}Press Ctrl+C to stop both servers${NC}"
echo ""

# Open browser after delay
(sleep 4 && open "http://localhost:3000" 2>/dev/null || xdg-open "http://localhost:3000" 2>/dev/null) &

# Run both servers — backend in background, frontend in foreground
# Use trap to kill both on Ctrl+C
cleanup() {
    echo ""
    info "Stopping servers..."
    kill $BACKEND_PID 2>/dev/null
    exit 0
}
trap cleanup INT TERM

# Start backend
cd backend
npm run dev &
BACKEND_PID=$!
cd ..

sleep 2

# Start frontend (foreground — keeps terminal alive)
cd frontend
npm run dev
