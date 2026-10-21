# -*- coding: utf-8 -*-
"""Custom chat-model ids attached to a credential (SiliconFlow / NewAPI)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from agentscope.app.access import ResourceKind
from agentscope.app.deps import (
    get_current_user_id,
    get_resource_access_service,
)
from agentscope.app._service import ResourceAccessService

from .deps import get_auth_store, get_current_account
from .models import (
    CustomModelCard,
    CustomModelCreate,
    CustomModelPublic,
    UserAccount,
)
from .store import AuthStore

custom_models_router = APIRouter(
    prefix="/custom-models",
    tags=["custom-models"],
)


def _to_public(card: CustomModelCard) -> CustomModelPublic:
    return CustomModelPublic(
        name=card.name,
        label=card.label or card.name,
        input_types=card.input_types,
        output_types=card.output_types,
        context_size=card.context_size,
        output_size=card.output_size,
    )


async def _require_visible_credential(
    access: ResourceAccessService,
    user_id: str,
    credential_id: str,
) -> None:
    """404 when the credential is neither owned nor shared to the viewer."""
    await access.get_resource(user_id, ResourceKind.CREDENTIAL, credential_id)


async def _require_owned_credential(
    access: ResourceAccessService,
    user_id: str,
    credential_id: str,
) -> None:
    """403/404 unless the viewer owns the credential (can edit)."""
    view = await access.get_resource(
        user_id,
        ResourceKind.CREDENTIAL,
        credential_id,
    )
    if not view.editable:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the credential owner can manage custom models.",
        )


@custom_models_router.get(
    "/{credential_id}",
    response_model=list[CustomModelPublic],
    summary="List custom models for a credential",
)
async def list_custom_models(
    credential_id: str,
    user_id: str = Depends(get_current_user_id),
    access: ResourceAccessService = Depends(get_resource_access_service),
    store: AuthStore = Depends(get_auth_store),
) -> list[CustomModelPublic]:
    """Return user-defined model ids under this credential."""
    await _require_visible_credential(access, user_id, credential_id)
    cards = await store.list_custom_models(credential_id)
    return [_to_public(c) for c in cards]


@custom_models_router.post(
    "/{credential_id}",
    response_model=CustomModelPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Add a custom model under a credential",
)
async def add_custom_model(
    credential_id: str,
    body: CustomModelCreate,
    user_id: str = Depends(get_current_user_id),
    access: ResourceAccessService = Depends(get_resource_access_service),
    store: AuthStore = Depends(get_auth_store),
    _: UserAccount = Depends(get_current_account),
) -> CustomModelPublic:
    """Register a SiliconFlow / NewAPI model id for the picker and detail page."""
    await _require_owned_credential(access, user_id, credential_id)
    try:
        card = await store.add_custom_model(
            credential_id,
            CustomModelCard(
                name=body.name.strip(),
                label=(body.label or body.name).strip(),
                context_size=body.context_size,
                output_size=body.output_size,
            ),
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    return _to_public(card)


@custom_models_router.delete(
    "/{credential_id}/{model_name:path}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove a custom model",
)
async def delete_custom_model(
    credential_id: str,
    model_name: str,
    user_id: str = Depends(get_current_user_id),
    access: ResourceAccessService = Depends(get_resource_access_service),
    store: AuthStore = Depends(get_auth_store),
    _: UserAccount = Depends(get_current_account),
) -> None:
    """Delete one custom model id from the credential."""
    await _require_owned_credential(access, user_id, credential_id)
    deleted = await store.delete_custom_model(credential_id, model_name)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Custom model not found.",
        )
