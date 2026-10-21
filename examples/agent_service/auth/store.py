# -*- coding: utf-8 -*-
"""v0.1-compatible Redis auth store (email index + tenants + Argon2)."""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from email_validator import EmailNotValidError, validate_email
from pwdlib import PasswordHash

from .models import (
    CustomModelCard,
    Department,
    Role,
    Tenant,
    TenantRole,
    UserAccount,
)

_PASSWORD_HASH = PasswordHash.recommended()


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def normalize_email(email: str) -> tuple[str, str]:
    """Return (display_email, normalized_email_lower)."""
    try:
        result = validate_email(email, check_deliverability=False)
    except EmailNotValidError as exc:
        raise ValueError(str(exc)) from exc
    return result.normalized, result.normalized.lower()


def tenant_slug(name: str, suffix: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")
    return f"{base or 'tenant'}-{suffix[:8].lower()}"


def hash_password(password: str) -> str:
    return _PASSWORD_HASH.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _PASSWORD_HASH.verify(password, password_hash)
    except Exception:
        return False


def _api_role(tenant_role: str) -> Role:
    return "admin" if tenant_role == "admin" else "user"


def _tenant_role(api_role: Role) -> TenantRole:
    return "admin" if api_role == "admin" else "member"


class AuthStore:
    """Read/write the same Redis keys as AgentScope v0.1 AuthConfig."""

    EMAIL_INDEX = "agentscope:auth:users:by_email"
    USER_KEY = "agentscope:auth:user:{user_id}"
    TENANT_KEY = "agentscope:auth:tenant:{tenant_id}"
    TENANT_SLUG_INDEX = "agentscope:auth:tenants:by_slug"
    MEMBERSHIP_KEY = "agentscope:auth:membership:{user_id}"
    TENANT_MEMBERS = "agentscope:auth:tenant:{tenant_id}:memberships"
    CUSTOM_MODELS_KEY = "agentscope:auth:custom_models:{credential_id}"
    SKILLHUB_SETTINGS_KEY = "agentscope:skillhub:settings"

    def __init__(
        self,
        host: str = "localhost",
        port: int = 6379,
        db: int = 0,
        password: str | None = None,
    ) -> None:
        self._host = host
        self._port = port
        self._db = db
        self._password = password
        self._client: Any = None

    @property
    def client(self) -> Any:
        if self._client is None:
            raise RuntimeError("Redis client not ready; call _ensure_client first")
        return self._client

    async def _ensure_client(self) -> Any:
        if self._client is None:
            import redis.asyncio as aioredis

            self._client = aioredis.Redis(
                host=self._host,
                port=self._port,
                db=self._db,
                password=self._password,
                decode_responses=True,
            )
        return self._client

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    # ---- low-level records ----

    async def _get_user_raw(self, user_id: str) -> dict[str, Any] | None:
        await self._ensure_client()
        raw = await self.client.get(self.USER_KEY.format(user_id=user_id))
        if not raw:
            return None
        return json.loads(raw)

    async def _get_membership_raw(self, user_id: str) -> dict[str, Any] | None:
        await self._ensure_client()
        raw = await self.client.get(self.MEMBERSHIP_KEY.format(user_id=user_id))
        if not raw:
            return None
        return json.loads(raw)

    async def _get_tenant_raw(self, tenant_id: str) -> dict[str, Any] | None:
        await self._ensure_client()
        raw = await self.client.get(self.TENANT_KEY.format(tenant_id=tenant_id))
        if not raw:
            return None
        return json.loads(raw)

    def _to_account(
        self,
        user: dict[str, Any],
        membership: dict[str, Any] | None,
    ) -> UserAccount:
        tenant_role = "member"
        tenant_id = None
        if membership:
            tenant_role = str(membership.get("role") or "member")
            tenant_id = membership.get("tenant_id")
        email = str(user.get("email") or "")
        display = str(user.get("display_name") or "")
        api_role = _api_role(tenant_role)
        return UserAccount(
            id=str(user["id"]),
            email=email,
            display_name=display,
            role=api_role,
            tenant_role=tenant_role if tenant_role in ("admin", "member", "guest") else "member",
            tenant_id=tenant_id,
            username=email,
            department_id=tenant_id,
            status=str(user.get("status") or "active"),
            email_verified=bool(user.get("email_verified", False)),
        )

    async def get_user(self, user_id: str) -> UserAccount | None:
        user = await self._get_user_raw(user_id)
        if user is None:
            return None
        membership = await self._get_membership_raw(user_id)
        return self._to_account(user, membership)

    async def get_user_by_email(self, email: str) -> UserAccount | None:
        await self._ensure_client()
        _, normalized = normalize_email(email)
        user_id = await self.client.hget(self.EMAIL_INDEX, normalized)
        if not user_id:
            return None
        return await self.get_user(user_id)

    async def list_users(self) -> list[UserAccount]:
        await self._ensure_client()
        mapping = await self.client.hgetall(self.EMAIL_INDEX)
        users: list[UserAccount] = []
        for user_id in sorted(set(mapping.values())):
            account = await self.get_user(user_id)
            if account is not None:
                users.append(account)
        return users

    async def count_users(self) -> int:
        await self._ensure_client()
        return int(await self.client.hlen(self.EMAIL_INDEX))

    async def get_tenant(self, tenant_id: str) -> Tenant | None:
        raw = await self._get_tenant_raw(tenant_id)
        if raw is None:
            return None
        return Tenant(
            id=str(raw["id"]),
            name=str(raw.get("name") or ""),
            slug=str(raw.get("slug") or ""),
            owner_user_id=str(raw.get("owner_user_id") or ""),
            created_at=raw.get("created_at"),
            updated_at=raw.get("updated_at"),
        )

    async def list_tenants(self) -> list[Tenant]:
        await self._ensure_client()
        mapping = await self.client.hgetall(self.TENANT_SLUG_INDEX)
        tenants: list[Tenant] = []
        for tenant_id in sorted(set(mapping.values())):
            tenant = await self.get_tenant(tenant_id)
            if tenant is not None:
                tenants.append(tenant)
        return sorted(tenants, key=lambda t: t.name.lower())

    # Department aliases for existing routers / UI
    async def list_departments(self) -> list[Department]:
        out: list[Department] = []
        for t in await self.list_tenants():
            created = t.created_at.isoformat() if isinstance(t.created_at, datetime) else str(t.created_at or "")
            updated = t.updated_at.isoformat() if isinstance(t.updated_at, datetime) else str(t.updated_at or "")
            out.append(
                Department(
                    id=t.id,
                    name=t.name,
                    description=None,
                    created_at=created,
                    updated_at=updated,
                ),
            )
        return out

    async def get_department(self, department_id: str) -> Department | None:
        t = await self.get_tenant(department_id)
        if t is None:
            return None
        created = t.created_at.isoformat() if isinstance(t.created_at, datetime) else str(t.created_at or "")
        updated = t.updated_at.isoformat() if isinstance(t.updated_at, datetime) else str(t.updated_at or "")
        return Department(
            id=t.id,
            name=t.name,
            description=None,
            created_at=created,
            updated_at=updated,
        )

    async def find_department_by_name(self, name: str) -> Department | None:
        needle = name.strip().lower()
        for d in await self.list_departments():
            if d.name.lower() == needle:
                return d
        return None

    async def create_tenant(self, *, name: str, owner_user_id: str) -> Tenant:
        await self._ensure_client()
        name = name.strip()
        if not name:
            raise ValueError("organization name is required")
        tenant_id = str(uuid4())
        slug = tenant_slug(name, tenant_id)
        if await self.client.hget(self.TENANT_SLUG_INDEX, slug):
            slug = tenant_slug(name, str(uuid4()))
        now = _now()
        record = {
            "id": tenant_id,
            "name": name,
            "slug": slug,
            "owner_user_id": owner_user_id,
            "status": "active",
            "quota": {},
            "usage": {},
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
        }
        pipe = self.client.pipeline()
        pipe.hset(self.TENANT_SLUG_INDEX, slug, tenant_id)
        pipe.set(self.TENANT_KEY.format(tenant_id=tenant_id), json.dumps(record))
        await pipe.execute()
        return Tenant(
            id=tenant_id,
            name=name,
            slug=slug,
            owner_user_id=owner_user_id,
            created_at=now,
            updated_at=now,
        )

    async def get_or_create_department(
        self,
        *,
        name: str,
        description: str | None = None,
    ) -> Department:
        del description
        existing = await self.find_department_by_name(name)
        if existing is not None:
            return existing
        # Owner filled in after first user exists; use placeholder then patch.
        tenant = await self.create_tenant(name=name, owner_user_id="pending")
        return Department(
            id=tenant.id,
            name=tenant.name,
            description=None,
            created_at=tenant.created_at.isoformat() if isinstance(tenant.created_at, datetime) else "",
            updated_at=tenant.updated_at.isoformat() if isinstance(tenant.updated_at, datetime) else "",
        )

    async def create_department(
        self,
        *,
        name: str,
        description: str | None = None,
    ) -> Department:
        return await self.get_or_create_department(name=name, description=description)

    async def update_department(
        self,
        department_id: str,
        *,
        name: str | None = None,
        description: str | None = None,
    ) -> Department:
        del description
        raw = await self._get_tenant_raw(department_id)
        if raw is None:
            raise KeyError(department_id)
        if name is not None:
            name = name.strip()
            if not name:
                raise ValueError("name is required")
            raw["name"] = name
        raw["updated_at"] = _now().isoformat()
        await self.client.set(
            self.TENANT_KEY.format(tenant_id=department_id),
            json.dumps(raw),
        )
        dept = await self.get_department(department_id)
        assert dept is not None
        return dept

    async def delete_department(self, department_id: str) -> bool:
        """Delete an organization and detach any remaining memberships."""
        await self._ensure_client()
        raw = await self._get_tenant_raw(department_id)
        if raw is None:
            return False
        members = await self.client.smembers(
            self.TENANT_MEMBERS.format(tenant_id=department_id),
        )
        pipe = self.client.pipeline()
        for user_id in members:
            pipe.delete(self.MEMBERSHIP_KEY.format(user_id=user_id))
        pipe.delete(self.TENANT_MEMBERS.format(tenant_id=department_id))
        pipe.delete(self.TENANT_KEY.format(tenant_id=department_id))
        slug = raw.get("slug")
        if slug:
            pipe.hdel(self.TENANT_SLUG_INDEX, slug)
        await pipe.execute()
        return True

    async def delete_user(self, user_id: str) -> bool:
        """Remove an account, email index entry, and organization membership."""
        await self._ensure_client()
        raw = await self._get_user_raw(user_id)
        if raw is None:
            return False
        membership = await self._get_membership_raw(user_id)
        normalized = str(raw.get("normalized_email") or "").strip().lower()
        if not normalized:
            email = str(raw.get("email") or "")
            try:
                _, normalized = normalize_email(email)
            except ValueError:
                normalized = email.lower()

        pipe = self.client.pipeline()
        pipe.delete(self.USER_KEY.format(user_id=user_id))
        if normalized:
            pipe.hdel(self.EMAIL_INDEX, normalized)
        pipe.delete(self.MEMBERSHIP_KEY.format(user_id=user_id))
        if membership and membership.get("tenant_id"):
            pipe.srem(
                self.TENANT_MEMBERS.format(tenant_id=membership["tenant_id"]),
                user_id,
            )
        await pipe.execute()
        return True

    async def _set_membership(
        self,
        *,
        user_id: str,
        tenant_id: str,
        role: TenantRole,
    ) -> None:
        await self._ensure_client()
        now = _now()
        record = {
            "id": str(uuid4()),
            "tenant_id": tenant_id,
            "user_id": user_id,
            "role": role,
            "status": "active",
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
        }
        pipe = self.client.pipeline()
        pipe.set(self.MEMBERSHIP_KEY.format(user_id=user_id), json.dumps(record))
        pipe.sadd(self.TENANT_MEMBERS.format(tenant_id=tenant_id), user_id)
        await pipe.execute()

    async def register(
        self,
        *,
        email: str,
        password: str,
        display_name: str,
        tenant_name: str,
    ) -> UserAccount:
        """Create user + tenant + admin membership (v0.1 first registration)."""
        await self._ensure_client()
        display_email, normalized = normalize_email(email)
        if await self.client.hget(self.EMAIL_INDEX, normalized):
            raise ValueError("email already registered")

        user_id = str(uuid4())
        tenant = await self.create_tenant(name=tenant_name, owner_user_id=user_id)
        # Fix owner if create_tenant used pending elsewhere — already set.
        now = _now()
        user_record = {
            "id": user_id,
            "email": display_email,
            "normalized_email": normalized,
            "password_hash": hash_password(password),
            "display_name": (display_name or "").strip(),
            "status": "active",
            "email_verified": False,
            "last_login_at": None,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
        }
        # Update tenant owner
        tenant_raw = await self._get_tenant_raw(tenant.id)
        if tenant_raw:
            tenant_raw["owner_user_id"] = user_id
            tenant_raw["updated_at"] = now.isoformat()
            await self.client.set(
                self.TENANT_KEY.format(tenant_id=tenant.id),
                json.dumps(tenant_raw),
            )

        pipe = self.client.pipeline()
        pipe.hset(self.EMAIL_INDEX, normalized, user_id)
        pipe.set(self.USER_KEY.format(user_id=user_id), json.dumps(user_record))
        await pipe.execute()
        await self._set_membership(
            user_id=user_id,
            tenant_id=tenant.id,
            role="admin",
        )
        account = await self.get_user(user_id)
        assert account is not None
        return account

    async def create_user(
        self,
        *,
        email: str,
        password: str,
        display_name: str = "",
        role: Role = "user",
        tenant_id: str,
    ) -> UserAccount:
        """Admin direct-create into an existing organization (no invitation)."""
        await self._ensure_client()
        display_email, normalized = normalize_email(email)
        if await self.client.hget(self.EMAIL_INDEX, normalized):
            raise ValueError("email already registered")
        tenant = await self.get_tenant(tenant_id)
        if tenant is None:
            raise ValueError("organization not found")

        user_id = str(uuid4())
        now = _now()
        user_record = {
            "id": user_id,
            "email": display_email,
            "normalized_email": normalized,
            "password_hash": hash_password(password),
            "display_name": (display_name or "").strip(),
            "status": "active",
            "email_verified": False,
            "last_login_at": None,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
        }
        pipe = self.client.pipeline()
        pipe.hset(self.EMAIL_INDEX, normalized, user_id)
        pipe.set(self.USER_KEY.format(user_id=user_id), json.dumps(user_record))
        await pipe.execute()
        await self._set_membership(
            user_id=user_id,
            tenant_id=tenant_id,
            role=_tenant_role(role),
        )
        account = await self.get_user(user_id)
        assert account is not None
        return account

    async def authenticate(self, email: str, password: str) -> UserAccount | None:
        await self._ensure_client()
        try:
            _, normalized = normalize_email(email)
        except ValueError:
            return None
        user_id = await self.client.hget(self.EMAIL_INDEX, normalized)
        if not user_id:
            # Timing-ish dummy verify
            verify_password(password, hash_password("dummy-equalization"))
            return None
        raw = await self._get_user_raw(user_id)
        if raw is None:
            return None
        if not verify_password(password, str(raw.get("password_hash") or "")):
            return None
        if str(raw.get("status") or "active") == "disabled":
            return None
        raw["last_login_at"] = _now().isoformat()
        raw["updated_at"] = raw["last_login_at"]
        await self.client.set(
            self.USER_KEY.format(user_id=user_id),
            json.dumps(raw),
        )
        return await self.get_user(user_id)

    async def update_user(
        self,
        user_id: str,
        *,
        role: Role | None = None,
        department_id: str | None = None,
        tenant_id: str | None = None,
        clear_department: bool = False,
        password: str | None = None,
        display_name: str | None = None,
    ) -> UserAccount:
        raw = await self._get_user_raw(user_id)
        if raw is None:
            raise KeyError(user_id)

        if password is not None:
            raw["password_hash"] = hash_password(password)
        if display_name is not None:
            raw["display_name"] = display_name.strip()
        raw["updated_at"] = _now().isoformat()
        await self.client.set(
            self.USER_KEY.format(user_id=user_id),
            json.dumps(raw),
        )

        org_id = tenant_id or department_id
        membership = await self._get_membership_raw(user_id)
        if clear_department:
            if membership:
                old_tid = membership.get("tenant_id")
                await self.client.delete(self.MEMBERSHIP_KEY.format(user_id=user_id))
                if old_tid:
                    await self.client.srem(
                        self.TENANT_MEMBERS.format(tenant_id=old_tid),
                        user_id,
                    )
        elif org_id is not None or role is not None:
            tid = org_id or (membership or {}).get("tenant_id")
            if not tid:
                raise ValueError("organization is required")
            if await self.get_tenant(str(tid)) is None:
                raise ValueError("organization not found")
            t_role = _tenant_role(role) if role is not None else (
                str((membership or {}).get("role") or "member")
            )
            if t_role not in ("admin", "member", "guest"):
                t_role = "member"
            # Move membership set if tenant changed
            if membership and membership.get("tenant_id") and membership.get("tenant_id") != tid:
                await self.client.srem(
                    self.TENANT_MEMBERS.format(tenant_id=membership["tenant_id"]),
                    user_id,
                )
            await self._set_membership(
                user_id=user_id,
                tenant_id=str(tid),
                role=t_role,  # type: ignore[arg-type]
            )

        account = await self.get_user(user_id)
        assert account is not None
        return account

    async def to_public(self, account: UserAccount) -> dict[str, Any]:
        tenant_name = None
        if account.tenant_id:
            tenant = await self.get_tenant(account.tenant_id)
            tenant_name = tenant.name if tenant else None
        return {
            "id": account.id,
            "email": account.email,
            "display_name": account.display_name,
            "username": account.email,
            "role": account.role,
            "tenant_id": account.tenant_id,
            "tenant_name": tenant_name,
            "department_id": account.tenant_id,
            "department_name": tenant_name,
        }

    # ---- custom models / skillhub (unchanged keys) ----

    async def list_custom_models(self, credential_id: str) -> list[CustomModelCard]:
        await self._ensure_client()
        raw = await self.client.get(
            self.CUSTOM_MODELS_KEY.format(credential_id=credential_id),
        )
        if not raw:
            return []
        data = json.loads(raw)
        return [CustomModelCard.model_validate(item) for item in data]

    async def add_custom_model(
        self,
        credential_id: str,
        card: CustomModelCard,
    ) -> CustomModelCard:
        await self._ensure_client()
        models = await self.list_custom_models(credential_id)
        name = card.name.strip()
        if not name:
            raise ValueError("model name is required")
        if any(m.name == name for m in models):
            raise ValueError("model already exists")
        card = card.model_copy(
            update={
                "name": name,
                "label": (card.label or name).strip() or name,
            },
        )
        models.append(card)
        await self._save_custom_models(credential_id, models)
        return card

    async def delete_custom_model(self, credential_id: str, model_name: str) -> bool:
        await self._ensure_client()
        models = await self.list_custom_models(credential_id)
        kept = [m for m in models if m.name != model_name]
        if len(kept) == len(models):
            return False
        await self._save_custom_models(credential_id, kept)
        return True

    async def _save_custom_models(
        self,
        credential_id: str,
        models: list[CustomModelCard],
    ) -> None:
        key = self.CUSTOM_MODELS_KEY.format(credential_id=credential_id)
        if not models:
            await self.client.delete(key)
            return
        await self.client.set(
            key,
            json.dumps([m.model_dump() for m in models]),
        )

    async def get_skillhub_settings(self) -> dict[str, Any] | None:
        await self._ensure_client()
        raw = await self.client.get(self.SKILLHUB_SETTINGS_KEY)
        if not raw:
            return None
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return None
        if not isinstance(data, dict) or not data.get("base_url"):
            return None
        return {
            "base_url": str(data["base_url"]),
            "token": data.get("token") if data.get("token") else None,
        }

    async def set_skillhub_settings(self, *, base_url: str, token: str | None) -> None:
        await self._ensure_client()
        await self.client.set(
            self.SKILLHUB_SETTINGS_KEY,
            json.dumps({"base_url": base_url, "token": token}),
        )
