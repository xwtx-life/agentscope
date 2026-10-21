# -*- coding: utf-8 -*-
"""FastAPI dependencies for JWT identity and admin checks."""

from __future__ import annotations

from collections.abc import Callable, Coroutine
from typing import Any

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .jwt_utils import decode_access_token
from .models import UserAccount, UserPublic
from .store import AuthStore

_bearer = HTTPBearer(auto_error=False)


def get_auth_store(request: Request) -> AuthStore:
    """Return the AuthStore attached in ``main.py``."""
    store = getattr(request.app.state, "auth_store", None)
    if store is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Auth store is not configured.",
        )
    return store


def create_jwt_user_dependency() -> Callable[..., Coroutine[Any, Any, str]]:
    """Build a ``user_id_dependency`` that only accepts Bearer JWTs.

    Spoofable ``X-User-ID`` headers are ignored on purpose — when this
    dependency is installed via ``create_app(user_id_dependency=...)``,
    every business route resolves identity from a signed token only.
    """

    async def jwt_user_id(
        credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    ) -> str:
        if credentials is None or credentials.scheme.lower() != "bearer":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Bearer token required.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        try:
            payload = decode_access_token(credentials.credentials)
        except Exception as exc:  # noqa: BLE001 — map all JWT failures to 401
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token.",
                headers={"WWW-Authenticate": "Bearer"},
            ) from exc

        user_id = payload.get("sub")
        if not user_id or not isinstance(user_id, str):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return user_id

    return jwt_user_id


async def get_current_account(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    store: AuthStore = Depends(get_auth_store),
) -> UserAccount:
    """Load the full account for the Bearer token subject."""
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Bearer token required.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = decode_access_token(credentials.credentials)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    user_id = payload.get("sub")
    if not user_id or not isinstance(user_id, str):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    account = await store.get_user(user_id)
    if account is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account no longer exists.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return account


async def require_admin(
    account: UserAccount = Depends(get_current_account),
) -> UserAccount:
    """Reject non-admin callers."""
    if account.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required.",
        )
    return account


async def account_to_public(
    account: UserAccount,
    store: AuthStore,
) -> UserPublic:
    """Convert a store account into the API-facing shape."""
    data = await store.to_public(account)
    return UserPublic.model_validate(data)
