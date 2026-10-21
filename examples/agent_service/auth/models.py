# -*- coding: utf-8 -*-
"""Pydantic models for v0.1-compatible email / tenant auth."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field


# API-facing role: admin stays admin; member/guest map to user in JWT helpers.
Role = Literal["admin", "user"]
TenantRole = Literal["admin", "member", "guest"]


class UserAccount(BaseModel):
    """Runtime account view used by deps / share policy."""

    id: str
    email: str
    display_name: str = ""
    # Mapped from tenant membership: admin | user (member/guest → user).
    role: Role = "user"
    tenant_role: TenantRole = "member"
    tenant_id: str | None = None
    # Alias for older call sites that still say username / department.
    username: str = ""
    department_id: str | None = None
    status: str = "active"
    email_verified: bool = False


class Tenant(BaseModel):
    """Organization (v0.1 tenant)."""

    id: str
    name: str
    slug: str
    owner_user_id: str
    created_at: datetime | str | None = None
    updated_at: datetime | str | None = None


# Keep Department as an alias shape for the organizations list API.
class Department(BaseModel):
    """Wire shape for organization list (maps from Tenant)."""

    id: str
    name: str
    description: str | None = None
    created_at: str = ""
    updated_at: str = ""


class RegisterRequest(BaseModel):
    """Self-register: email + password + display name + organization name."""

    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    display_name: str = Field(default="", max_length=255)
    tenant_name: str = Field(min_length=1, max_length=255)


class LoginRequest(BaseModel):
    """Email + password login (v0.1 compatible)."""

    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserPublic(BaseModel):
    """User payload returned to clients."""

    id: str
    email: str
    display_name: str = ""
    username: str = ""  # same as email for UI compatibility
    role: Role
    tenant_id: str | None = None
    tenant_name: str | None = None
    department_id: str | None = None
    department_name: str | None = None


class TokenResponse(BaseModel):
    """Login / register success body."""

    access_token: str
    token_type: str = "bearer"
    user: UserPublic


class DepartmentCreate(BaseModel):
    """Create an organization (tenant)."""

    name: str = Field(min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=512)


class DepartmentUpdate(BaseModel):
    """Rename an organization."""

    name: str | None = Field(default=None, min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=512)


class UserUpdate(BaseModel):
    """Admin patch for role / organization / password."""

    role: Role | None = None
    department_id: str | None = None
    tenant_id: str | None = None
    clear_department: bool = False
    password: str | None = Field(default=None, min_length=6, max_length=128)
    display_name: str | None = Field(default=None, max_length=255)


class CreateUserRequest(BaseModel):
    """Admin direct-create (no invitation): email, password, org, role."""

    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    display_name: str = Field(default="", max_length=255)
    role: Role = "user"
    department_id: str = Field(min_length=1, description="Tenant / organization id")
    tenant_id: str | None = None

    def org_id(self) -> str:
        return (self.tenant_id or self.department_id).strip()


class CustomModelCard(BaseModel):
    """User-defined chat model id under a credential."""

    name: str = Field(min_length=1, max_length=256)
    label: str | None = Field(default=None, max_length=256)
    context_size: int = Field(default=128_000, gt=0)
    output_size: int = Field(default=8192, gt=0)
    input_types: list[str] = Field(default_factory=lambda: ["text/plain"])
    output_types: list[str] = Field(default_factory=lambda: ["text/plain"])


class CustomModelCreate(BaseModel):
    """Body for adding a custom model under a credential."""

    name: str = Field(min_length=1, max_length=256)
    label: str | None = Field(default=None, max_length=256)
    context_size: int = Field(default=128_000, gt=0)
    output_size: int = Field(default=8192, gt=0)


class CustomModelPublic(BaseModel):
    """Wire shape matching AgentScope ``ModelCard`` for the Web UI."""

    type: Literal["chat_model"] = "chat_model"
    name: str
    label: str
    status: Literal["active"] = "active"
    deprecated_at: None = None
    input_types: list[str]
    output_types: list[str]
    context_size: int
    output_size: int
    parameter_schema: dict = Field(default_factory=dict)
    parameters_overrides: dict = Field(default_factory=dict)
    custom: bool = True
