# -*- coding: utf-8 -*-
"""JWT issue / verify helpers."""

from __future__ import annotations

import os
import warnings
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt

from .models import Role

_DEFAULT_SECRET = "agentscope-dev-jwt-secret-change-me"
_ALGORITHM = "HS256"
_DEFAULT_TTL_HOURS = 24 * 7


def get_jwt_secret() -> str:
    """Return the signing secret from env, with a loud default for local use."""
    secret = os.getenv("AGENTSCOPE_JWT_SECRET", "").strip()
    if secret:
        return secret
    warnings.warn(
        "AGENTSCOPE_JWT_SECRET is not set; using an insecure development "
        "default. Set it before any shared or production deployment.",
        UserWarning,
        stacklevel=2,
    )
    return _DEFAULT_SECRET


def create_access_token(
    *,
    user_id: str,
    username: str,
    role: Role,
    department_id: str | None,
    secret: str | None = None,
    ttl_hours: int = _DEFAULT_TTL_HOURS,
) -> str:
    """Mint a Bearer JWT for the given account.

    Args:
        user_id: Stable tenant key used by AgentScope storage.
        username: Display / login name.
        role: ``admin`` or ``user``.
        department_id: Optional flat department id.
        secret: Override signing secret (defaults to env).
        ttl_hours: Token lifetime.

    Returns:
        Encoded JWT string.
    """
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": user_id,
        "username": username,
        "email": username,
        "role": role,
        "department_id": department_id,
        "tenant_id": department_id,
        "iat": now,
        "exp": now + timedelta(hours=ttl_hours),
    }
    return jwt.encode(payload, secret or get_jwt_secret(), algorithm=_ALGORITHM)


def decode_access_token(
    token: str,
    secret: str | None = None,
) -> dict[str, Any]:
    """Decode and validate a Bearer JWT.

    Args:
        token: Raw JWT (without the ``Bearer `` prefix).
        secret: Override signing secret.

    Returns:
        Claim dictionary.

    Raises:
        jwt.PyJWTError: On invalid / expired tokens.
    """
    return jwt.decode(
        token,
        secret or get_jwt_secret(),
        algorithms=[_ALGORITHM],
    )
