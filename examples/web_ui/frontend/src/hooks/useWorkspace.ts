import { useState, useEffect, useCallback } from 'react';

import { workspaceApi } from '@/api';
import type { MCPClient, MCPClientStatus, Skill } from '@/api';
import type { UploadOptions } from '@/api/workspace';

export function useWorkspace(agentId: string | null, sessionId: string | null) {
	const [mcps, setMcps] = useState<MCPClientStatus[]>([]);
	const [skills, setSkills] = useState<Skill[]>([]);
	const [loading, setLoading] = useState(false);
	const [skillsLoading, setSkillsLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);

	const refetch = useCallback(async () => {
		// MCP disabled for this deployment — do not hit /workspace/mcp.
		setMcps([]);
		setLoading(false);
		setError(null);
	}, []);

	const refetchSkills = useCallback(async () => {
		if (!agentId || !sessionId) {
			setSkills([]);
			return;
		}
		setSkillsLoading(true);
		try {
			setSkills(await workspaceApi.skill.list(agentId, sessionId));
		} catch (e) {
			setError(e as Error);
		} finally {
			setSkillsLoading(false);
		}
	}, [agentId, sessionId]);

	useEffect(() => {
		refetch();
	}, [refetch]);
	useEffect(() => {
		refetchSkills();
	}, [refetchSkills]);

	const addMcps = useCallback(async (_clients: MCPClient[]) => {
		throw new Error('MCP is disabled on this deployment.');
	}, []);

	const addMcpsFromLibrary = useCallback(async (_mcpIds: string[]) => {
		throw new Error('MCP is disabled on this deployment.');
	}, []);

	const removeMcp = useCallback(async (_mcpName: string) => {
		throw new Error('MCP is disabled on this deployment.');
	}, []);

	const uploadSkill = useCallback(
		async (files: File[], options: UploadOptions = {}) => {
			if (!agentId || !sessionId) throw new Error('No agent/session selected');
			await workspaceApi.skill.upload(agentId, sessionId, files, options);
			await refetchSkills();
		},
		[agentId, sessionId, refetchSkills],
	);

	const addSkillsFromLibrary = useCallback(
		async (skillIds: string[]) => {
			if (!agentId || !sessionId) throw new Error('No agent/session selected');
			const result = await workspaceApi.skill.addFromLibrary(agentId, sessionId, skillIds);
			await refetchSkills();
			// Reported per skill, so a partial success is still a success
			// for what landed; surface only what did not.
			const failures = Object.entries(result.failed);
			if (failures.length > 0) {
				throw new Error(failures.map(([name, why]) => `${name}: ${why}`).join('\n'));
			}
		},
		[agentId, sessionId, refetchSkills],
	);

	const removeSkill = useCallback(
		async (skillName: string) => {
			if (!agentId || !sessionId) throw new Error('No agent/session selected');
			await workspaceApi.skill.remove(skillName, agentId, sessionId);
			await refetchSkills();
		},
		[agentId, sessionId, refetchSkills],
	);

	return {
		mcps,
		loading,
		error,
		refetch,
		addMcps,
		addMcpsFromLibrary,
		removeMcp,
		skills,
		skillsLoading,
		uploadSkill,
		addSkillsFromLibrary,
		removeSkill,
	};
}
