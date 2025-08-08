#!/bin/bash
set -e

echo "Installing Bun and Claude CLI..."
curl -fsSL https://bun.sh/install | bash
~/.bun/bin/bun add -g @anthropic-ai/claude-code

# Try to trust the package, but don't fail if it's already trusted or has no scripts
echo "Trusting Claude CLI package (if needed)..."
~/.bun/bin/bun pm -g trust @anthropic-ai/claude-code 2>/dev/null || true

# echo "Running init-firewall.sh..."
# sudo /usr/local/bin/init-firewall.sh
