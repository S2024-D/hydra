#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

echo ""
echo "========================================="
echo "  Hydra Terminal Manager - Installer"
echo "========================================="
echo ""

# ---- OS Check ----
OS="$(uname -s)"
if [ "$OS" != "Darwin" ]; then
    error "This installer supports macOS only. Detected: $OS"
fi

# ---- Xcode Command Line Tools ----
if xcode-select -p &>/dev/null; then
    info "Xcode Command Line Tools: already installed"
else
    info "Installing Xcode Command Line Tools..."
    xcode-select --install
    echo ""
    warn "Xcode CLI Tools install popup will appear. Click 'Install'."
    warn "After installation, run this script again."
    exit 0
fi

# ---- Homebrew ----
if command -v brew &>/dev/null; then
    info "Homebrew: already installed"
else
    info "Installing Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

    # Add brew to PATH for Apple Silicon
    if [ -f /opt/homebrew/bin/brew ]; then
        eval "$(/opt/homebrew/bin/brew shellenv)"
    fi
fi

# ---- Node.js ----
if command -v node &>/dev/null; then
    NODE_VER=$(node -v)
    info "Node.js: already installed ($NODE_VER)"

    MAJOR_VER=$(echo "$NODE_VER" | sed 's/v//' | cut -d. -f1)
    if [ "$MAJOR_VER" -lt 18 ]; then
        warn "Node.js v18+ required. Upgrading..."
        brew install node
    fi
else
    info "Installing Node.js..."
    brew install node
fi

# ---- Python 3 (for node-gyp) ----
if command -v python3 &>/dev/null; then
    info "Python: already installed ($(python3 --version))"
else
    info "Installing Python 3..."
    brew install python3
fi

# ---- Git ----
if command -v git &>/dev/null; then
    info "Git: already installed"
else
    info "Installing Git..."
    brew install git
fi

# ---- Clone or update repo ----
REPO_URL="https://github.com/S2024-D/hydra.git"
INSTALL_DIR="$HOME/hydra"

if [ -d "$INSTALL_DIR/.git" ]; then
    info "Hydra repo found at $INSTALL_DIR. Pulling latest..."
    cd "$INSTALL_DIR"
    git pull
else
    info "Cloning Hydra to $INSTALL_DIR..."
    git clone "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

# ---- npm install ----
info "Installing npm dependencies..."
npm install

# ---- Rebuild native modules (node-pty) ----
info "Rebuilding native modules for Electron..."
npx @electron/rebuild

# ---- Build ----
info "Building Hydra..."
npm run build
npm run copy:html

# ---- Done ----
echo ""
echo "========================================="
echo -e "  ${GREEN}Installation complete!${NC}"
echo "========================================="
echo ""
echo "  To start Hydra:"
echo "    cd $INSTALL_DIR && npm start"
echo ""
echo "  To build distributable:"
echo "    cd $INSTALL_DIR && npm run dist:mac"
echo ""
