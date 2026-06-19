FROM mcr.microsoft.com/devcontainers/javascript-node:22

RUN sed -i 's|http://deb.debian.org/debian|https://mirrors.tuna.tsinghua.edu.cn/debian|g' /etc/apt/sources.list.d/debian.sources \
    && sed -i 's|http://deb.debian.org/debian-security|https://mirrors.tuna.tsinghua.edu.cn/debian-security|g' /etc/apt/sources.list.d/debian.sources

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
    bubblewrap \
    && rm -rf /var/lib/apt/lists/*

# npm/pnpm/yarn/corepack
ENV NPM_CONFIG_REGISTRY=https://registry.npmmirror.com/

RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy devcontainer bootstrap script into image.
COPY post-create.sh /tmp/post-create.sh

RUN sed -i 's/\r$//' /tmp/post-create.sh \
  && chmod +x /tmp/post-create.sh
