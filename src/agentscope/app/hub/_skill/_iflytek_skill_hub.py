# -*- coding: utf-8 -*-
"""SkillHub HTTP client (process-level URL + optional Bearer token).

A thin async adapter around the official iFlytek SkillHub APIs
(``/api/v1/*``). Connections default to constructor ``base_url`` /
``api_token`` (same pattern as ClawHub). An optional
``connection_resolver`` remains for advanced deployments that resolve
per-user credentials without changing this hub's storage coupling.
"""
from __future__ import annotations

import asyncio
import base64
import json
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import AsyncExitStack
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, NamedTuple, Self
from urllib.parse import quote

from .._error import HubError
from ._base import SkillArchive, SkillHubBase
from ._card import SkillCard, SkillHubPage

if TYPE_CHECKING:
    import httpx


DEFAULT_BASE_URL = "http://127.0.0.1:8080"
DEFAULT_CHUNK_SIZE = 64 * 1024


class SkillPublishResult(NamedTuple):
    """Coordinates returned after a package is accepted by SkillHub."""

    namespace: str
    slug: str
    version: str | None
    visibility: str | None


@dataclass(frozen=True)
class SkillHubConnection:
    """One resolved upstream endpoint and its optional Bearer token."""

    base_url: str
    token: str | None = None


class SkillHubConnectionResolutionError(Exception):
    """Raised when a connection cannot be resolved safely."""


SkillHubConnectionResolver = Callable[[str], Awaitable[SkillHubConnection]]


def _encode_cursor(page: int) -> str:
    payload = json.dumps({"page": page}, separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(payload).decode("ascii").rstrip("=")


def _decode_cursor(cursor: str | None) -> int:
    if cursor is None:
        return 0
    try:
        raw = base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4))
        page = json.loads(raw).get("page")
    except (ValueError, TypeError, json.JSONDecodeError) as exc:
        raise ValueError("Invalid SkillHub pagination cursor.") from exc
    if not isinstance(page, int) or page < 0:
        raise ValueError("Invalid SkillHub pagination cursor.")
    return page


class IFlytekSkillHub(SkillHubBase):
    """Thin adapter for the official iFlytek SkillHub HTTP APIs."""

    def __init__(
        self,
        hub_id: str = "skillhub",
        display_name: str = "SkillHub",
        description: str = "The iFlytek SkillHub skill registry.",
        icon_url: str | None = None,
        *,
        base_url: str = DEFAULT_BASE_URL,
        api_token: str | None = None,
        connection_resolver: SkillHubConnectionResolver | None = None,
        timeout: float = 30.0,
    ) -> None:
        super().__init__(hub_id, display_name, description, icon_url)
        self.base_url = base_url.rstrip("/")
        self.api_token = api_token
        self.connection_resolver = connection_resolver
        self.timeout = timeout
        self._client: httpx.AsyncClient | None = None

    def bind_connection_resolver(
        self,
        resolver: SkillHubConnectionResolver,
    ) -> None:
        """Bind a resolver without coupling this hub to application storage."""
        self.connection_resolver = resolver

    async def __aenter__(self) -> Self:
        import httpx

        self._client = httpx.AsyncClient(
            timeout=self.timeout,
            follow_redirects=True,
        )
        return self

    async def __aexit__(self, *exc: object) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    def _http(self) -> httpx.AsyncClient:
        import httpx

        if self._client is None:
            self._client = httpx.AsyncClient(
                timeout=self.timeout,
                follow_redirects=True,
            )
        return self._client

    async def _connection(self, user_id: str) -> SkillHubConnection:
        if self.connection_resolver is None:
            return SkillHubConnection(self.base_url, self.api_token)
        try:
            connection = await self.connection_resolver(user_id)
        except SkillHubConnectionResolutionError as exc:
            raise HubError(self.hub_id, 503, str(exc)) from exc
        return SkillHubConnection(
            base_url=connection.base_url.rstrip("/"),
            token=connection.token,
        )

    @staticmethod
    def _headers(connection: SkillHubConnection) -> dict[str, str]:
        headers = {"Accept": "application/json"}
        if connection.token:
            headers["Authorization"] = f"Bearer {connection.token}"
        return headers

    async def _csrf_headers(
        self,
        connection: SkillHubConnection,
    ) -> dict[str, str]:
        """Fetch the cookie token required by older SkillHub write filters."""
        response = await self._http().get(
            f"{connection.base_url}/",
            headers=self._headers(connection),
        )
        token = response.cookies.get("XSRF-TOKEN")
        if token is None:
            token = self._http().cookies.get("XSRF-TOKEN")
        return {"X-XSRF-TOKEN": token} if token else {}

    @staticmethod
    def _error_message(response: "httpx.Response") -> str:
        try:
            payload = response.json()
        except ValueError:
            return response.text[:1000]
        if isinstance(payload, dict):
            for key in ("msg", "message", "error", "detail"):
                value = payload.get(key)
                if isinstance(value, str) and value:
                    return value
        return response.text[:1000]

    async def _request(
        self,
        user_id: str,
        method: str,
        path: str,
        params: dict | None = None,
        *,
        connection: SkillHubConnection | None = None,
    ) -> "httpx.Response":
        resolved = connection or await self._connection(user_id)
        response = await self._http().request(
            method,
            f"{resolved.base_url}{path}",
            params=params,
            headers=self._headers(resolved),
        )
        if response.status_code >= 400:
            raise HubError(
                self.hub_id,
                response.status_code,
                self._error_message(response),
            )
        return response

    @staticmethod
    def _coordinate(card_id: str) -> tuple[str, str]:
        namespace, separator, slug = card_id.partition("--")
        if not separator:
            namespace, slug = "global", namespace
        if not namespace or not slug or "/" in namespace or "/" in slug:
            raise ValueError("Invalid SkillHub card id.")
        return namespace, slug

    def _to_card(self, item: dict) -> SkillCard:
        canonical_slug = str(item.get("slug") or "")
        _, slug = self._coordinate(canonical_slug)
        latest = item.get("latestVersion")
        version = (
            latest.get("version")
            if isinstance(latest, dict)
            else item.get("version")
        )
        stats = item.get("stats") if isinstance(item.get("stats"), dict) else {}
        updated_at = item.get("updatedAt")
        return SkillCard(
            hub_id=self.hub_id,
            id=canonical_slug,
            name=slug,
            display_name=item.get("displayName"),
            description=item.get("summary") or "",
            version=version,
            updated_at=float(updated_at) / 1000.0 if updated_at else None,
            downloads=stats.get("downloads"),
            metadata={
                key: item[key]
                for key in ("moderation", "score", "stats")
                if item.get(key) is not None
            },
        )

    async def list_skills(
        self,
        user_id: str,
        q: str | None = None,
        cursor: str | None = None,
        limit: int = 20,
    ) -> SkillHubPage:
        """Browse or search SkillHub with an opaque page cursor."""
        try:
            page = _decode_cursor(cursor)
        except ValueError as exc:
            raise HubError(self.hub_id, 400, str(exc)) from exc
        connection = await self._connection(user_id)
        path = "/api/v1/search" if q else "/api/v1/skills"
        params: dict[str, Any] = {"page": page, "limit": limit}
        if q:
            params["q"] = q
        response = await self._request(
            user_id,
            "GET",
            path,
            params,
            connection=connection,
        )
        payload = response.json()
        records = payload.get("results" if q else "items") or []
        next_cursor = payload.get("nextCursor")
        if next_cursor is not None:
            try:
                next_page = int(next_cursor)
            except (TypeError, ValueError):
                next_page = page + 1
            next_cursor = _encode_cursor(next_page)
        elif q and len(records) == limit:
            next_cursor = _encode_cursor(page + 1)
        return SkillHubPage(
            cards=[
                self._to_card(item)
                for item in records
                if item.get("slug")
            ],
            next_cursor=next_cursor,
        )

    async def _resolve_version(
        self,
        user_id: str,
        card_id: str,
        version: str | None,
        connection: SkillHubConnection,
    ) -> str:
        params = {"slug": card_id}
        if version is not None:
            params["version"] = version
        try:
            response = await self._request(
                user_id,
                "GET",
                "/api/v1/resolve",
                params,
                connection=connection,
            )
        except HubError as exc:
            if exc.status_code == 404:
                raise KeyError(card_id) from exc
            raise
        payload = response.json()
        match = payload.get("match")
        resolved = match.get("version") if isinstance(match, dict) else None
        if not resolved:
            raise HubError(
                self.hub_id,
                502,
                "SkillHub returned no resolved version.",
            )
        return str(resolved)

    async def get_skill(self, user_id: str, card_id: str) -> SkillCard:
        """Fetch compat metadata and native ``SKILL.md`` content."""
        import frontmatter

        connection = await self._connection(user_id)
        try:
            detail = await self._request(
                user_id,
                "GET",
                f"/api/v1/skills/{quote(card_id, safe='')}",
                connection=connection,
            )
            version = await self._resolve_version(
                user_id,
                card_id,
                None,
                connection,
            )
        except HubError as exc:
            if exc.status_code == 404:
                raise KeyError(card_id) from exc
            raise

        payload = detail.json()
        item = dict(payload.get("skill") or {})
        item.setdefault("slug", card_id)
        item["latestVersion"] = payload.get("latestVersion")
        item["moderation"] = payload.get("moderation")
        card = self._to_card(item)

        namespace, slug = self._coordinate(card_id)
        try:
            markdown = await self._request(
                user_id,
                "GET",
                "/api/v1/skills/"
                f"{quote(namespace, safe='')}/{quote(slug, safe='')}"
                f"/versions/{quote(version, safe='')}/file",
                {"path": "SKILL.md"},
                connection=connection,
            )
        except HubError as exc:
            if exc.status_code == 404:
                raise KeyError(card_id) from exc
            raise
        parsed = await asyncio.to_thread(frontmatter.loads, markdown.text)
        card.markdown = parsed.content
        if not card.description:
            card.description = str(parsed.get("description", ""))
        card.version = version
        return card

    async def download(
        self,
        user_id: str,
        card_id: str,
        version: str | None = None,
        chunk_size: int = DEFAULT_CHUNK_SIZE,
    ) -> SkillArchive:
        """Resolve and stream a concrete SkillHub ZIP archive."""
        connection = await self._connection(user_id)
        resolved_version = await self._resolve_version(
            user_id,
            card_id,
            version,
            connection,
        )
        namespace, slug = self._coordinate(card_id)
        path = (
            "/api/v1/skills/"
            f"{quote(namespace, safe='')}/{quote(slug, safe='')}"
            f"/versions/{quote(resolved_version, safe='')}/download"
        )
        stack = AsyncExitStack()
        try:
            response = await stack.enter_async_context(
                self._http().stream(
                    "GET",
                    f"{connection.base_url}{path}",
                    headers=self._headers(connection),
                    follow_redirects=True,
                ),
            )
            if response.status_code >= 400:
                body = await response.aread()
                if response.status_code == 404:
                    raise KeyError(card_id)
                raise HubError(
                    self.hub_id,
                    response.status_code,
                    body.decode("utf-8", errors="replace")[:1000],
                )
            return SkillArchive(
                "zip",
                self._drain(stack, response, chunk_size),
            )
        except BaseException:
            await stack.aclose()
            raise

    async def publish(
        self,
        user_id: str,
        archive_path: str,
        namespace: str,
        visibility: str = "PUBLIC",
    ) -> SkillPublishResult:
        """Publish a ZIP through SkillHub's authenticated CLI API."""
        connection = await self._connection(user_id)
        import pathlib

        path = pathlib.Path(archive_path)
        try:
            with path.open("rb") as archive:  # noqa: ASYNC230
                headers = self._headers(connection)
                headers.update(await self._csrf_headers(connection))
                response = await self._http().post(
                    f"{connection.base_url}/api/cli/v1/skills/"
                    f"{quote(namespace, safe='')}/publish",
                    headers=headers,
                    data={"visibility": visibility},
                    files={
                        "file": (
                            path.name,
                            archive,
                            "application/zip",
                        ),
                    },
                )
        except OSError as exc:
            raise HubError(
                self.hub_id,
                500,
                "Skill archive is unavailable.",
            ) from exc
        if response.status_code >= 400:
            raise HubError(
                self.hub_id,
                response.status_code,
                self._error_message(response),
            )
        payload = response.json()
        result = payload.get("data") if isinstance(payload, dict) else None
        if not isinstance(result, dict):
            result = payload if isinstance(payload, dict) else {}
        return SkillPublishResult(
            namespace=str(result.get("namespace") or namespace),
            slug=str(result.get("slug") or path.stem.removesuffix(".zip")),
            version=(
                str(result["version"])
                if result.get("version") is not None
                else None
            ),
            visibility=(
                str(result["visibility"])
                if result.get("visibility") is not None
                else visibility
            ),
        )

    @staticmethod
    async def _drain(
        stack: AsyncExitStack,
        response: "httpx.Response",
        chunk_size: int,
    ) -> AsyncIterator[bytes]:
        try:
            async for chunk in response.aiter_bytes(chunk_size):
                yield chunk
        finally:
            await stack.aclose()
