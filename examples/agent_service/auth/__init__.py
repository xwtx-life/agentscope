# -*- coding: utf-8 -*-
"""JWT auth + flat departments for the agent_service example."""

from .custom_models_router import custom_models_router
from .deps import create_jwt_user_dependency
from .router import auth_router, department_router
from .share_policy import ShareAllAgentsPolicy
from .skillhub_settings_router import (
    load_skillhub_settings_into_hub,
    skillhub_settings_router,
)
from .store import AuthStore

__all__ = [
    "AuthStore",
    "ShareAllAgentsPolicy",
    "auth_router",
    "create_jwt_user_dependency",
    "custom_models_router",
    "department_router",
    "load_skillhub_settings_into_hub",
    "skillhub_settings_router",
]
