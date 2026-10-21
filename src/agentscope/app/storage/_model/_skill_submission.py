# -*- coding: utf-8 -*-
"""Tenant-scoped skill submission and governance records."""
from datetime import datetime
from enum import StrEnum

from pydantic import Field

from ._base import _RecordBase


class SkillSubmissionStatus(StrEnum):
    """The externally visible lifecycle of one submitted package."""

    SCANNING = "scanning"
    SCAN_FAILED = "scan_failed"
    PENDING_APPROVAL = "pending_approval"
    REJECTED = "rejected"
    APPROVED = "approved"
    PUBLISHING = "publishing"
    PUBLISH_FAILED = "publish_failed"
    PUBLISHED = "published"


class SkillScanStatus(StrEnum):
    """The result of the local package safety scan."""

    PASSED = "passed"
    FAILED = "failed"


class SkillSubmissionRecord(_RecordBase):
    """A tenant-owned package waiting for review or publication.

    The archive path is an internal server-side reference and is never
    returned by a public view. Metadata and scan findings are retained so
    an administrator can make a decision without exposing package bytes
    or upstream connection details through the API.
    """

    tenant_id: str
    submitted_by: str
    name: str
    display_name: str | None = None
    description: str = ""
    version: str = ""
    status: SkillSubmissionStatus = SkillSubmissionStatus.SCANNING
    scan_status: SkillScanStatus | None = None
    scan_findings: list[str] = Field(default_factory=list)
    rejection_reason: str | None = None
    archive_path: str
    archive_size: int = Field(ge=0)
    archive_sha256: str
    approved_by: str | None = None
    reviewed_at: datetime | None = None
    published_namespace: str | None = None
    published_slug: str | None = None
    published_version: str | None = None
    published_visibility: str | None = None
    last_error: str | None = None