import { CircleAlert, Loader2, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { AgentView, ContextConfig, InviteConfig, ReActConfig } from '@/api';
import {
	AgentFormFields,
	defaultAgentFormValues,
	type AgentFormValues,
	type AgentSection,
} from '@/components/form/AgentFormFields';
import type { SchemaFormValue } from '@/components/form/SchemaForm';
import { Alert, AlertDescription } from '@/components/ui/alert.tsx';
import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from '@/components/ui/dialog';
import { useAgents } from '@/hooks/useAgents';
import { useAgentSchema } from '@/hooks/useAgentSchema';
import { formatApiErrorForAlert } from '@/lib/api-error';

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	agent: AgentView;
	onUpdated?: () => void;
}

export function EditAgentDialog({ open, onOpenChange, agent, onUpdated }: Props) {
	const { update } = useAgents();
	const { t } = useTranslation();
	const { schema } = useAgentSchema();
	const [submitting, setSubmitting] = useState(false);
	const [values, setValues] = useState<AgentFormValues | null>(null);
	const [errorMsg, setErrorMsg] = useState('');

	// Shared agents are usable but not editable — never open the form.
	useEffect(() => {
		if (open && !agent.editable) {
			onOpenChange(false);
		}
	}, [open, agent.editable, onOpenChange]);

	useEffect(() => {
		if (!open || !schema) {
			if (!open) {
				setValues(null);
				setErrorMsg('');
			}
			return;
		}
		// Start from schema defaults, then overlay the existing agent's data so
		// any unset fields fall back to defaults rather than empty.
		const base = defaultAgentFormValues(schema);
		const d = agent.data;
		const systemPrompt =
			d.system_prompt === "You're a helpful assistant."
				? '你是一个有帮助的助手。'
				: d.system_prompt;
		const react = { ...base.react_config, ...d.chat_config.react_config };
		if (
			react.interruption_message ===
			'I notice the interruption. How can I help you?'
		) {
			react.interruption_message = '我注意到你已中断。还有什么可以帮你的吗？';
		}
		setValues({
			identity: {
				...base.identity,
				name: d.name,
				system_prompt: systemPrompt,
			},
			context_config: { ...base.context_config, ...d.chat_config.context_config },
			react_config: react,
			invite_config: { ...base.invite_config, ...d.chat_config.invite_config },
		});
		setErrorMsg('');
	}, [open, schema, agent]);

	const handleChange = (section: AgentSection, key: string, value: SchemaFormValue) => {
		setErrorMsg('');
		setValues((prev) =>
			prev ? { ...prev, [section]: { ...prev[section], [key]: value } } : prev,
		);
	};

	const handleSubmit = async () => {
		if (!values) return;
		const name = (values.identity.name as string | undefined)?.trim();
		if (!name) return;
		setErrorMsg('');
		setSubmitting(true);
		try {
			await update(
				agent.id,
				{
					name,
					system_prompt: values.identity.system_prompt as string | undefined,
					chat_config: {
						context_config: values.context_config as unknown as ContextConfig,
						react_config: values.react_config as unknown as ReActConfig,
						invite_config: values.invite_config as unknown as InviteConfig,
					},
				},
				{ silent: true },
			);
			onOpenChange(false);
			onUpdated?.();
		} catch (e) {
			setErrorMsg(formatApiErrorForAlert(e));
		} finally {
			setSubmitting(false);
		}
	};

	const nameValid = !!(values?.identity.name as string | undefined)?.trim();

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="!w-[500px] !max-w-[500px]">
				<DialogHeader>
					<DialogTitle>{t('dialog-agent-edit.title')}</DialogTitle>
					<DialogDescription className="sr-only">
						{t('dialog-agent-edit.description')}
					</DialogDescription>
				</DialogHeader>
				<div className="no-scrollbar -mx-4 max-h-[75vh] overflow-y-auto px-4">
					{schema && values ? (
						<AgentFormFields schema={schema} values={values} onChange={handleChange} />
					) : (
						<p className="text-muted-foreground text-sm">{t('common.loading')}</p>
					)}
				</div>
				{errorMsg && (
					<Alert variant="destructive">
						<CircleAlert />
						<AlertDescription className="whitespace-pre-wrap">
							{errorMsg}
						</AlertDescription>
					</Alert>
				)}
				<DialogFooter>
					<Button
						variant="ghost"
						onClick={() => onOpenChange(false)}
						disabled={submitting}
					>
						<CircleAlert className="size-3.5" />
						{t('common.cancel')}
					</Button>
					<Button
						onClick={handleSubmit}
						disabled={!nameValid || submitting || !schema || !values}
					>
						{submitting ? (
							<Loader2 className="size-3.5 animate-spin" />
						) : (
							<Save className="size-3.5" />
						)}
						{submitting ? t('common.saving') : t('common.save')}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
