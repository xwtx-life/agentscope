# Ubuntu 20.04 Docker 迁移包

这套部署会把 AgentScope、Web UI、Redis、Qdrant，以及官方 SkillHub
release 栈全部放进 Docker Compose。Ubuntu 20.04 只作为 Docker 宿主机，不需要
安装项目的 Python 或 Node 依赖。

> **现网已有 v0.1、本次只上线 v0.2：** 不要用本文件的 `compose.yml` / `./up.sh`
>（会和现网抢项目名与端口）。**不需要 v0.1 源码。**
> 请只看 [README-v02-parallel.md](./README-v02-parallel.md)，只用 `*-v02.sh`。

## 服务拓扑

- `gateway`：统一入口，使用两个局域网端口：
  - AgentScope：`18080`
  - SkillHub：`18081`
- `agentscope-api`、`agentscope-web`：AgentScope 后端和前端。
- `agentscope-redis`、`qdrant`：AgentScope 的数据服务。
- `skillhub-server`、`skillhub-web`、`skillhub-scanner`：SkillHub 官方服务。
- `skillhub-postgres`、`skillhub-redis`：SkillHub 自己的数据服务。

局域网访问不需要 DNS 或域名，直接使用 Ubuntu 主机 IP：

```text
http://<Ubuntu主机IP>:18080
http://<Ubuntu主机IP>:18081
```

将 `.env` 中的 `LAN_HOST`、`AGENTSCOPE_CORS_ORIGINS` 和
`SKILLHUB_PUBLIC_BASE_URL` 改为实际局域网 IP。

## 联网环境生成离线镜像包

在有网络的当前机器上执行：

```bash
cd deploy/docker
cp .env.example .env
```

编辑 `.env`，至少替换以下值：

- `AGENTSCOPE_JWT_SECRET`：至少 32 个字符的随机字符串。
- `AGENTSCOPE_SECRET_ENCRYPTION_KEY`：URL-safe Base64 编码的 32 字节随机值。
- `SKILLHUB_POSTGRES_PASSWORD`
- `SKILLHUB_DOWNLOAD_ANON_COOKIE_SECRET`
- `BOOTSTRAP_ADMIN_PASSWORD`

可用 Python 生成密钥：

```bash
python3 - <<'PY'
import base64
import secrets

print("AGENTSCOPE_JWT_SECRET=" + secrets.token_urlsafe(48))
print(
    "AGENTSCOPE_SECRET_ENCRYPTION_KEY="
    + base64.urlsafe_b64encode(secrets.token_bytes(32)).decode()
)
print("SKILLHUB_DOWNLOAD_ANON_COOKIE_SECRET=" + secrets.token_urlsafe(48))
PY
```

然后导出全部镜像：

```bash
./export-images.sh
```

该命令会：

1. 拉取锁定的 SkillHub `v0.2.14` server/web/scanner 镜像；
2. 构建当前源码的 AgentScope API 和前端镜像；
3. 导出 Compose 所需全部镜像到 `images/agentscope-stack-images.tar`；
4. 生成对应的 SHA-256 校验文件。

不要把 `.env` 放进交付压缩包。可以从项目根目录创建源码包：

```bash
tar \
  --exclude='.git' \
  --exclude='deploy/docker/.env' \
  --exclude='examples/agent_service/workspaces' \
  --exclude='examples/agent_service/blobs' \
  --exclude='examples/agent_service/skill_submissions' \
  -czf agentscope-docker-bundle.tar.gz .
```

将源码包和 `deploy/docker/images/` 一起复制到目标机。

## Ubuntu 20.04 目标机安装

目标机需要 Docker Engine 和 Docker Compose 插件。安装 Docker 时请使用 Docker
官方仓库提供的版本，不要依赖 Ubuntu 20.04 自带的旧 Docker 包。

解压项目后：

```bash
cd agentscope-src/deploy/docker
cp .env.example .env
```

把联网环境中填写好的 `.env` 通过安全方式复制到这里，或重新填写同样的配置。
然后导入镜像并启动：

```bash
./import-images.sh
./up.sh
```

验证离线包完整性：

```bash
sha256sum --check images/agentscope-stack-images.tar.sha256
```

目标机不需要访问 GHCR、npm 或 PyPI。检查状态：

```bash
docker compose --env-file .env -f compose.yml ps
./logs.sh
```

首次启动是全新数据，SkillHub 管理员使用 `.env` 中的
`BOOTSTRAP_ADMIN_USERNAME` 和 `BOOTSTRAP_ADMIN_PASSWORD` 登录
`http://<Ubuntu主机IP>:18081`。首次登录后应立即修改密码，并可在确认管理员账号可用后关闭
`BOOTSTRAP_ADMIN_ENABLED`。

如果 Ubuntu 启用了 UFW，请放行局域网访问端口：

```bash
sudo ufw allow from 192.168.0.0/16 to any port 18080 proto tcp
sudo ufw allow from 192.168.0.0/16 to any port 18081 proto tcp
```

## 交付文件

- `images/agentscope-stack-images.tar`：全部 Docker 镜像未压缩离线归档。
- `images/agentscope-stack-images.tar.sha256`：归档校验文件。
- `compose.yml`、`.env.example`：服务编排和配置模板。
- `import-images.sh`、`up.sh`、`down.sh`、`logs.sh`：目标机操作脚本。
- 本文件：Ubuntu 20.04 离线部署说明。

## 数据卷

当前部署不迁移原环境数据，但新部署会将数据写入 Docker named volumes：

- AgentScope：`agentscope_workspaces`、`agentscope_blobs`、
  `agentscope_skill_submissions`、`agentscope_redis`、`agentscope_qdrant`
- SkillHub：`skillhub_postgres`、`skillhub_redis`、`skillhub_storage`

停止服务时不要使用 `docker compose down -v`，否则会删除数据。普通停止和重启：

```bash
./down.sh
./up.sh
```

升级镜像前，先备份卷，再导入新镜像并执行 `./up.sh`。卷备份示例：

```bash
docker run --rm \
  -v agentscope-stack_skillhub_postgres:/source:ro \
  -v "$PWD":/backup \
  alpine:3.20 \
  tar czf /backup/skillhub-postgres.tgz -C /source .
```

实际卷名可通过 `docker volume ls | grep agentscope-stack` 确认。

## HTTPS

当前交付包默认适用于局域网 HTTP 验收。公网或生产使用时，应在 `gateway` 前增加
TLS 证书配置，设置最终的 HTTPS 地址，并将：

```text
AGENTSCOPE_ENV=production
AGENTSCOPE_SECURE_COOKIES=true
SKILLHUB_SESSION_COOKIE_SECURE=true
```

同时把 `AGENTSCOPE_CORS_ORIGINS` 和 `SKILLHUB_PUBLIC_BASE_URL` 改成 HTTPS 地址。
在没有 HTTPS 的情况下不要把 secure cookie 配置打开，否则浏览器不会发送登录 Cookie。

## 常见问题

- AgentScope 使用 `http://<Ubuntu主机IP>:18080`，SkillHub 使用
  `http://<Ubuntu主机IP>:18081`；不要填写容器内部地址。
- AgentScope 使用内部地址 `http://skillhub-server:8080` 访问 SkillHub，不要把这个
  Docker 服务名填写到浏览器。
- 当前是全新安装，不包含原 Redis 用户、模型配置、workspace 或知识库向量。
- `./export-images.sh` 需要联网环境预先拉取镜像；目标机只执行
  `./import-images.sh`，不要执行 `docker compose pull`。
