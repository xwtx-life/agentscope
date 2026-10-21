import { client } from './client';
import type { ModelCard } from './types';

export interface CustomModelCard extends ModelCard {
	custom?: boolean;
}

export const customModelsApi = {
	list: (credentialId: string) =>
		client.get<CustomModelCard[]>(`/custom-models/${credentialId}`),

	add: (
		credentialId: string,
		body: {
			name: string;
			label?: string | null;
			context_size?: number;
			output_size?: number;
		},
	) => client.post<CustomModelCard>(`/custom-models/${credentialId}`, body),

	remove: (credentialId: string, modelName: string) =>
		client.delete(`/custom-models/${credentialId}/${encodeURIComponent(modelName)}`),
};
