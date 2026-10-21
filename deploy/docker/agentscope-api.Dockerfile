# Deps-only API runtime. Application code is NOT baked in — mount host
# src/ + examples/agent_service/ at run time (see compose.v02-parallel.yml).
FROM node:22-bookworm-slim AS node-runtime

FROM python:3.11-slim-bookworm AS deps

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update \
    && apt-get install --no-install-recommends -y \
        ca-certificates \
        build-essential \
        git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/agentscope
COPY pyproject.toml README.md README_zh.md ./
COPY src ./src
# Only the auth requirements file is needed at build time.
COPY examples/agent_service/requirements-auth.txt \
    ./examples/agent_service/requirements-auth.txt

RUN python -m pip install --upgrade pip \
    && python -m pip install \
        ".[models,service,storage-redis,rag,vdb-qdrant]" \
    && python -m pip install \
        -r examples/agent_service/requirements-auth.txt \
    && find /usr/local -type d -name '__pycache__' -exec rm -rf {} + 2>/dev/null || true \
    && rm -rf /root/.cache /tmp/*


FROM python:3.11-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HOME=/home/agentscope \
    PYTHONPATH=/opt/agentscope/src

RUN apt-get update \
    && apt-get install --no-install-recommends -y \
        ca-certificates \
        ripgrep \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --home-dir /home/agentscope --shell /usr/sbin/nologin agentscope

COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
COPY --from=node-runtime /usr/local/bin/npm /usr/local/bin/npm
COPY --from=node-runtime /usr/local/bin/npx /usr/local/bin/npx
COPY --from=node-runtime /usr/local/lib/node_modules /usr/local/lib/node_modules

# Installed Python packages + console scripts (uvicorn, etc.)
COPY --from=deps /usr/local/lib/python3.11/site-packages \
    /usr/local/lib/python3.11/site-packages
COPY --from=deps /usr/local/bin /usr/local/bin

WORKDIR /opt/agentscope
# Mount points for host code (compose binds these).
RUN mkdir -p \
        /opt/agentscope/src \
        /opt/agentscope/examples/agent_service \
        /var/lib/agentscope/workspaces \
        /var/lib/agentscope/blobs \
        /var/lib/agentscope/skill_submissions \
    && chown -R agentscope:agentscope \
        /opt/agentscope \
        /var/lib/agentscope \
        /home/agentscope

USER agentscope

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=10 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)"

# Code must be mounted: src + examples/agent_service
CMD ["python", "examples/agent_service/main.py"]
