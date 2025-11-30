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

echo "[0/6] Starting ngrok tunnel on port 5678..."
# Start ngrok in background and suppress logs
ngrok http 5678 --log=stdout > ngrok.log 2>&1 &

# Wait for ngrok to initialise
sleep 3

# Extract public URL from ngrok API
NGROK_URL=$(curl -s http://127.0.0.1:4040/api/tunnels | grep -o 'https://[-0-9a-z]*\.ngrok-free\.app')

if [[ -z "$NGROK_URL" ]]; then
    echo "❌ Could not fetch ngrok public URL. Is ngrok running?"
    exit 1
fi

echo "Ngrok URL detected: $NGROK_URL"

# Export env variables
export N8N_EDITOR_BASE_URL="$NGROK_URL"
export N8N_PUBLIC_API_BASE_URL="$NGROK_URL"
export WEBHOOK_URL="$NGROK_URL"

echo "Exported:"
echo "  N8N_EDITOR_BASE_URL=$N8N_EDITOR_BASE_URL"
echo "  N8N_PUBLIC_API_BASE_URL=$N8N_PUBLIC_API_BASE_URL"
echo "  WEBHOOK_URL=$WEBHOOK_URL"

echo "[1/6] Installing n8n globally..."
npm install -g n8n
npm install -g nodemon

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

npx nodemon --watch ./dist --exec "n8n start"