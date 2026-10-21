# -*- coding: utf-8 -*-
"""Skill upload / review routes (API shape matches v0.1 skill-submissions)."""

from __future__ import annotations

from datetime import datetime

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)
from pydantic import BaseModel, Field, ValidationError

from agentscope.app.auth import AuthContext, TenantRole
from agentscope.app._service._skill_submission import (
    SkillSubmissionError,
    SkillSubmissionService,
)
from agentscope.app._service._skill_upload import UploadManifest
from agentscope.app.storage import (
    SkillSubmissionRecord,
    SkillSubmissionStatus,
)

from .deps import get_current_account, require_admin
from .models import UserAccount

submission_router = APIRouter(
    prefix="/skill-submissions",
    tags=["skill-submissions"],
)


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
    scan_status: str | None
    scan_findings: list[str]
    rejection_reason: str | None
    archive_size: int
    archive_sha256: str
    approved_by: str | None
    reviewed_at: datetime | None = None
    published_namespace: str | None
    published_slug: str | None
    published_version: str | None
    published_visibility: str | None
    last_error: str | None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_record(cls, record: SkillSubmissionRecord) -> "SkillSubmissionView":
        payload = record.model_dump()
        scan = payload.get("scan_status")
        if scan is not None and hasattr(scan, "value"):
            payload["scan_status"] = scan.value
        return cls.model_validate(payload)


class ListSkillSubmissionsResponse(BaseModel):
    """Tenant-filtered review queue."""

    submissions: list[SkillSubmissionView]
    total: int


class RejectSkillSubmissionRequest(BaseModel):
    """The reason retained with a rejected package."""

    reason: str = Field(min_length=1, max_length=2000)


def _service(request: Request) -> SkillSubmissionService:
    service = getattr(request.app.state, "skill_submission_service", None)
    if service is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Skill submission service is not configured.",
        )
    return service


def _context_from_account(account: UserAccount) -> AuthContext:
    tenant_id = account.tenant_id or account.department_id
    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Account has no organization; cannot submit skills.",
        )
    role = (
        TenantRole.ADMIN
        if account.role == "admin"
        else TenantRole.MEMBER
    )
    return AuthContext(
        user_id=account.id,
        tenant_id=tenant_id,
        role=role,
    )


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
    request: Request,
    manifest: str = Form(...),
    files: list[UploadFile] = File(...),
    account: UserAccount = Depends(get_current_account),
) -> SkillSubmissionView:
    """Upload a skill package into the tenant review queue."""
    service = _service(request)
    context = _context_from_account(account)
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
    request: Request,
    status_filter: SkillSubmissionStatus | None = Query(
        default=None,
        alias="status",
    ),
    account: UserAccount = Depends(get_current_account),
) -> ListSkillSubmissionsResponse:
    """List the tenant review queue or the caller's own submissions."""
    service = _service(request)
    context = _context_from_account(account)
    records = await service.list_for(context, status_filter)
    views = [SkillSubmissionView.from_record(record) for record in records]
    return ListSkillSubmissionsResponse(submissions=views, total=len(views))


@submission_router.get(
    "/{submission_id}",
    response_model=SkillSubmissionView,
)
async def get_skill_submission(
    submission_id: str,
    request: Request,
    account: UserAccount = Depends(get_current_account),
) -> SkillSubmissionView:
    """Read a submission only inside the caller's tenant and role scope."""
    service = _service(request)
    context = _context_from_account(account)
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
    request: Request,
    account: UserAccount = Depends(require_admin),
) -> SkillSubmissionView:
    """Approve and publish a passed submission as an administrator."""
    service = _service(request)
    context = _context_from_account(account)
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
    request: Request,
    account: UserAccount = Depends(require_admin),
) -> SkillSubmissionView:
    """Reject a submission and retain the administrator's reason."""
    service = _service(request)
    context = _context_from_account(account)
    try:
        record = await service.reject(context, submission_id, body.reason)
    except SkillSubmissionError as exc:
        if "not found" in str(exc):
            raise _not_found() from exc
        raise _as_http_error(exc) from exc
    return SkillSubmissionView.from_record(record)
