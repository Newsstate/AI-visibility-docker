#!/bin/bash

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'
ok()   { echo -e "  ${GREEN}[OK]${NC} $1"; }
info() { echo -e "  ${BLUE}[INFO]${NC} $1"; }
err()  { echo -e "  ${RED}[ERROR]${NC} $1"; }

OS="linux"
[[ "$OSTYPE" == "darwin"* ]] && OS="mac"

echo ""
echo -e "${BOLD} ==========================================${NC}"
echo -e "${BOLD}  Install Prerequisites${NC}"
echo -e "${BOLD} ==========================================${NC}"
echo ""

# ── MAC ───────────────────────────────────────────────────────────
if [ "$OS" == "mac" ]; then
    # Check Homebrew
    if ! command -v brew &>/dev/null; then
        info "Installing Homebrew..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    fi
    ok "Homebrew found"

    # Node.js
    if ! command -v node &>/dev/null; then
        info "Installing Node.js..."
        brew install node
    fi
    ok "Node.js $(node -v)"

    # PostgreSQL
    if ! command -v psql &>/dev/null; then
        info "Installing PostgreSQL..."
        brew install postgresql@16
        brew services start postgresql@16
        echo 'export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"' >> ~/.zshrc
        echo 'export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"' >> ~/.bash_profile
        export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
    else
        brew services start postgresql@16 2>/dev/null || brew services start postgresql 2>/dev/null
    fi
    ok "PostgreSQL ready"

    # Redis
    if ! command -v redis-server &>/dev/null; then
        info "Installing Redis..."
        brew install redis
        brew services start redis
    else
        brew services start redis 2>/dev/null
    fi
    ok "Redis ready"

# ── LINUX (Ubuntu/Debian) ─────────────────────────────────────────
else
    sudo apt-get update -qq

    # Node.js
    if ! command -v node &>/dev/null; then
        info "Installing Node.js 20..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
    fi
    ok "Node.js $(node -v)"

    # PostgreSQL
    if ! command -v psql &>/dev/null; then
        info "Installing PostgreSQL..."
        sudo apt-get install -y postgresql postgresql-contrib
        sudo service postgresql start
    else
        sudo service postgresql start 2>/dev/null
    fi
    ok "PostgreSQL ready"

    # Redis
    if ! command -v redis-server &>/dev/null; then
        info "Installing Redis..."
        sudo apt-get install -y redis-server
        sudo service redis-server start
    else
        sudo service redis-server start 2>/dev/null
    fi
    ok "Redis ready"
fi

echo ""
echo -e "${BOLD} ==========================================${NC}"
echo -e "${BOLD}  All prerequisites installed!${NC}"
echo -e "${BOLD} ==========================================${NC}"
echo ""
echo "  Now run:  ./start.sh"
echo ""
