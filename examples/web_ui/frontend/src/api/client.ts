import { toast } from 'sonner';

import { localizeApiDetail } from '@/lib/localize-api-detail';

export const getBaseUrl = () => localStorage.getItem('server_url') ?? '';
export const getAccessToken = () => localStorage.getItem('access_token') ?? '';
/** Display name cached after login — not used for auth. */
export const getUsername = () => localStorage.getItem('username') ?? '';

/**
 * Structured error thrown for non-2xx HTTP responses.
 * `message` contains the human-readable detail extracted from the backend.
 */
export class ApiError extends Error {
	readonly status: number;
	readonly detail: string;

	constructor(status: number, detail: string) {
		super(detail);
		this.name = 'ApiError';
		this.status = status;
		this.detail = detail;
	}
}

interface RequestOptions {
	method?: string;
	body?: unknown;
	params?: Record<string, string>;
	/** When true, suppresses the automatic error toast. Useful when the caller shows its own inline error UI. */
	silent?: boolean;
	signal?: AbortSignal;
	/** Overrides the stored server URL. Lets the setup page probe an address before persisting it. */
	baseUrl?: string;
	/** Overrides the stored Bearer token (e.g. right after login before persist). */
	token?: string;
	/** When true, do not send Authorization (public endpoints). */
	anonymous?: boolean;
	/** Gives up after this many ms and reports {@link TIMEOUT_STATUS}. Off by default — a streaming chat is meant to stay open. */
	timeoutMs?: number;
}

/** Reported when `timeoutMs` elapses. Real 408s come from a server, so either way the request did not complete in time. */
export const TIMEOUT_STATUS = 408;

function buildHeaders(
	hasBody: boolean,
	options: { token?: string; anonymous?: boolean } = {},
): Record<string, string> {
	const headers: Record<string, string> = {};
	if (hasBody) headers['Content-Type'] = 'application/json';
	if (!options.anonymous) {
		const token = options.token ?? getAccessToken();
		if (token) headers['Authorization'] = `Bearer ${token}`;
	}
	return headers;
}

/** Parse the response body and extract the `detail` field if the backend returned JSON. */
async function extractErrorDetail(res: Response): Promise<string> {
	const text = await res.text();
	try {
		const json = JSON.parse(text) as { detail?: unknown };
		if (typeof json.detail === 'string') return json.detail;
		if (json.detail !== undefined) return JSON.stringify(json.detail);
	} catch {
		// not JSON – fall through
	}
	return text || res.statusText;
}

async function streamRequest(path: string, options: RequestOptions = {}): Promise<Response> {
	const {
		method = 'GET',
		body,
		params,
		signal,
		silent = false,
		baseUrl,
		token,
		anonymous,
		timeoutMs,
	} = options;
	const url = new URL(path, baseUrl ?? getBaseUrl());
	if (params) {
		Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
	}

	// AbortSignal.timeout aborts with a TimeoutError, which is what lets the
	// catch below tell "too slow" apart from the caller's own cancellation.
	const deadline = timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined;
	const combined =
		deadline && signal ? AbortSignal.any([signal, deadline]) : (deadline ?? signal);

	let res: Response;
	try {
		res = await fetch(url.toString(), {
			method,
			headers: buildHeaders(body !== undefined, { token, anonymous }),
			body: body ? JSON.stringify(body) : undefined,
			signal: combined,
		});
	} catch (e) {
		// An abort is the caller's own doing — pass it through untouched.
		if (e instanceof DOMException && e.name === 'AbortError') throw e;
		// A server that accepts the connection then stalls would otherwise
		// leave the caller waiting forever.
		const timedOut = e instanceof DOMException && e.name === 'TimeoutError';
		// Otherwise fetch only rejects when the request never reached the
		// server: wrong address, DNS failure, refused connection, blocked
		// preflight. Status 0 distinguishes that from any HTTP-level failure.
		const error = timedOut
			? new ApiError(TIMEOUT_STATUS, '服务器响应超时，请稍后重试。')
			: new ApiError(0, '无法连接服务器，请检查服务器地址与网络。');
		if (!silent) toast.error(error.detail);
		throw error;
	}

	if (!res.ok) {
		const detail = localizeApiDetail(await extractErrorDetail(res));
		const error = new ApiError(res.status, detail);
		if (!silent) toast.error(detail);
		throw error;
	}

	return res;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
	const res = await streamRequest(path, options);
	if (res.status === 204) return undefined as T;
	return res.json() as Promise<T>;
}

export const client = {
	get: <T>(
		path: string,
		params?: Record<string, string>,
		options?: {
			silent?: boolean;
			baseUrl?: string;
			token?: string;
			anonymous?: boolean;
			timeoutMs?: number;
		},
	) => request<T>(path, { method: 'GET', params, ...options }),
	post: <T>(
		path: string,
		body?: unknown,
		params?: Record<string, string>,
		options?: {
			silent?: boolean;
			signal?: AbortSignal;
			timeoutMs?: number;
			baseUrl?: string;
			token?: string;
			anonymous?: boolean;
		},
	) => request<T>(path, { method: 'POST', body, params, ...options }),
	put: <T>(
		path: string,
		body?: unknown,
		params?: Record<string, string>,
		options?: { silent?: boolean; baseUrl?: string; anonymous?: boolean },
	) => request<T>(path, { method: 'PUT', body, params, silent: options?.silent, ...options }),
	patch: <T>(
		path: string,
		body?: unknown,
		params?: Record<string, string>,
		options?: { silent?: boolean; baseUrl?: string; anonymous?: boolean },
	) => request<T>(path, { method: 'PATCH', body, params, silent: options?.silent, ...options }),
	delete: <T = void>(path: string, params?: Record<string, string>) =>
		request<T>(path, { method: 'DELETE', params }),
	stream: (path: string, options?: RequestOptions) => streamRequest(path, options),
};

/** Persist login session after a successful register / login. */
export function persistSession(accessToken: string, username: string) {
	localStorage.setItem('access_token', accessToken);
	localStorage.setItem('username', username);
}

/** Clear auth session (keeps server_url). */
export function clearSession() {
	localStorage.removeItem('access_token');
	localStorage.removeItem('user_id');
	localStorage.removeItem('username');
	localStorage.removeItem('user_role');
	localStorage.removeItem('department_name');
}

export function isLoggedIn() {
	return !!getAccessToken() && !!getBaseUrl();
}
