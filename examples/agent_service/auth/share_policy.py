# -*- coding: utf-8 -*-
"""Cross-owner policy: every user can use agents; only the owner can edit/delete.

Shared credentials and knowledge bases are granted **READ** as well so a
viewer can run another user's agent (model keys stay masked in list/get
API responses; runtime still resolves the raw secret via
``ResourceAccessService.resolve_credential``).
"""

from __future__ import annotations

from agentscope.app.access import (
    ResourceAccessPolicyBase,
    ResourceKind,
    ResourcePermission,
    ResourceRef,
)
from agentscope.app.storage import StorageBase

from .store import AuthStore


class ShareAllAgentsPolicy(ResourceAccessPolicyBase):
    """Share all user-owned agents (and supporting credentials / KBs) as READ.

    Cross-owner ``EDIT`` is never granted, so PATCH/DELETE stay with the
    creator. Own resources remain fully editable through the normal owner path.
    """

    _SHARED_KINDS = frozenset(
        {
            ResourceKind.AGENT,
            ResourceKind.CREDENTIAL,
            ResourceKind.KNOWLEDGE_BASE,
        },
    )

    def __init__(self, auth_store: AuthStore) -> None:
        self._auth_store = auth_store

    async def list_accessible(
        self,
        viewer_id: str,
        kind: ResourceKind,
        storage: StorageBase,
    ) -> list[ResourceRef]:
        """Return READ refs for every other user's resources of ``kind``."""
        if kind not in self._SHARED_KINDS:
            return []

        refs: list[ResourceRef] = []
        for account in await self._auth_store.list_users():
            owner_id = account.id
            if owner_id == viewer_id:
                continue

            if kind is ResourceKind.AGENT:
                for agent in await storage.list_agents(owner_id):
                    if agent.source == "team":
                        continue
                    refs.append(
                        ResourceRef(
                            kind=kind,
                            owner_id=owner_id,
                            resource_id=agent.id,
                            permission=ResourcePermission.READ,
                        ),
                    )
            elif kind is ResourceKind.CREDENTIAL:
                for cred in await storage.list_credentials(owner_id):
                    refs.append(
                        ResourceRef(
                            kind=kind,
                            owner_id=owner_id,
                            resource_id=cred.id,
                            permission=ResourcePermission.READ,
                        ),
                    )
            else:  # knowledge_base
                for kb in await storage.list_knowledge_bases(owner_id):
                    refs.append(
                        ResourceRef(
                            kind=kind,
                            owner_id=owner_id,
                            resource_id=kb.id,
                            permission=ResourcePermission.READ,
                        ),
                    )
        return refs
