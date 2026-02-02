#!/bin/bash
set -e

echo "Installing Bun "
curl -fsSL https://bun.sh/install | bash

echo "Installing Claude CLI..."
# Install Claude CLI
curl -fsSL https://claude.ai/install.sh | bash


# echo "Running init-firewall.sh..."
# sudo /usr/local/bin/init-firewall.sh
