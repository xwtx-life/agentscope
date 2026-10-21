# -*- coding: utf-8 -*-
"""Authenticated request context for skill submission (v0.1-compatible)."""
from enum import StrEnum

from pydantic import BaseModel


class TenantRole(StrEnum):
    """Tenant-level roles ordered from least to most privileged."""

    GUEST = "guest"
    MEMBER = "member"
    ADMIN = "admin"


class AuthContext(BaseModel):
    """Trusted identity and tenant claims for one request."""

    user_id: str
    tenant_id: str
    role: TenantRole
    session_id: str | None = None
