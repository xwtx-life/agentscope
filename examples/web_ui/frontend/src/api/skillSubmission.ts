import { ApiError, getAccessToken, getBaseUrl } from './client';
import type { SkillSubmission, SkillSubmissionListResponse } from './types';

function uploadRequest(files: File[]): Promise<SkillSubmission> {
	const form = new FormData();
	form.append(
		'manifest',
		JSON.stringify({
			entries: files.map((file) => ({
				path: file.webkitRelativePath || file.name,
				size: file.size,
			})),
		}),
	);
	for (const file of files) form.append('files', file);

	const token = getAccessToken();
	return fetch(new URL('/skill-submissions/upload', getBaseUrl()), {
		method: 'POST',
		headers: token ? { Authorization: `Bearer ${token}` } : {},
		body: form,
	}).then(async (response) => {
		if (!response.ok) {
			let detail = response.statusText;
			try {
				const payload = (await response.json()) as { detail?: unknown };
				if (typeof payload.detail === 'string') detail = payload.detail;
			} catch {
				// Keep the HTTP status text when the server did not return JSON.
			}
			throw new ApiError(response.status, detail);
		}
		return (await response.json()) as SkillSubmission;
	});
}

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
	const token = getAccessToken();
	const response = await fetch(new URL(path, getBaseUrl()), {
		...init,
		headers: {
			...(init?.headers ?? {}),
			...(token ? { Authorization: `Bearer ${token}` } : {}),
		},
	});
	if (!response.ok) {
		let detail = response.statusText;
		try {
			const payload = (await response.json()) as { detail?: unknown };
			if (typeof payload.detail === 'string') detail = payload.detail;
		} catch {
			// keep status text
		}
		throw new ApiError(response.status, detail);
	}
	if (response.status === 204) return undefined as T;
	return (await response.json()) as T;
}

export const skillSubmissionApi = {
	submit: (files: File[]) => uploadRequest(files),
	list: (status?: string) => {
		const query = status ? `?status=${encodeURIComponent(status)}` : '';
		return jsonFetch<SkillSubmissionListResponse>(`/skill-submissions${query}`);
	},
	approve: (submissionId: string) =>
		jsonFetch<SkillSubmission>(
			`/skill-submissions/${encodeURIComponent(submissionId)}/approve`,
			{ method: 'POST' },
		),
	reject: (submissionId: string, reason: string) =>
		jsonFetch<SkillSubmission>(
			`/skill-submissions/${encodeURIComponent(submissionId)}/reject`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ reason }),
			},
		),
};
