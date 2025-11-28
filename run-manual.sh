#!/usr/bin/env bash
set -e

echo "-----------------------------------------------------"
echo "   n8n-nodes-zyndai - Manual Local Install Script"
echo "   Works on macOS & Linux"
echo "-----------------------------------------------------"

# Detect OS
OS="$(uname -s)"

# Choose HOME directory
if [[ "$OS" == "Darwin" || "$OS" == "Linux" ]]; then
    N8N_DIR="$HOME/.n8n/custom"
else
    echo "Unsupported OS: $OS"
    exit 1
fi

echo "[1/6] Installing n8n globally..."
npm install -g n8n

echo "[2/6] Installing dependencies..."
pnpm install

echo "[3/6] Building n8n-nodes-zyndai..."
pnpm run build

echo "[4/6] Linking package globally..."
npm link

echo "[5/6] Preparing ~/.n8n/custom directory..."
mkdir -p "$N8N_DIR"

echo "[6/6] Linking global package inside ~/.n8n/custom..."
cd "$N8N_DIR"
npm link n8n-nodes-zyndai

echo "-----------------------------------------------------"
echo "Installation complete!"
echo "Launching n8n..."
echo "-----------------------------------------------------"

n8n start
