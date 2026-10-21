# -*- coding: utf-8 -*-
"""Runtime SkillHub URL / token settings for the agent_service example."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from agentscope.app.hub import IFlytekSkillHub

from .deps import get_auth_store, get_current_account, require_admin
from .models import UserAccount
from .store import AuthStore

skillhub_settings_router = APIRouter(
    prefix="/skillhub",
    tags=["skillhub-settings"],
)


class SkillHubSettingsView(BaseModel):
    """Secret-free SkillHub connection settings."""

    base_url: str
    token_configured: bool


class UpdateSkillHubSettingsRequest(BaseModel):
    """Write SkillHub connection settings.

    Omit ``token`` (or send ``null``) to keep the existing token. Send an
    empty string to clear it.
    """

    base_url: str = Field(min_length=1)
    token: str | None = None


def _skillhub(request: Request) -> IFlytekSkillHub:
    hubs = getattr(request.app.state, "skill_hubs", {}) or {}
    hub = hubs.get("skillhub")
    if not isinstance(hub, IFlytekSkillHub):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="SkillHub is not registered on this service.",
        )
    return hub


def apply_skillhub_settings(
    hub: IFlytekSkillHub,
    *,
    base_url: str,
    token: str | None,
    update_token: bool,
) -> None:
    """Mutate the live hub so subsequent /hub/skill calls use new credentials."""
    hub.base_url = base_url.rstrip("/")
    if update_token:
        hub.api_token = token or None


async def load_skillhub_settings_into_hub(
    store: AuthStore,
    hub: IFlytekSkillHub,
) -> None:
    """Overlay Redis-persisted settings onto the hub (env remains the default)."""
    saved = await store.get_skillhub_settings()
    if saved is None:
        return
    apply_skillhub_settings(
        hub,
        base_url=saved["base_url"],
        token=saved.get("token"),
        update_token=True,
    )


@skillhub_settings_router.get(
    "/settings",
    response_model=SkillHubSettingsView,
    summary="Get SkillHub connection settings",
)
async def get_skillhub_settings(
    request: Request,
    _: UserAccount = Depends(get_current_account),
) -> SkillHubSettingsView:
    """Return the active SkillHub URL without exposing the token."""
    hub = _skillhub(request)
    return SkillHubSettingsView(
        base_url=hub.base_url,
        token_configured=bool(hub.api_token),
    )


@skillhub_settings_router.put(
    "/settings",
    response_model=SkillHubSettingsView,
    summary="Update SkillHub connection settings (admin)",
)
async def update_skillhub_settings(
    body: UpdateSkillHubSettingsRequest,
    request: Request,
    _: UserAccount = Depends(require_admin),
    store: AuthStore = Depends(get_auth_store),
) -> SkillHubSettingsView:
    """Persist and apply SkillHub URL / token for this deployment."""
    hub = _skillhub(request)
    update_token = "token" in body.model_fields_set
    new_token = body.token if update_token else hub.api_token
    apply_skillhub_settings(
        hub,
        base_url=body.base_url.strip(),
        token=new_token,
        update_token=True,
    )
    await store.set_skillhub_settings(
        base_url=hub.base_url,
        token=hub.api_token,
    )
    return SkillHubSettingsView(
        base_url=hub.base_url,
        token_configured=bool(hub.api_token),
    )
