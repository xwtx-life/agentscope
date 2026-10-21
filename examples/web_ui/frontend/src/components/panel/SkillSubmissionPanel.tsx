import { FolderUp } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { skillSubmissionApi } from '@/api';
import type { SkillSubmission, SkillSubmissionStatus } from '@/api';
import { ApiError } from '@/api/client';
import { Alert, AlertDescription } from '@/components/ui/alert.tsx';
import { Badge } from '@/components/ui/badge.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item.tsx';
import { Spinner } from '@/components/ui/spinner.tsx';
import { useTranslation } from '@/i18n/useI18n';

interface SkillSubmissionPanelProps {
	canSubmit: boolean;
}

const statusVariant = (status: SkillSubmissionStatus) =>
	status === 'published'
		? 'default'
		: status === 'rejected' || status === 'scan_failed' || status === 'publish_failed'
			? 'destructive'
			: 'secondary';

/**
 * The submitter-facing half of the skill pipeline: pick a folder off
 * disk, upload it for scanning, and watch the record progress through
 * scan / approval / publishing. Administration lives in SkillReviewPanel.
 */
export function SkillSubmissionPanel({ canSubmit }: SkillSubmissionPanelProps) {
	const { t } = useTranslation();
	const input = useRef<HTMLInputElement>(null);
	const [submissions, setSubmissions] = useState<SkillSubmission[]>([]);
	const [loading, setLoading] = useState(true);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');

	const reload = useCallback(async () => {
		setLoading(true);
		try {
			// The server trims the queue by role: members see their own
			// records, admins see the whole tenant queue.
			setSubmissions((await skillSubmissionApi.list()).submissions);
			setError('');
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : t('skill.submission.loadFailed'));
		} finally {
			setLoading(false);
		}
	}, [t]);

	useEffect(() => {
		void reload();
	}, [reload]);

	const submit = async (files: File[]) => {
		if (!files.length) return;
		setBusy(true);
		try {
			await skillSubmissionApi.submit(files);
			await reload();
		} catch (caught) {
			setError(caught instanceof ApiError ? caught.detail : t('skill.submission.uploadFailed'));
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="mb-4 rounded-lg border bg-muted/20 p-4">
			<div className="mb-3 flex flex-wrap items-center justify-between gap-2">
				<div>
					<div className="flex items-center gap-2 font-medium">
						<FolderUp className="size-4" />
						{t('skill.submission.title')}
					</div>
					<p className="text-xs text-muted-foreground">{t('skill.submission.description')}</p>
				</div>
				{canSubmit && (
					<>
						<input
							ref={input}
							type="file"
							className="hidden"
							{...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
							onChange={(event) => {
								void submit(Array.from(event.target.files ?? []));
								event.target.value = '';
							}}
						/>
						<Button size="sm" onClick={() => input.current?.click()} disabled={busy}>
							{busy ? <Spinner /> : <FolderUp />}
							{t('skill.submission.upload')}
						</Button>
					</>
				)}
			</div>

			{error && (
				<Alert variant="destructive" className="mb-3">
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}

			{loading ? (
				<div className="flex justify-center py-4">
					<Spinner />
				</div>
			) : submissions.length === 0 ? (
				<p className="text-sm text-muted-foreground">{t('skill.submission.empty')}</p>
			) : (
				<ItemGroup className="gap-1">
					{submissions.map((submission) => (
						<Item key={submission.id} variant="muted">
							<ItemContent>
								<ItemTitle>
									<span>{submission.display_name || submission.name}</span>
									<Badge variant={statusVariant(submission.status)}>
										{t(`skill.submission.status.${submission.status}`)}
									</Badge>
								</ItemTitle>
								<ItemDescription>
									{submission.version || t('skill.submission.versionPending')}
									{submission.rejection_reason ? ` · ${submission.rejection_reason}` : ''}
								</ItemDescription>
							</ItemContent>
						</Item>
					))}
				</ItemGroup>
			)}
		</div>
	);
}