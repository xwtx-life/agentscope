# Agent Service

Agent service is a FastAPI-based, multi-tenant and multi-session service built with AgentScope 2.0.

This example demonstrates

- how to set up the agent service with Redis storage,
- **JWT email login / registration compatible with v0.1 Redis users
  (Argon2 + tenants; no invitations)**, and
- how to launch the service and its companion Web UI

Details about the agent service please refer to the [tutorial](https://docs.agentscope.io/latest/en/deploy/agent-service).

## Prerequisites

- Python ≥ 3.11
- Node.js ≥ 20 with `npx`
- Redis
- [optional] Gaode/AMap API key in `AMAP_API_KEY` (for the `amap` MCP)

## Quickstart

Install AgentScope from PyPI or source:

```bash
uv pip install agentscope[full]
# or
# uv pip install -e ".[full]"
```

Install auth extras used by this example:

```bash
uv pip install -r examples/agent_service/requirements-auth.txt
# or: pip install "PyJWT" "pwdlib[argon2]" "email-validator"
```

Install Redis and start it as backend storage:

```bash
# macOS (Homebrew)
brew install redis
brew services start redis

# Linux (systemd)
sudo apt install redis-server
sudo systemctl start redis-server

# Docker (cross-platform)
docker run --rm -p 6379:6379 redis:7
```

### Auth configuration

| Variable | Meaning |
|----------|---------|
| `AGENTSCOPE_JWT_SECRET` | Secret used to sign JWTs. **Set this in any shared deployment.** If unset, a development default is used and a warning is printed. |
| `REDIS_HOST` / `REDIS_PORT` | Redis for agent data and auth accounts (default `localhost:6379`). Also accepts `AGENTSCOPE_REDIS_HOST` / `AGENTSCOPE_REDIS_PORT` / `AGENTSCOPE_REDIS_DB` / `AGENTSCOPE_REDIS_PASSWORD`. |
| `AGENTSCOPE_MESSAGE_BUS` | `memory` (default) or `redis` for multi-process / Docker. |
| `AGENTSCOPE_QDRANT_URL` | Remote Qdrant (e.g. `http://qdrant:6333`). If unset, uses in-memory Qdrant. |
| `AGENTSCOPE_WORKSPACE_ROOT` | Workspace directory (Docker default `/var/lib/agentscope/workspaces`). |
| `AGENTSCOPE_BLOB_ROOT` | Blob store directory (Docker default `/var/lib/agentscope/blobs`). |
| `AGENTSCOPE_CORS_ORIGINS` | Comma-separated CORS origins (default `*`). |

Docker parallel upgrade (keep v0.1 online): see [`deploy/docker/README-v02-parallel.md`](../../deploy/docker/README-v02-parallel.md).

### SkillHub (iFlytek) configuration

AgentScope talks to an **existing** SkillHub over HTTP. It does **not**
modify SkillHub. Auth reuses v0.1 Redis keys (`agentscope:auth:users:by_email`,
tenants, memberships). Only the SkillHub source is registered (ClawHub is not).

Default env (optional; UI settings override and persist in Redis):

| Variable | Meaning |
|----------|---------|
| `AGENTSCOPE_SKILLHUB_URL` | SkillHub API base URL (must answer `GET /api/v1/skills`). Default `http://127.0.0.1:8080`. |
| `AGENTSCOPE_SKILLHUB_TOKEN` | Optional Bearer token from SkillHub (API token / PAT). |

In the Web UI, open **Skill Hub** → top-right **settings** icon and set:

- `AGENTSCOPE_SKILLHUB_URL`
- `AGENTSCOPE_SKILLHUB_TOKEN`

Only admins can save; values are applied immediately and stored in Redis.

Acceptance checklist:

1. Sign in with an existing Redis account (v0.1 user system).
2. Open **Skill Hub** — only **SkillHub** appears under sources.
3. Configure URL/token via the settings dialog (or env), then browse and install.

Start the agent service:

```bash
cd examples/agent_service

# recommended for anything beyond local experiments
set AGENTSCOPE_JWT_SECRET=your-long-random-secret

python main.py
```

Launch the Web UI in a separate terminal:

```bash
cd examples/web_ui/

pnpm install
pnpm dev
```

### First-time use

1. Open the Web UI and enter the API endpoint `http://localhost:8000`.
2. **Register** the first account — it becomes **admin** automatically.
3. Sign in; the UI sends `Authorization: Bearer <jwt>` on every API call (not a spoofable username header).
4. As admin, open **Admin** in the sidebar to manage departments and
   assign users’ roles / departments. Self-registration stays open.

Business data (agents, sessions, …) is still scoped by the stable user UUID from the JWT.

### Sharing

This example installs `ShareAllAgentsPolicy`:

- **Everyone** can see and **use** every user-created agent (and the credentials / knowledge bases needed to run them).
- **Only the creator** can edit or delete an agent (`editable: false` for others; the Web UI hides delete/settings).
- Each user’s chat sessions remain private under their own account.

### Verify

```bash
# Public health (no auth)
curl http://localhost:8000/health

# Register
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"alice\",\"password\":\"secret1\"}"

# Business API without token → 401
curl -i http://localhost:8000/agents
```

<img src="https://gw.alicdn.com/imgextra/i2/O1CN01Phmg1G1brIVC8WXyU_!!6000000003518-2-tps-2938-1736.png" alt="Web UI Screenshot" width="100%">

## What Next

- You can customize the service in `main.py` by adding your own MCPs, middlewares, or workspace manager implementations.

- Experience the agent service, including
    - human-in-the-loop interactions & permission system
<img src="https://gw.alicdn.com/imgextra/i1/O1CN01vGGiBw20agWwpzmjy_!!6000000006866-2-tps-2934-1732.png" alt="Permission System" width="100%">

    - schedule tasks
<img src="https://gw.alicdn.com/imgextra/i1/O1CN01Xi3Qw71E2haKKu4z0_!!6000000000294-2-tps-2932-1738.png" alt="Schedule Tasks" width="100%">

    - and more! (stay tuned for future updates)
