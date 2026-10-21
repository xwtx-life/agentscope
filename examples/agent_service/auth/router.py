# -*- coding: utf-8 -*-
"""HTTP routes for v0.1-compatible email / tenant auth."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from .deps import (
    account_to_public,
    get_auth_store,
    get_current_account,
    require_admin,
)
from .jwt_utils import create_access_token
from .models import (
    CreateUserRequest,
    Department,
    DepartmentCreate,
    DepartmentUpdate,
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserAccount,
    UserPublic,
    UserUpdate,
)
from .store import AuthStore

auth_router = APIRouter(prefix="/auth", tags=["auth"])
department_router = APIRouter(
    prefix="/departments",
    tags=["departments"],
)


async def _token_for(account: UserAccount, store: AuthStore) -> TokenResponse:
    user = await account_to_public(account, store)
    token = create_access_token(
        user_id=account.id,
        username=account.email,
        role=account.role,
        department_id=account.tenant_id,
    )
    return TokenResponse(access_token=token, user=user)


@auth_router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register email + organization",
)
async def register(
    body: RegisterRequest,
    store: AuthStore = Depends(get_auth_store),
) -> TokenResponse:
    """Create user, tenant, and admin membership (no invitation)."""
    try:
        account = await store.register(
            email=str(body.email),
            password=body.password,
            display_name=body.display_name,
            tenant_name=body.tenant_name.strip(),
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    return await _token_for(account, store)


@auth_router.post(
    "/login",
    response_model=TokenResponse,
    summary="Log in with email and password",
)
async def login(
    body: LoginRequest,
    store: AuthStore = Depends(get_auth_store),
) -> TokenResponse:
    """Validate against v0.1 Redis email index + Argon2 hashes."""
    account = await store.authenticate(str(body.email), body.password)
    if account is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )
    return await _token_for(account, store)


@auth_router.get(
    "/me",
    response_model=UserPublic,
    summary="Current authenticated user",
)
async def me(
    account: UserAccount = Depends(get_current_account),
    store: AuthStore = Depends(get_auth_store),
) -> UserPublic:
    """Return the caller’s profile."""
    return await account_to_public(account, store)


@auth_router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Logout (client discards the JWT)",
)
async def logout(
    _: UserAccount = Depends(get_current_account),
) -> None:
    """Stateless JWT — the client simply drops the token."""
    return None


@auth_router.get(
    "/users",
    response_model=list[UserPublic],
    summary="List all users (admin)",
)
async def list_users(
    _: UserAccount = Depends(require_admin),
    store: AuthStore = Depends(get_auth_store),
) -> list[UserPublic]:
    """Return every account for the admin console."""
    users = await store.list_users()
    return [await account_to_public(u, store) for u in users]


@auth_router.post(
    "/users",
    response_model=UserPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Create a user (admin, no invitation)",
)
async def create_user(
    body: CreateUserRequest,
    _: UserAccount = Depends(require_admin),
    store: AuthStore = Depends(get_auth_store),
) -> UserPublic:
    """Admin direct-create: email, password, organization, role."""
    try:
        account = await store.create_user(
            email=str(body.email),
            password=body.password,
            display_name=body.display_name,
            role=body.role,
            tenant_id=body.org_id(),
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    return await account_to_public(account, store)


@auth_router.patch(
    "/users/{user_id}",
    response_model=UserPublic,
    summary="Update a user's role, organization, or password (admin)",
)
async def patch_user(
    user_id: str,
    body: UserUpdate,
    _: UserAccount = Depends(require_admin),
    store: AuthStore = Depends(get_auth_store),
) -> UserPublic:
    """Assign role / organization, or reset password."""
    try:
        account = await store.update_user(
            user_id,
            role=body.role,
            department_id=body.department_id,
            tenant_id=body.tenant_id,
            clear_department=body.clear_department,
            password=body.password,
            display_name=body.display_name,
        )
    except KeyError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    return await account_to_public(account, store)


@auth_router.delete(
    "/users/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a user (admin)",
)
async def delete_user(
    user_id: str,
    admin: UserAccount = Depends(require_admin),
    store: AuthStore = Depends(get_auth_store),
) -> None:
    """Permanently remove an account. Admins cannot delete themselves."""
    if user_id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="cannot delete your own account",
        )
    deleted = await store.delete_user(user_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )


# ---- organizations (still exposed as /departments for UI compatibility) ----


@department_router.get(
    "",
    response_model=list[Department],
    summary="List organizations",
)
async def list_departments(
    store: AuthStore = Depends(get_auth_store),
) -> list[Department]:
    """List tenants as departments for existing admin UI."""
    return await store.list_departments()


@department_router.post(
    "",
    response_model=Department,
    status_code=status.HTTP_201_CREATED,
    summary="Create an organization (admin)",
)
async def create_department(
    body: DepartmentCreate,
    _: UserAccount = Depends(require_admin),
    store: AuthStore = Depends(get_auth_store),
) -> Department:
    """Create a tenant."""
    try:
        return await store.create_department(
            name=body.name,
            description=body.description,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@department_router.patch(
    "/{department_id}",
    response_model=Department,
    summary="Update an organization (admin)",
)
async def update_department(
    department_id: str,
    body: DepartmentUpdate,
    _: UserAccount = Depends(require_admin),
    store: AuthStore = Depends(get_auth_store),
) -> Department:
    """Rename an organization."""
    try:
        return await store.update_department(
            department_id,
            name=body.name,
            description=body.description,
        )
    except KeyError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found.",
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@department_router.delete(
    "/{department_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an organization (admin)",
)
async def delete_department(
    department_id: str,
    _: UserAccount = Depends(require_admin),
    store: AuthStore = Depends(get_auth_store),
) -> None:
    """Remove an organization; remaining members are detached."""
    try:
        deleted = await store.delete_department(department_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found.",
        )
