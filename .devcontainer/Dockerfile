FROM mcr.microsoft.com/devcontainers/javascript-node:22

RUN apt-get update && apt-get install -y \
    build-essential \
    python3 \
    make \
    g++ \
    curl \
    jq \
    ripgrep \
    fd-find \
    zsh \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@latest --activate
