import { client } from './client';

export interface SkillHubSettings {
	base_url: string;
	token_configured: boolean;
}

export const skillhubSettingsApi = {
	get: () => client.get<SkillHubSettings>('/skillhub/settings'),

	update: (body: { base_url: string; token?: string | null }) =>
		client.put<SkillHubSettings>('/skillhub/settings', body),
};
