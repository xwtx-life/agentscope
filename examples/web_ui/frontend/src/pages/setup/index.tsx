import { CircleAlert, Loader2 } from 'lucide-react';
import { useState } from 'react';

import { healthApi } from '@/api';
import { ApiError, TIMEOUT_STATUS } from '@/api/client.ts';
import type { HealthResponse } from '@/api/types.ts';
import { Alert, AlertDescription } from '@/components/ui/alert.tsx';
import { Button } from '@/components/ui/button.tsx';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card.tsx';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field.tsx';
import { Input } from '@/components/ui/input.tsx';
import { useTranslation } from '@/i18n/useI18n.ts';
import { formatApiErrorForAlert } from '@/lib/api-error.ts';
import { cn } from '@/lib/utils.ts';

interface Props {
	onComplete: () => void;
	className?: string;
}

/** Pull the failing subsystem names out of a 503 body, if it is a health report. */
function notReadyComponents(detail: string): string {
	try {
		const body = JSON.parse(detail) as HealthResponse;
		return Object.entries(body.components ?? {})
			.filter(([, status]) => status === 'not_ready')
			.map(([name]) => name)
			.join(', ');
	} catch {
		return '';
	}
}

export const SetupPage = ({ onComplete, className }: Props) => {
	const { t } = useTranslation();
	const [url, setUrl] = useState(() => localStorage.getItem('server_url') ?? '');
	const [checking, setChecking] = useState(false);
	const [errorMsg, setErrorMsg] = useState('');

	const describeFailure = (e: unknown): string => {
		if (e instanceof ApiError) {
			if (e.status === 0) return t('setup.errorUnreachable');
			if (e.status === TIMEOUT_STATUS) return t('setup.errorTimeout');
			if (e.status === 404) return t('setup.errorNotAgentScope');
			if (e.status === 503) {
				const down = notReadyComponents(e.detail);
				return down ? `${t('setup.errorNotReady')}\n${down}` : t('setup.errorNotReady');
			}
		}
		if (e instanceof SyntaxError) return t('setup.errorNotAgentScope');
		return formatApiErrorForAlert(e);
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		const trimmedUrl = url.trim().replace(/\/+$/, '');

		setChecking(true);
		setErrorMsg('');
		try {
			const health = (await healthApi.check(trimmedUrl)) as Partial<HealthResponse>;
			if (typeof health.version !== 'string' || !health.components) {
				setErrorMsg(t('setup.errorNotAgentScope'));
				return;
			}
			localStorage.setItem('server_url', trimmedUrl);
			onComplete();
		} catch (err) {
			setErrorMsg(describeFailure(err));
		} finally {
			setChecking(false);
		}
	};

	return (
		<div className="flex items-center justify-center h-full">
			<div className={cn('flex flex-col gap-6 w-full max-w-sm', className)}>
				<Card>
					<CardHeader>
						<CardTitle>{t('setup.title')}</CardTitle>
						<CardDescription>{t('setup.description')}</CardDescription>
					</CardHeader>
					<CardContent>
						<form onSubmit={handleSubmit}>
							<FieldGroup>
								<Field>
									<FieldLabel htmlFor="server-url-input">
										{t('setup.serverUrl')}
									</FieldLabel>
									<Input
										id="server-url-input"
										type="url"
										placeholder={t('setup.serverUrlPlaceholder')}
										value={url}
										onChange={(e) => setUrl(e.target.value)}
										required
									/>
								</Field>
								{errorMsg && (
									<Alert variant="destructive">
										<CircleAlert />
										<AlertDescription className="whitespace-pre-wrap">
											{errorMsg}
										</AlertDescription>
									</Alert>
								)}
								<Field>
									<Button type="submit" className="w-full" disabled={checking}>
										{checking && <Loader2 className="size-3.5 animate-spin" />}
										{checking ? t('setup.checking') : t('setup.submit')}
									</Button>
								</Field>
							</FieldGroup>
						</form>
					</CardContent>
				</Card>
				<FieldDescription className="px-6 text-center">{t('setup.hint')}</FieldDescription>
			</div>
		</div>
	);
};
