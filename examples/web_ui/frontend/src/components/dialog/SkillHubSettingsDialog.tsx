import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { skillhubSettingsApi } from '@/api';
import { Button } from '@/components/ui/button.tsx';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog.tsx';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field.tsx';
import { Input } from '@/components/ui/input.tsx';
import { useTranslation } from '@/i18n/useI18n.ts';

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSaved?: () => void;
}

export function SkillHubSettingsDialog({ open, onOpenChange, onSaved }: Props) {
	const { t } = useTranslation();
	const isAdmin = localStorage.getItem('user_role') === 'admin';
	const [baseUrl, setBaseUrl] = useState('');
	const [token, setToken] = useState('');
	const [tokenConfigured, setTokenConfigured] = useState(false);
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		if (!open) return;
		let cancelled = false;
		void (async () => {
			setLoading(true);
			setToken('');
			try {
				const settings = await skillhubSettingsApi.get();
				if (!cancelled) {
					setBaseUrl(settings.base_url);
					setTokenConfigured(settings.token_configured);
				}
			} catch (e) {
				if (!cancelled) {
					toast.error(e instanceof Error ? e.message : t('common.error'));
				}
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [open, t]);

	const handleSave = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!isAdmin || !baseUrl.trim()) return;
		setSaving(true);
		try {
			const body: { base_url: string; token?: string } = {
				base_url: baseUrl.trim(),
			};
			if (token.trim()) {
				body.token = token.trim();
			}
			const saved = await skillhubSettingsApi.update(body);
			setTokenConfigured(saved.token_configured);
			setToken('');
			toast.success(t('skill.settingsSaved'));
			onSaved?.();
			onOpenChange(false);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : t('common.error'));
		} finally {
			setSaving(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="!w-[480px] !max-w-[480px]">
				<form onSubmit={(e) => void handleSave(e)}>
					<DialogHeader>
						<DialogTitle>{t('skill.settingsTitle')}</DialogTitle>
						<DialogDescription>{t('skill.settingsDescription')}</DialogDescription>
					</DialogHeader>
					{loading ? (
						<div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
							<Loader2 className="size-4 animate-spin" />
							{t('common.loading')}
						</div>
					) : (
						<FieldGroup className="gap-3 py-2">
							<Field>
								<FieldLabel htmlFor="skillhub-url">
									{t('skill.settingsUrl')}
								</FieldLabel>
								<Input
									id="skillhub-url"
									value={baseUrl}
									onChange={(e) => setBaseUrl(e.target.value)}
									placeholder="https://skillhub.example.com"
									required
									disabled={!isAdmin || saving}
									autoComplete="off"
								/>
								<FieldDescription>{t('skill.settingsUrlHint')}</FieldDescription>
							</Field>
							<Field>
								<FieldLabel htmlFor="skillhub-token">
									{t('skill.settingsToken')}
								</FieldLabel>
								<Input
									id="skillhub-token"
									type="password"
									value={token}
									onChange={(e) => setToken(e.target.value)}
									placeholder={
										tokenConfigured
											? t('skill.settingsTokenKeep')
											: t('skill.settingsTokenPlaceholder')
									}
									disabled={!isAdmin || saving}
									autoComplete="new-password"
								/>
								<FieldDescription>
									{tokenConfigured
										? t('skill.settingsTokenConfigured')
										: t('skill.settingsTokenHint')}
								</FieldDescription>
							</Field>
							{!isAdmin && (
								<p className="text-xs text-muted-foreground">
									{t('skill.settingsAdminOnly')}
								</p>
							)}
						</FieldGroup>
					)}
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
							disabled={saving}
						>
							{t('common.cancel')}
						</Button>
						{isAdmin && (
							<Button type="submit" disabled={loading || saving || !baseUrl.trim()}>
								{saving && <Loader2 className="size-3.5 animate-spin" />}
								{t('common.save')}
							</Button>
						)}
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
