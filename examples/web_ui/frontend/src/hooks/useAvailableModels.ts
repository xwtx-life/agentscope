import { useQuery } from '@tanstack/react-query';

import { credentialApi, customModelsApi, modelApi } from '@/api';
import type { CredentialView, ModelCard } from '@/api';
import { credentialUsesManualModels } from '@/lib/credential-models';

export interface CredentialWithModels {
	credential: CredentialView;
	models: ModelCard[];
}

/**
 * Fetches all credentials and their available models, grouped by provider type.
 * Provider type is read from `credential.data.type`.
 * Credentials without a `type` field or whose model fetch fails are silently skipped.
 *
 * One credential list plus one model list per provider — the most expensive
 * fan-out on the page, and every model picker in the app mounts it. Cached
 * under a shared query key that credential mutations invalidate.
 *
 * OpenAI credentials with a custom base URL (SiliconFlow / NewAPI) only
 * expose user-added custom models — the built-in GPT catalogue is omitted.
 */
async function fetchGroups(): Promise<Record<string, CredentialWithModels[]>> {
	const { credentials } = await credentialApi.list();
	const result: Record<string, CredentialWithModels[]> = {};

	await Promise.all(
		credentials.map(async (credential) => {
			const type = credential.data.type as string | undefined;
			if (!type) return;
			if (!result[type]) result[type] = [];
			try {
				const manualOnly = credentialUsesManualModels(credential);
				const [builtinRes, custom] = await Promise.all([
					manualOnly
						? Promise.resolve({ models: [] as ModelCard[] })
						: modelApi.list(type),
					customModelsApi.list(credential.id).catch(() => [] as ModelCard[]),
				]);
				const builtin = builtinRes.models;
				const customNames = new Set(custom.map((m) => m.name));
				const merged = [
					...custom,
					...builtin.filter((m) => !customNames.has(m.name)),
				].sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }));
				result[type].push({
					credential,
					models: merged,
				});
			} catch {
				result[type].push({ credential, models: [] });
			}
		}),
	);

	return result;
}

/**
 * Cache key for the grouped model list. Exported so a credential change —
 * which moves what these groups contain — can invalidate it.
 */
export const AVAILABLE_MODELS_KEY = ['available-models'];

export function useAvailableModels() {
	const { data, isPending, error } = useQuery({
		queryKey: AVAILABLE_MODELS_KEY,
		queryFn: fetchGroups,
	});

	return {
		groups: data ?? {},
		loading: isPending,
		error: error as Error | null,
	};
}
