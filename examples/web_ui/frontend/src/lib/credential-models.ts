import type { CredentialView } from '@/api';

/**
 * OpenAI credentials pointed at a non-OpenAI base URL (SiliconFlow, NewAPI,
 * …) should not show the built-in GPT catalogue — those ids are wrong for
 * the gateway. The UI starts empty; the user adds real model ids manually.
 */
export function credentialUsesManualModels(credential: CredentialView): boolean {
	const type = credential.data.type as string | undefined;
	if (type !== 'openai_credential') return false;
	const baseUrl = String(credential.data.base_url ?? '')
		.trim()
		.toLowerCase();
	if (!baseUrl) return false;
	return !baseUrl.includes('api.openai.com');
}
