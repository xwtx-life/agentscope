# 只上线 v0.2，不动 v0.1

**不需要 v0.1 源码。** 现网容器继续跑即可。v0.2 API 镜像只带依赖，业务代码
（`src/` + `examples/agent_service/`）挂在宿主机上改。

| 做什么 | 不要做什么 |
|--------|------------|
| 现网目录 **`/home/agent/v2`**：镜像包与 `docker/` 同级 | **不要**在现网机执行 `./up.sh` / `compose.yml`（会和 v0.1 抢端口、抢项目名） |
| 只用 `v2/docker/*-v02.sh`；改后端后 `restart agentscope-api-v2` | **不要**为改业务代码重打 API 镜像 |
| JWT 由 `./pull-v01-secrets.sh` 从现网容器自动同步 | **不要** `docker compose down -v`、**不要**停 Redis / Qdrant / SkillHub |

同目录 [README.md](./README.md) / `compose.yml` 仅供「全新空机装全量栈」；**有 v0.1 在线时忽略它们。**

## 拓扑

**v0.2 无网关**：API / Web 直接映射宿主机端口（浏览器打开 Web，setup 里填 API）。

| 入口 | 谁在听 | 说明 |
|------|--------|------|
| `http://<LAN>:18080` | v0.1 gateway | **保持不动** |
| `http://<LAN>:18081` | v0.1 SkillHub | **两边共用，不动** |
| `http://<LAN>:18082` | v0.2 `agentscope-web-v2` | 前端静态页（`WEB_HTTP_PORT`） |
| `http://<LAN>:18083` | v0.2 `agentscope-api-v2` | API（`API_HTTP_PORT`）；setup 的 server URL |

v0.2 服务名带 `-v2`，避免与现网 `agentscope-api` DNS 冲突。

## 前置（在现网 Ubuntu 上查，无需源码）

```bash
# 现网是否在跑
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}' | grep -E 'agentscope|skillhub|gateway|qdrant|redis'

docker network ls | grep agentscope
# 常见: agentscope-stack_default  → 写入 .env.v02 的 V01_DOCKER_NETWORK

docker volume ls | grep agentscope
# 常见:
#   agentscope-stack_agentscope_workspaces
#   agentscope-stack_agentscope_blobs
#   agentscope-stack_agentscope_skill_submissions
```

JWT / 加密密钥 / Docker 网络名由 `./pull-v01-secrets.sh` 在现网机自动写入
`.env.v02`（`./up-v02.sh` 会先调用它）。卷名若与默认不同，再手改 `V01_VOLUME_*`。

## 备份（可选，不关服）

```bash
mkdir -p backups && cd backups
for vol in \
  agentscope-stack_agentscope_redis \
  agentscope-stack_agentscope_qdrant \
  agentscope-stack_agentscope_workspaces \
  agentscope-stack_agentscope_blobs \
  agentscope-stack_skillhub_postgres
do
  docker volume inspect "$vol" >/dev/null 2>&1 || continue
  docker run --rm \
    -v "${vol}:/source:ro" \
    -v "$PWD":/backup \
    alpine:3.20 \
    tar czf "/backup/${vol}.tgz" -C /source .
done
```

## MCP（默认关闭）

v0.2 默认 `AGENTSCOPE_ENABLE_MCP=0`：不注入 Playwright/Amap，不挂 GitHub MCP Hub。
侧栏与聊天页也不再请求 `/workspace/mcp`。需要时在 `.env.v02` 设 `AGENTSCOPE_ENABLE_MCP=1`
并 `restart agentscope-api-v2`（前端需重打 web 镜像才重新露出入口）。

## 联网机构建镜像（用本仓库 = v0.2）

API 镜像**只含 Python/Node 依赖**，不含业务代码。`src/` 与
`examples/agent_service/` 从宿主机挂载，改代码后 `restart` 即可，不必重打大镜像。

```bash
cd deploy/docker
cp .env.v02.example .env.v02
# 填 LAN_HOST、CORS（JWT 留给现网机自动拉取）
# 现网包布局固定 AGENTSCOPE_HOST_ROOT=../source（相对 docker/）

chmod +x *.sh
./export-images-v02.sh
```

得到与 `docker/` 同级：

- `agentscope-v02-overlay-images.tar`（api deps + web + nginx）
- `agentscope-v02-src.tar.gz`（可挂载的后端代码）

拷到现网机目录 **`/home/agent/v2`**（`docker/` 与镜像包同级）：

```text
/home/agent/v2/
  agentscope-v02-overlay-images.tar
  agentscope-v02-overlay-images.tar.sha256
  agentscope-v02-src.tar.gz
  agentscope-v02-src.tar.gz.sha256
  docker/                       # 本目录全部脚本与 compose
```

## 现网机只启动 v0.2（不动 v0.1）

**现网机可以完全没外网。** 禁止在现网机执行：

- `./build-v02.sh` / `./export-images-v02.sh`（会 pip / npm）
- `docker compose build` / `docker pull` / `pip install`

流程：解压源码 → `docker load` → `up --pull never`。

解压后布局：

```text
/home/agent/v2/
  agentscope-v02-overlay-images.tar   # 镜像包（与 docker 同级）
  agentscope-v02-src.tar.gz
  source/                             # 解压目标；宿主机可直接改
    src/
    examples/agent_service/
  docker/
    up-v02.sh
    compose.v02-parallel.yml
    .env.v02                          # AGENTSCOPE_HOST_ROOT=../source
    ...
```

```bash
cd /home/agent/v2/docker
chmod +x *.sh
bash ./import-images.sh    # 首次：导入镜像
# 按需改 .env.v02 的 LAN_HOST / CORS（HOST_ROOT / 端口由 up 自动校正）
bash ./up-v02.sh           # 自动：去 \r、HOST_ROOT=../source、解压 source/、启动

# 浏览器 http://<LAN>:18082 ；setup 的 server URL = http://<LAN>:18083

# 改后端后：
docker compose --env-file .env.v02 -f compose.v02-parallel.yml restart agentscope-api-v2
```

`up-v02.sh` 会自动：

- 去掉 `.env.v02` 的 `\r`
- `AGENTSCOPE_HOST_ROOT=../source`
- 探测本机 IP → `LAN_HOST`，并写好 `AGENTSCOPE_CORS_ORIGINS`（WEB 源）
- 缺源码则解压 `../agentscope-v02-src.tar.gz` → `../source`
- 拉 JWT、`--force-recreate` 启动（无网关，18082 Web / 18083 API）

若 `docker load` 报 **`unrecognized image format`**：说明拷的是 OCI 包（Docker Desktop 直出）。请改用本仓库最新导出的
`agentscope-v02-overlay-images.tar`（内含 `*.legacy.tar`，兼容旧版 Docker）。

若仍在跑旧的 `gateway-v2`，`up-v02.sh` 会用 `--remove-orphans` 清掉；也可手动：
`docker rm -f $(docker ps -q --filter name=gateway-v2)`。

现网机**不要** `build` / `pip` / `pull`；改依赖包时才需在联网机重打 API 镜像。

只停 v0.2 overlay（共享卷仍留给 v0.1）：

```bash
./down-v02.sh
```

## 验收

1. `curl http://127.0.0.1:18083/health` 正常。
2. 浏览器打开 `http://<LAN>:18082`；setup 的 server URL 填 `http://<LAN>:18083`。
3. 用现网账号登录；刷新 `/chat/...` 应仍是前端页（不是 JSON）。
4. Skill Hub 管理台仍是 `18081`。
5. 再确认 `18080` 现网仍通。

## 以后若要切流（可选，验收通过后再做）

仍可不依赖 v0.1 源码，用容器名操作。SkillHub / Redis / Qdrant 全程不要停。
回滚：`./down-v02.sh`（勿加 `-v`），v0.1 的 `18080` 保持不动即可。

## 脚本（本次只用这些）

| 脚本 | 作用 |
|------|------|
| `pull-v01-secrets.sh` | 从现网 v0.1 API 容器同步 JWT / 加密密钥 / 网络名 |
| `check-env-v02.sh` | 检查 `.env.v02`、现网 network/volume |
| `build-v02.sh` / `export-images-v02.sh` | 构建 / 导出镜像 + 源码包 |
| `export-src-v02.sh` | 只打后端源码包（`src` + `examples/agent_service`） |
| `up-v02.sh` | 拉密钥后**只**启动 v0.2 overlay |
| `down-v02.sh` | 停 overlay，不删共享卷 |
| `logs-v02.sh` | v0.2 日志 |

## 风险

- 并行期共用 Redis：验收少写；切流后再停现网 api。
- JWT 由脚本与现网对齐；不要手改成另一套。
- 任何时候不要对共享卷 `down -v` / `volume prune`。
