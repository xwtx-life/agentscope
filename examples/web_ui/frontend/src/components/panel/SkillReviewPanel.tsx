import { Check, ShieldCheck, TriangleAlert, X } from 'lucide-react';
import { Fragment, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { skillSubmissionApi } from '@/api';
import type { SkillSubmission, SkillSubmissionStatus } from '@/api';
import { ApiError } from '@/api/client';
import { Alert, AlertDescription } from '@/components/ui/alert.tsx';
import { Badge } from '@/components/ui/badge.tsx';
import { Button } from '@/components/ui/button.tsx';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog.tsx';
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from '@/components/ui/empty.tsx';
import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemSeparator,
	ItemTitle,
} from '@/components/ui/item.tsx';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select.tsx';
import { Spinner } from '@/components/ui/spinner.tsx';
import { Textarea } from '@/components/ui/textarea.tsx';
import { useTranslation } from '@/i18n/useI18n';

const statusVariant = (status: SkillSubmissionStatus) =>
	status === 'published'
		? 'default'
		: status === 'rejected' || status === 'scan_failed' || status === 'publish_failed'
			? 'destructive'
			: 'secondary';

/** Statuses an administrator can act on directly from the queue. */
const actionable = (status: SkillSubmissionStatus) =>
	status === 'pending_approval' || status === 'publish_failed';

const FILTERS: Array<{ value: string; status: SkillSubmissionStatus | null }> = [
	{ value: 'all', status: null },
	{ value: 'pending_approval', status: 'pending_approval' },
	{ value: 'scanning', status: 'scanning' },
	{ value: 'scan_failed', status: 'scan_failed' },
	{ value: 'rejected', status: 'rejected' },
	{ value: 'approved', status: 'approved' },
	{ value: 'publishing', status: 'publishing' },
	{ value: 'publish_failed', status: 'publish_failed' },
	{ value: 'published', status: 'published' },
];

/**
 * The administrator-facing half of the skill pipeline: a status-filtered
 * queue over every tenant submission, with scan verdicts surfaced and
 * approve / reject (with a reason) actions. Submitters never see this.
 */
export function SkillReviewPanel() {
	const { t } = useTranslation();
	const [filter, setFilter] = useState('all');
	const [submissions, setSubmissions] = useState<SkillSubmission[]>([]);
	const [loading, setLoading] = useState(true);
	const [busyId, setBusyId] = useState<string | null>(null);
	const [error, setError] = useState('');
	// The rejection reason dialog, anchored to the submission under review.
	const [rejecting, setRejecting] = useState<SkillSubmission | null>(null);
	const [reason, setReason] = useState('');
	const [rejectError, setRejectError] = useState('');

	const activeFilter = FILTERS.find((entry) => entry.value === filter) ?? FILTERS[0];

	const reload = useCallback(async () => {
		setLoading(true);
		try {
			setSubmissions(
				(await skillSubmissionApi.list(activeFilter.status ?? undefined)).submissions,
			);
			setError('');
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : t('skill.review.loadFailed'));
		} finally {
			setLoading(false);
		}
	}, [activeFilter.status, t]);

	useEffect(() => {
		void reload();
	}, [reload]);

	const approve = async (submission: SkillSubmission) => {
		setBusyId(submission.id);
		try {
			await skillSubmissionApi.approve(submission.id);
			toast.success(t('skill.review.approveSuccess'));
			await reload();
		} catch (caught) {
			setError(caught instanceof ApiError ? caught.detail : t('skill.review.approveFailed'));
		} finally {
			setBusyId(null);
		}
	};

	const submitRejection = async () => {
		if (!rejecting) return;
		const trimmed = reason.trim();
		if (!trimmed) {
			setRejectError(t('skill.review.rejectReasonRequired'));
			return;
		}
		setBusyId(rejecting.id);
		setRejectError('');
		try {
			await skillSubmissionApi.reject(rejecting.id, trimmed);
			toast.success(t('skill.review.rejectSuccess'));
			setRejecting(null);
			setReason('');
			await reload();
		} catch (caught) {
			setRejectError(
				caught instanceof ApiError ? caught.detail : t('skill.review.rejectFailed'),
			);
		} finally {
			setBusyId(null);
		}
	};

	return (
		<div className="flex h-full flex-col">
			{/* Fixed header: filter stays put while the queue scrolls. */}
			<div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-6 pt-6">
				<div className="flex items-center gap-2">
					<ShieldCheck className="size-4 text-muted-foreground" />
					<div>
						<div className="font-medium text-lg">{t('skill.review.title')}</div>
						<p className="text-xs text-muted-foreground">{t('skill.review.description')}</p>
					</div>
				</div>
				<Select value={filter} onValueChange={setFilter}>
					<SelectTrigger size="sm" className="w-40">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{FILTERS.map((entry) => (
							<SelectItem key={entry.value} value={entry.value}>
								{entry.status
									? t(`skill.submission.status.${entry.status}`)
									: t('skill.review.filterAll')}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<div className="flex-1 min-h-0 overflow-y-auto scroll-fade px-6 pb-6 pt-4">
				{error && (
					<Alert variant="destructive" className="mb-3">
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}

				{loading ? (
					<div className="flex justify-center py-10">
						<Spinner />
					</div>
				) : submissions.length === 0 ? (
					<Empty className="border-none py-10">
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<ShieldCheck />
							</EmptyMedia>
							<EmptyTitle>{t('skill.review.empty')}</EmptyTitle>
							<EmptyDescription>{t('skill.review.description')}</EmptyDescription>
						</EmptyHeader>
					</Empty>
				) : (
				<ItemGroup className="gap-0">
					{submissions.map((submission, index) => (
						<Fragment key={submission.id}>
							{index > 0 && <ItemSeparator />}
							<Item variant="muted">
								<ItemContent>
									<ItemTitle>
										<span>{submission.display_name || submission.name}</span>
										<Badge variant={statusVariant(submission.status)}>
											{t(`skill.submission.status.${submission.status}`)}
										</Badge>
									</ItemTitle>
									<ItemDescription className="flex flex-wrap items-center gap-x-2">
										<span>
											{t('skill.review.submitter')}：{submission.submitted_by}
										</span>
										<span>
											{submission.version || t('skill.submission.versionPending')}
										</span>
										<span>{new Date(submission.created_at).toLocaleString()}</span>
										{submission.approved_by && (
											<span>
												{t('skill.review.reviewer')}：{submission.approved_by}
											</span>
										)}
										{submission.reviewed_at && (
											<span>
												{t('skill.review.reviewedAt')}：
												{new Date(submission.reviewed_at).toLocaleString()}
											</span>
										)}
									</ItemDescription>

									{/* Scan verdict: failed findings are the one thing an
									    approver must read before acting. */}
									{submission.scan_status === 'failed' && (
										<div className="mt-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
											<div className="flex items-center gap-1.5 text-xs font-medium text-destructive">
												<TriangleAlert className="size-3.5" />
												{t('skill.review.scanFailed')}
											</div>
											<ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
												{submission.scan_findings.map((finding) => (
													<li key={finding}>{finding}</li>
												))}
											</ul>
										</div>
									)}
									{submission.scan_status === 'passed' && (
										<p className="mt-1 text-xs text-muted-foreground">
											{t('skill.review.scanPassed')}
										</p>
									)}

									{/* A failed publish keeps the record actionable with
									    its error visible, so retrying is informed. */}
									{submission.status === 'publish_failed' && submission.last_error && (
										<p className="mt-1 text-xs text-destructive">
											{t('skill.review.lastErrorLabel')}：{submission.last_error}
										</p>
									)}
									{submission.rejection_reason && (
										<p className="mt-1 text-xs text-muted-foreground">
											{t('skill.review.rejectionReasonLabel')}：{submission.rejection_reason}
										</p>
									)}
								</ItemContent>

								{actionable(submission.status) && (
									<ItemActions>
										<Button
											size="sm"
											onClick={() => void approve(submission)}
											disabled={busyId === submission.id}
										>
											{busyId === submission.id ? <Spinner /> : <Check />}
											{t('skill.review.approve')}
										</Button>
										<Button
											size="sm"
											variant="outline"
											onClick={() => {
												setReason('');
												setRejectError('');
												setRejecting(submission);
											}}
											disabled={busyId === submission.id}
										>
											<X />
											{t('skill.review.reject')}
										</Button>
									</ItemActions>
								)}
							</Item>
						</Fragment>
					))}
				</ItemGroup>
			)}
			</div>

			<Dialog open={rejecting !== null} onOpenChange={(open) => !open && setRejecting(null)}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>{t('skill.review.rejectDialogTitle')}</DialogTitle>
						<DialogDescription>
							{t('skill.review.rejectDialogDescription')}
						</DialogDescription>
					</DialogHeader>
					{rejectError && (
						<Alert variant="destructive">
							<AlertDescription>{rejectError}</AlertDescription>
						</Alert>
					)}
					<Textarea
						value={reason}
						onChange={(event) => setReason(event.target.value)}
						placeholder={t('skill.review.rejectReasonPlaceholder')}
						rows={4}
						autoFocus
					/>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setRejecting(null)}
							disabled={busyId !== null}
						>
							{t('common.cancel')}
						</Button>
						<Button
							variant="destructive"
							onClick={() => void submitRejection()}
							disabled={busyId !== null}
						>
							{busyId !== null ? <Spinner /> : <X />}
							{t('skill.review.reject')}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}