# -*- coding: utf-8 -*-
"""Tenant skill upload and review routes."""
from datetime import datetime

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from pydantic import BaseModel, Field, ValidationError

from .._service._skill_submission import (
    SkillSubmissionError,
    SkillSubmissionService,
)
from .._service._skill_upload import UploadManifest
from ..auth._context import AuthContext
from ..deps import (
    get_current_auth_context,
    get_skill_submission_service,
    require_role,
)
from ..storage import (
    SkillScanStatus,
    SkillSubmissionRecord,
    SkillSubmissionStatus,
    TenantRole,
)

submission_router = APIRouter(
    prefix="/skill-submissions",
    tags=["skill-submissions"],
)
_require_submitter = require_role(TenantRole.MEMBER)


class SkillSubmissionView(BaseModel):
    """Safe submission metadata; archive paths never cross this boundary."""

    id: str
    tenant_id: str
    submitted_by: str
    name: str
    display_name: str | None
    description: str
    version: str
    status: SkillSubmissionStatus
    scan_status: SkillScanStatus | None
    scan_findings: list[str]
    rejection_reason: str | None
    archive_size: int
    archive_sha256: str
    approved_by: str | None
    published_namespace: str | None
    published_slug: str | None
    published_version: str | None
    published_visibility: str | None
    last_error: str | None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_record(cls, record: SkillSubmissionRecord) -> "SkillSubmissionView":
        return cls.model_validate(record.model_dump())


class ListSkillSubmissionsResponse(BaseModel):
    """Tenant-filtered review queue."""

    submissions: list[SkillSubmissionView]
    total: int


class RejectSkillSubmissionRequest(BaseModel):
    """The reason retained with a rejected package."""

    reason: str = Field(min_length=1, max_length=2000)


def _not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Skill submission was not found.",
    )


def _as_http_error(exc: SkillSubmissionError) -> HTTPException:
    message = str(exc)
    code = (
        status.HTTP_403_FORBIDDEN
        if "admin role" in message
        else status.HTTP_409_CONFLICT
    )
    return HTTPException(status_code=code, detail=message)


@submission_router.post(
    "/upload",
    response_model=SkillSubmissionView,
    status_code=status.HTTP_201_CREATED,
)
async def upload_skill_submission(
    manifest: str = Form(...),
    files: list[UploadFile] = File(...),
    context: AuthContext = Depends(_require_submitter),
    service: SkillSubmissionService = Depends(get_skill_submission_service),
) -> SkillSubmissionView:
    """Upload a skill package into the tenant review queue."""
    try:
        parsed = UploadManifest.model_validate_json(manifest)
        record = await service.submit(context, parsed, files)
    except (ValidationError, SkillSubmissionError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    return SkillSubmissionView.from_record(record)


@submission_router.get(
    "",
    response_model=ListSkillSubmissionsResponse,
)
async def list_skill_submissions(
    status_filter: SkillSubmissionStatus | None = Query(
        default=None,
        alias="status",
    ),
    context: AuthContext = Depends(get_current_auth_context),
    service: SkillSubmissionService = Depends(get_skill_submission_service),
) -> ListSkillSubmissionsResponse:
    """List the tenant review queue or the caller's own submissions."""
    records = await service.list_for(context, status_filter)
    views = [SkillSubmissionView.from_record(record) for record in records]
    return ListSkillSubmissionsResponse(submissions=views, total=len(views))


@submission_router.get(
    "/{submission_id}",
    response_model=SkillSubmissionView,
)
async def get_skill_submission(
    submission_id: str,
    context: AuthContext = Depends(get_current_auth_context),
    service: SkillSubmissionService = Depends(get_skill_submission_service),
) -> SkillSubmissionView:
    """Read a submission only inside the caller's tenant and role scope."""
    try:
        record = await service.get_for(context, submission_id)
    except SkillSubmissionError as exc:
        raise _not_found() from exc
    return SkillSubmissionView.from_record(record)


@submission_router.post(
    "/{submission_id}/approve",
    response_model=SkillSubmissionView,
)
async def approve_skill_submission(
    submission_id: str,
    context: AuthContext = Depends(require_role(TenantRole.ADMIN)),
    service: SkillSubmissionService = Depends(get_skill_submission_service),
) -> SkillSubmissionView:
    """Approve and publish a passed submission as an administrator."""
    try:
        record = await service.approve(context, submission_id)
    except SkillSubmissionError as exc:
        if "not found" in str(exc):
            raise _not_found() from exc
        raise _as_http_error(exc) from exc
    return SkillSubmissionView.from_record(record)


@submission_router.post(
    "/{submission_id}/reject",
    response_model=SkillSubmissionView,
)
async def reject_skill_submission(
    submission_id: str,
    body: RejectSkillSubmissionRequest,
    context: AuthContext = Depends(require_role(TenantRole.ADMIN)),
    service: SkillSubmissionService = Depends(get_skill_submission_service),
) -> SkillSubmissionView:
    """Reject a submission and retain the administrator's reason."""
    try:
        record = await service.reject(context, submission_id, body.reason)
    except SkillSubmissionError as exc:
        if "not found" in str(exc):
            raise _not_found() from exc
        raise _as_http_error(exc) from exc
    return SkillSubmissionView.from_record(record)