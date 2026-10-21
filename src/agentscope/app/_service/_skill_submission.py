# -*- coding: utf-8 -*-
"""Skill package submission, review, and publication workflow."""
from __future__ import annotations

import asyncio
import hashlib
import os
import re
import tarfile
import tempfile
import zipfile
from datetime import datetime
from pathlib import Path

import frontmatter
from fastapi import UploadFile

from ..auth import AuthContext, TenantRole
from ..hub import SkillHubBase
from ..storage import (
    SkillScanStatus,
    SkillSubmissionRecord,
    SkillSubmissionStatus,
    StorageBase,
)
from ._skill_upload import (
    SkillUploadError,
    UploadManifest,
    _tar_stream,
    _validate_manifest,
)

_ROOT_NAME = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}")
_MAX_SKILL_MD_BYTES = 1024 * 1024


class SkillSubmissionError(ValueError):
    """A safe, user-facing submission transition error."""


class SkillSubmissionService:
    """Own the package bytes and the tenant review state machine."""

    def __init__(
        self,
        storage: StorageBase,
        root_dir: str | Path,
        publisher: SkillHubBase | None = None,
        publish_visibility: str = "PRIVATE",
    ) -> None:
        self.storage = storage
        self.root_dir = Path(root_dir).expanduser().resolve()
        self.publisher = publisher
        self.publish_visibility = publish_visibility

    @staticmethod
    def _require_admin(context: AuthContext) -> None:
        if context.role != TenantRole.ADMIN:
            raise SkillSubmissionError("The admin role is required for review.")

    @staticmethod
    def _validate_state(
        record: SkillSubmissionRecord,
        expected: SkillSubmissionStatus,
    ) -> None:
        if record.status != expected:
            raise SkillSubmissionError(
                f"Submission is {record.status.value}; expected {expected.value}.",
            )

    async def submit(
        self,
        context: AuthContext,
        manifest: UploadManifest,
        files: list[UploadFile],
    ) -> SkillSubmissionRecord:
        """Stream one folder into private storage and queue it for review."""
        try:
            root = _validate_manifest(manifest)
        except SkillUploadError as exc:
            raise SkillSubmissionError(str(exc)) from exc
        if not _ROOT_NAME.fullmatch(root):
            raise SkillSubmissionError(
                "The skill folder name must use letters, numbers, '.', '_' or '-'.",
            )
        if len(files) != len(manifest.entries):
            raise SkillSubmissionError(
                f"The manifest lists {len(manifest.entries)} files but "
                f"{len(files)} were sent.",
            )

        record = SkillSubmissionRecord(
            tenant_id=context.tenant_id,
            submitted_by=context.user_id,
            name=root,
            archive_path="",
            archive_size=0,
            archive_sha256="",
        )
        destination = self.root_dir / context.tenant_id / f"{record.id}.tar"
        destination.parent.mkdir(parents=True, exist_ok=True)
        record.archive_path = str(destination)

        try:
            digest = hashlib.sha256()
            size = 0
            with destination.open("wb") as output:
                async for chunk in _tar_stream(manifest, files):
                    await asyncio.to_thread(output.write, chunk)
                    digest.update(chunk)
                    size += len(chunk)
            record.archive_size = size
            record.archive_sha256 = digest.hexdigest()
            findings, metadata = await asyncio.to_thread(
                self._scan_archive,
                destination,
                root,
            )
            record.scan_findings = findings
            record.scan_status = (
                SkillScanStatus.FAILED if findings else SkillScanStatus.PASSED
            )
            if findings:
                record.status = SkillSubmissionStatus.SCAN_FAILED
            else:
                record.status = SkillSubmissionStatus.PENDING_APPROVAL
            record.description = str(metadata.get("description") or "")
            record.version = str(metadata.get("version") or "")
            record.display_name = str(metadata.get("display_name") or "") or None
        except SkillUploadError as exc:
            destination.unlink(missing_ok=True)
            raise SkillSubmissionError(str(exc)) from exc
        except BaseException:
            destination.unlink(missing_ok=True)
            raise

        try:
            existing = await self.storage.list_skill_submissions(context.tenant_id)
        except BaseException:
            destination.unlink(missing_ok=True)
            raise
        duplicate_statuses = {
            SkillSubmissionStatus.PENDING_APPROVAL,
            SkillSubmissionStatus.APPROVED,
            SkillSubmissionStatus.PUBLISHING,
            SkillSubmissionStatus.PUBLISH_FAILED,
            SkillSubmissionStatus.PUBLISHED,
        }
        if any(
            item.name == record.name
            and item.archive_sha256 == record.archive_sha256
            and item.status in duplicate_statuses
            for item in existing
        ):
            destination.unlink(missing_ok=True)
            raise SkillSubmissionError(
                "This skill package has already been submitted for review.",
            )

        try:
            await self.storage.upsert_skill_submission(record)
        except BaseException:
            destination.unlink(missing_ok=True)
            raise
        await self._audit(
            context,
            "skill.submission.created",
            record,
            {"scan_status": record.scan_status.value if record.scan_status else None},
        )
        return record

    async def list_for(
        self,
        context: AuthContext,
        requested_status: SkillSubmissionStatus | None = None,
    ) -> list[SkillSubmissionRecord]:
        """Return all tenant submissions to admins, own records to others."""
        records = await self.storage.list_skill_submissions(
            context.tenant_id,
            requested_status,
        )
        if context.role == TenantRole.ADMIN:
            return records
        return [record for record in records if record.submitted_by == context.user_id]

    async def get_for(
        self,
        context: AuthContext,
        submission_id: str,
    ) -> SkillSubmissionRecord:
        record = await self.storage.get_skill_submission(
            context.tenant_id,
            submission_id,
        )
        if record is None or (
            context.role != TenantRole.ADMIN
            and record.submitted_by != context.user_id
        ):
            raise SkillSubmissionError("Skill submission was not found.")
        return record

    async def reject(
        self,
        context: AuthContext,
        submission_id: str,
        reason: str,
    ) -> SkillSubmissionRecord:
        self._require_admin(context)
        record = await self.get_for(context, submission_id)
        self._validate_state(record, SkillSubmissionStatus.PENDING_APPROVAL)
        normalized_reason = reason.strip()
        if not normalized_reason:
            raise SkillSubmissionError("A rejection reason is required.")
        record.status = SkillSubmissionStatus.REJECTED
        record.rejection_reason = normalized_reason[:2000]
        record.approved_by = context.user_id
        record.reviewed_at = datetime.now()
        await self.storage.upsert_skill_submission(record)
        await self._audit(
            context,
            "skill.submission.rejected",
            record,
            {"reason": record.rejection_reason},
        )
        return record

    async def approve(
        self,
        context: AuthContext,
        submission_id: str,
    ) -> SkillSubmissionRecord:
        """Approve once, publish to SkillHub, and retain failures for retry."""
        self._require_admin(context)
        record = await self.get_for(context, submission_id)
        if record.status not in {
            SkillSubmissionStatus.PENDING_APPROVAL,
            SkillSubmissionStatus.PUBLISH_FAILED,
        }:
            raise SkillSubmissionError(
                f"Submission is {record.status.value}; expected "
                "pending_approval or publish_failed.",
            )
        if record.scan_status != SkillScanStatus.PASSED:
            raise SkillSubmissionError("Only a passed package can be approved.")
        if self.publisher is None:
            raise SkillSubmissionError("No writable SkillHub is configured.")

        record.status = SkillSubmissionStatus.APPROVED
        record.approved_by = context.user_id
        record.reviewed_at = datetime.now()
        record.last_error = None
        await self.storage.upsert_skill_submission(record)
        await self._audit(context, "skill.submission.approved", record)
        record.status = SkillSubmissionStatus.PUBLISHING
        await self.storage.upsert_skill_submission(record)
        await self._audit(context, "skill.submission.approval_started", record)

        zip_path: Path | None = None
        try:
            archive = Path(record.archive_path).resolve()
            if not archive.is_relative_to(self.root_dir):
                raise SkillSubmissionError(
                    "Submission archive is outside private storage.",
                )
            zip_path = await asyncio.to_thread(self._tar_to_zip, archive)
            result = await self.publisher.publish(
                context.user_id,
                str(zip_path),
                context.tenant_id,
                visibility=self.publish_visibility,
            )
            record.status = SkillSubmissionStatus.PUBLISHED
            record.published_namespace = result.namespace
            record.published_slug = result.slug
            record.published_version = result.version
            record.published_visibility = result.visibility
            await self.storage.upsert_skill_submission(record)
            await self._audit(
                context,
                "skill.submission.published",
                record,
                {
                    "namespace": result.namespace,
                    "slug": result.slug,
                    "version": result.version,
                    "visibility": result.visibility,
                },
            )
            return record
        except Exception as exc:  # publisher errors are retained for retry
            record.status = SkillSubmissionStatus.PUBLISH_FAILED
            record.last_error = str(exc)[:2000]
            await self.storage.upsert_skill_submission(record)
            await self._audit(
                context,
                "skill.submission.publish_failed",
                record,
                {"error": record.last_error},
            )
            raise SkillSubmissionError(
                "The package passed review but SkillHub publication failed.",
            ) from exc
        finally:
            if zip_path is not None:
                zip_path.unlink(missing_ok=True)

    @staticmethod
    def _scan_archive(
        archive_path: Path,
        root: str,
    ) -> tuple[list[str], dict[str, object]]:
        """Reject links and unsafe members before an admin sees the package."""
        findings: list[str] = []
        metadata: dict[str, object] = {}
        with tarfile.open(archive_path, "r") as archive:
            members = archive.getmembers()
            for member in members:
                path = Path(member.name)
                if (
                    path.is_absolute()
                    or ".." in path.parts
                    or not member.name.startswith(f"{root}/")
                ):
                    findings.append(f"unsafe archive path: {member.name}")
                if member.issym() or member.islnk():
                    findings.append(f"links are not allowed: {member.name}")
                if not member.isfile() and not member.isdir():
                    findings.append(f"unsupported archive entry: {member.name}")
            skill_member = next(
                (member for member in members if member.name == f"{root}/SKILL.md"),
                None,
            )
            if skill_member is None or not skill_member.isfile():
                findings.append("SKILL.md is missing or is not a regular file")
            else:
                skill_md = archive.extractfile(skill_member)
                if skill_md is None:
                    findings.append("SKILL.md could not be read")
                else:
                    raw = skill_md.read(_MAX_SKILL_MD_BYTES + 1)
                    if len(raw) > _MAX_SKILL_MD_BYTES:
                        findings.append("SKILL.md exceeds the 1 MiB limit")
                    else:
                        try:
                            parsed = frontmatter.loads(raw.decode("utf-8"))
                        except Exception:  # malformed user-controlled metadata
                            findings.append("SKILL.md has invalid UTF-8 or frontmatter")
                        else:
                            metadata = dict(parsed.metadata)
        return findings, metadata

    @staticmethod
    def _tar_to_zip(archive_path: Path) -> Path:
        """Convert the private tar stream to SkillHub's required ZIP upload."""
        fd, temporary = tempfile.mkstemp(
            prefix=f"{archive_path.stem}-",
            suffix=".zip",
            dir=archive_path.parent,
        )
        os.close(fd)
        Path(temporary).unlink(missing_ok=True)
        zip_path = Path(temporary)
        try:
            with tarfile.open(archive_path, "r") as source, zipfile.ZipFile(
                zip_path,
                "w",
                compression=zipfile.ZIP_DEFLATED,
            ) as target:
                for member in source.getmembers():
                    if member.isfile():
                        stream = source.extractfile(member)
                        if stream is not None:
                            target.writestr(member.name, stream.read())
            return zip_path
        except BaseException:
            zip_path.unlink(missing_ok=True)
            raise

    async def _audit(
        self,
        context: AuthContext,
        action: str,
        record: SkillSubmissionRecord,
        details: dict | None = None,
    ) -> None:
        """Best-effort audit hook; no-op when storage has no audit sink."""
        del context, action, record, details
        return