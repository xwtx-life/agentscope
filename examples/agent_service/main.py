# -*- coding: utf-8 -*-
"""The example script to start the agent service."""
import os
import sys

import uvicorn
from fastapi.middleware import Middleware
from fastapi.middleware.cors import CORSMiddleware

from agentscope.app import create_app, SubAgentTemplate
from agentscope.app.channel import (
    DingTalkChannel,
    DiscordChannel,
    FeishuChannel,
)
from agentscope.app._service._skill_submission import SkillSubmissionService
from agentscope.app.hub import GitHubMCPHub, IFlytekSkillHub
from agentscope.app.message_bus import InMemoryMessageBus, RedisMessageBus
from agentscope.app.rag.blob_store import LocalBlobStore
from agentscope.app.rag.knowledge_base_manager import CollectionPerKbManager
from agentscope.app.storage import RedisStorage
from agentscope.app.workspace_manager import LocalWorkspaceManager
from agentscope.mcp import MCPClient, StdioMCPConfig, HttpMCPConfig
from agentscope.middleware import AgenticMemoryMiddleware, MiddlewareBase
from agentscope.permission import PermissionContext, PermissionMode
from agentscope.rag import ApproxTokenChunker, QdrantStore
from agentscope.workspace import WorkspaceBase

from auth import (
    AuthStore,
    ShareAllAgentsPolicy,
    auth_router,
    create_jwt_user_dependency,
    custom_models_router,
    department_router,
    load_skillhub_settings_into_hub,
    skillhub_settings_router,
)
from auth.skill_submission_router import submission_router


def _env(*names: str, default: str | None = None) -> str | None:
    """Return the first non-empty env value among *names*."""
    for name in names:
        value = os.getenv(name)
        if value is not None and value.strip() != "":
            return value.strip()
    return default


def _env_int(*names: str, default: int) -> int:
    raw = _env(*names)
    if raw is None:
        return default
    return int(raw)


_HERE = os.path.dirname(os.path.abspath(__file__))

_REDIS_HOST = _env("REDIS_HOST", "AGENTSCOPE_REDIS_HOST", default="localhost")
_REDIS_PORT = _env_int("REDIS_PORT", "AGENTSCOPE_REDIS_PORT", default=6379)
_REDIS_DB = _env_int("REDIS_DB", "AGENTSCOPE_REDIS_DB", default=0)
_REDIS_PASSWORD = _env("REDIS_PASSWORD", "AGENTSCOPE_REDIS_PASSWORD")

_WORKSPACE_ROOT = _env(
    "AGENTSCOPE_WORKSPACE_ROOT",
    default=os.path.join(_HERE, "workspaces"),
)
_BLOB_ROOT = _env(
    "AGENTSCOPE_BLOB_ROOT",
    default=os.path.join(_HERE, "blobs"),
)
_SKILL_SUBMISSION_ROOT = _env(
    "AGENTSCOPE_SKILL_SUBMISSION_ROOT",
    default=os.path.join(_HERE, "skill_submissions"),
)
_QDRANT_URL = _env("AGENTSCOPE_QDRANT_URL")
_MESSAGE_BUS = (
    _env("AGENTSCOPE_MESSAGE_BUS", default="memory") or "memory"
).lower()
_CORS_ORIGINS = [
    origin.strip()
    for origin in (
        _env("AGENTSCOPE_CORS_ORIGINS", default="*") or "*"
    ).split(",")
    if origin.strip()
]

# MCP is off by default (Docker often lacks npx/network for Playwright).
# Set AGENTSCOPE_ENABLE_MCP=1 to restore default Playwright (+ Amap if keyed).
_ENABLE_MCP = (_env("AGENTSCOPE_ENABLE_MCP", default="0") or "0").lower() in (
    "1",
    "true",
    "yes",
    "on",
)

default_mcps: list[MCPClient] = []
if _ENABLE_MCP:
    default_mcps = [
        MCPClient(
            name="playwright",
            mcp_config=StdioMCPConfig(
                command="npx",
                args=["@playwright/mcp@latest"],
            ),
            is_stateful=True,
        ),
    ]
    if os.getenv("AMAP_API_KEY"):
        default_mcps.append(
            MCPClient(
                name="amap",
                mcp_config=HttpMCPConfig(
                    url=f"https://mcp.amap.com/mcp?key="
                    f"{os.environ['AMAP_API_KEY']}",
                ),
                is_stateful=False,
            ),
        )

storage = RedisStorage(
    host=_REDIS_HOST,
    port=_REDIS_PORT,
    db=_REDIS_DB,
    password=_REDIS_PASSWORD or None,
)

# Account / department store (JWT auth). Shares Redis with agent storage.
auth_store = AuthStore(
    host=_REDIS_HOST,
    port=_REDIS_PORT,
    db=_REDIS_DB,
    password=_REDIS_PASSWORD or None,
)

if _QDRANT_URL:
    vector_store = QdrantStore(url=_QDRANT_URL)
else:
    vector_store = QdrantStore(location=":memory:")

if _MESSAGE_BUS == "redis":
    message_bus = RedisMessageBus(
        host=_REDIS_HOST,
        port=_REDIS_PORT,
        db=_REDIS_DB,
        password=_REDIS_PASSWORD or None,
    )
else:
    message_bus = InMemoryMessageBus()


async def longterm_memory_factory(
    user_id: str,
    agent_id: str,
    session_id: str,
    workspace: WorkspaceBase,
) -> list[MiddlewareBase]:
    """Attach Markdown-file long-term memory, stored under the session's
    workspace so it is reachable through whichever backend is bound."""
    del user_id, agent_id, session_id
    return [
        AgenticMemoryMiddleware(
            workdir=workspace.workdir,
            backend=workspace.get_backend(),
        ),
    ]


app = create_app(
    storage=storage,
    message_bus=message_bus,
    workspace_manager=LocalWorkspaceManager(
        basedir=_WORKSPACE_ROOT,
        # The default MCP servers that will be added into the workspace
        default_mcps=default_mcps,
    ),
    # Knowledge base feature — Qdrant URL when set (Docker), else in-memory.
    # The CollectionPerKbManager allocates one collection per knowledge base,
    # so any embedding dimension is allowed.
    knowledge_base_manager=CollectionPerKbManager(
        storage=storage,
        vector_store=vector_store,
    ),
    blob_store=LocalBlobStore(root_dir=_BLOB_ROOT),
    # Chunker classes users can pick from when creating a knowledge base;
    # the chosen type and parameters are pinned on the knowledge base.
    knowledge_chunkers=[ApproxTokenChunker],
    # Resource hubs the UI browses under /hub. MCP hubs off unless
    # AGENTSCOPE_ENABLE_MCP=1. SkillHub is the sole skill source —
    # URL/token come from env defaults, then Redis settings (admin UI).
    mcp_hubs=[GitHubMCPHub()] if _ENABLE_MCP else [],
    skill_hubs=[
        IFlytekSkillHub(
            base_url=os.getenv(
                "AGENTSCOPE_SKILLHUB_URL",
                "http://127.0.0.1:8080",
            ),
            api_token=os.getenv("AGENTSCOPE_SKILLHUB_TOKEN") or None,
        ),
    ],
    # Customize your own subagent templates
    custom_subagent_templates=[
        SubAgentTemplate(
            type="explorer",
            description=(
                "Read-only agents specialized in exploration tasks. It can "
                "read files but cannot modify, create, or delete them. Use "
                "this agent type when you need to investigate the codebase, "
                "understand its structure, or gather information from files "
                "to support planning—without making any changes."
            ),
            system_prompt_template="""You are {member_name}, an explorer \
agent in team '{team_name}' led by {leader_name}.

Team purpose: {team_description}

Your role: {member_description}

## Responsibilities
- Complete the exploration tasks assigned by the team leader.
- You are read-only: you may inspect files and the codebase, but you must \
never modify, create, or delete anything.

## Reporting
- Always report the task result back to {leader_name} using the TeamSay \
tool, whether the task succeeds or fails.
- Keep your private reasoning private; only share conclusions and findings \
that the leader needs.

Note: `TeamSay` is your ONLY channel to communicate with {leader_name} and \
the other team members. Any other output you produce is invisible to them, \
so anything you want them to see MUST be sent through `TeamSay`.""",
            permission_context=PermissionContext(
                # Read-only
                mode=PermissionMode.EXPLORE,
            ),
        ),
    ],
    # Long-term memory. The default PER_AGENT workspace isolation makes
    # the memory survive across sessions of the same agent.
    extra_agent_middlewares=longterm_memory_factory,
    extra_middlewares=[
        Middleware(
            CORSMiddleware,
            allow_origins=_CORS_ORIGINS,
            allow_methods=["*"],
            allow_headers=["*"],
        ),
    ],
    channels=[
        DingTalkChannel,
        DiscordChannel,
        FeishuChannel,
    ],
    # Real auth: every business route resolves identity from a JWT only.
    # Spoofable X-User-ID headers are ignored.
    user_id_dependency=create_jwt_user_dependency(),
    # Agents (and supporting credentials / KBs) are visible to everyone
    # as read/use; only the creator can PATCH/DELETE.
    resource_access_policy=ShareAllAgentsPolicy(auth_store),
)

app.state.auth_store = auth_store
# Skill upload → admin review → publish to the first registered SkillHub.
_skill_hub = next(iter(app.state.skill_hubs.values()), None)
app.state.skill_submission_service = SkillSubmissionService(
    storage=storage,
    root_dir=_SKILL_SUBMISSION_ROOT or os.path.join(_HERE, "skill_submissions"),
    publisher=_skill_hub,
)
app.include_router(auth_router)
app.include_router(department_router)
app.include_router(custom_models_router)
app.include_router(skillhub_settings_router)
app.include_router(submission_router)


@app.on_event("startup")
async def _load_skillhub_settings() -> None:
    """Apply Redis-persisted SkillHub URL/token over env defaults."""
    hub = app.state.skill_hubs.get("skillhub")
    if isinstance(hub, IFlytekSkillHub):
        await load_skillhub_settings_into_hub(auth_store, hub)
        # Keep the submission publisher pointed at the live hub settings.
        app.state.skill_submission_service.publisher = hub


if __name__ == "__main__":
    # Start the service
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        # Hot reload forces a SelectorEventLoop on Windows, which cannot
        # spawn the subprocesses that the builtin tools rely on
        reload=sys.platform != "win32",
    )
