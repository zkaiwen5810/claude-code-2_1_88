FROM mcr.microsoft.com/devcontainers/javascript-node:22

RUN sed -i 's|http://deb.debian.org/debian|https://mirrors.tuna.tsinghua.edu.cn/debian|g' /etc/apt/sources.list.d/debian.sources \
    && sed -i 's|http://deb.debian.org/debian-security|https://mirrors.tuna.tsinghua.edu.cn/debian-security|g' /etc/apt/sources.list.d/debian.sources

RUN apt-get update && apt-get install -y \
    build-essential \
    python3 \
    python3-pip \
    python3-venv \
    make \
    g++ \
    curl \
    jq \
    ripgrep \
    fd-find \
    zsh \
    bubblewrap \
    vim \
    && rm -rf /var/lib/apt/lists/*

# npm/pnpm/yarn/corepack
ENV NPM_CONFIG_REGISTRY=https://registry.npmmirror.com/

RUN corepack enable && corepack prepare pnpm@latest --activate

# pip source mirror switch
ENV PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple
ENV PIP_TRUSTED_HOST=pypi.tuna.tsinghua.edu.cn

# uv source mirror switch
ENV UV_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple

# install uv
RUN pip3 install --no-cache-dir uv --break-system-packages

# Copy devcontainer bootstrap script into image.
COPY post-create.sh /tmp/post-create.sh

RUN sed -i 's/\r$//' /tmp/post-create.sh \
  && chmod +x /tmp/post-create.sh
