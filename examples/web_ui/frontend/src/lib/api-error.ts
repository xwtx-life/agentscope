import { ApiError } from '@/api/client';
import { localizeApiDetail } from '@/lib/localize-api-detail';

export { localizeApiDetail } from '@/lib/localize-api-detail';

/**
 * FastAPI 422 responses put a pydantic ``.errors()`` array in ``detail``.
 * `client.ts` stringifies that array, so what we get here is a JSON string
 * like ``[{"type":"value_error","loc":[...],"msg":"..."}]``. Show only the
 * ``msg`` fields — that's the human-readable part; ``type`` / ``loc`` /
 * ``input`` are noise for end users.
 */
export function formatApiErrorForAlert(err: unknown): string {
	if (err instanceof ApiError) {
		const { detail } = err;
		try {
			const parsed = JSON.parse(detail) as unknown;
			if (Array.isArray(parsed)) {
				const msgs = parsed
					.map((item) =>
						item && typeof item === 'object' && 'msg' in item
							? localizeApiDetail(String((item as { msg: unknown }).msg))
							: null,
					)
					.filter((m): m is string => !!m);
				if (msgs.length > 0) return msgs.join('\n');
			}
		} catch {
			// not JSON — fall through to raw detail
		}
		return localizeApiDetail(detail);
	}
	if (err instanceof Error) return localizeApiDetail(err.message);
	return localizeApiDetail(String(err));
}
