import { CircleAlert, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { authApi } from '@/api';
import { ApiError } from '@/api/client.ts';
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

export const RegisterPage = ({ onComplete, className }: Props) => {
	const { t } = useTranslation();
	const [email, setEmail] = useState('');
	const [displayName, setDisplayName] = useState('');
	const [password, setPassword] = useState('');
	const [confirm, setConfirm] = useState('');
	const [tenantName, setTenantName] = useState('');
	const [busy, setBusy] = useState(false);
	const [errorMsg, setErrorMsg] = useState('');

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (password !== confirm) {
			setErrorMsg(t('auth.passwordMismatch'));
			return;
		}
		if (password.length < 6) {
			setErrorMsg(t('auth.passwordTooShort'));
			return;
		}
		const org = tenantName.trim();
		if (!org) {
			setErrorMsg(t('auth.organizationRequired'));
			return;
		}
		setBusy(true);
		setErrorMsg('');
		try {
			await authApi.register({
				email: email.trim(),
				password,
				display_name: displayName.trim(),
				tenant_name: org,
			});
			onComplete();
		} catch (err) {
			if (err instanceof ApiError) {
				setErrorMsg(err.detail || t('auth.registerFailed'));
			} else {
				setErrorMsg(formatApiErrorForAlert(err));
			}
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="flex items-center justify-center h-full">
			<div className={cn('flex flex-col gap-6 w-full max-w-sm', className)}>
				<Card>
					<CardHeader>
						<CardTitle>{t('auth.registerTitle')}</CardTitle>
						<CardDescription>{t('auth.registerDescription')}</CardDescription>
					</CardHeader>
					<CardContent>
						<form onSubmit={handleSubmit}>
							<FieldGroup>
								<Field>
									<FieldLabel htmlFor="reg-email">{t('auth.email')}</FieldLabel>
									<Input
										id="reg-email"
										type="email"
										value={email}
										onChange={(e) => setEmail(e.target.value)}
										placeholder={t('auth.emailPlaceholder')}
										autoComplete="email"
										required
									/>
									<FieldDescription>{t('auth.emailHint')}</FieldDescription>
								</Field>
								<Field>
									<FieldLabel htmlFor="reg-display">{t('auth.displayName')}</FieldLabel>
									<Input
										id="reg-display"
										value={displayName}
										onChange={(e) => setDisplayName(e.target.value)}
										placeholder={t('auth.displayNamePlaceholder')}
										autoComplete="nickname"
									/>
								</Field>
								<Field>
									<FieldLabel htmlFor="reg-password">{t('auth.password')}</FieldLabel>
									<Input
										id="reg-password"
										type="password"
										value={password}
										onChange={(e) => setPassword(e.target.value)}
										autoComplete="new-password"
										required
									/>
								</Field>
								<Field>
									<FieldLabel htmlFor="reg-confirm">{t('auth.confirmPassword')}</FieldLabel>
									<Input
										id="reg-confirm"
										type="password"
										value={confirm}
										onChange={(e) => setConfirm(e.target.value)}
										autoComplete="new-password"
										required
									/>
								</Field>
								<Field>
									<FieldLabel htmlFor="reg-org">{t('auth.organization')}</FieldLabel>
									<Input
										id="reg-org"
										value={tenantName}
										onChange={(e) => setTenantName(e.target.value)}
										placeholder={t('auth.organizationPlaceholder')}
										required
									/>
									<FieldDescription>{t('auth.organizationHint')}</FieldDescription>
								</Field>
								{errorMsg && (
									<Alert variant="destructive">
										<CircleAlert />
										<AlertDescription>{errorMsg}</AlertDescription>
									</Alert>
								)}
								<Field>
									<Button type="submit" className="w-full" disabled={busy}>
										{busy && <Loader2 className="size-3.5 animate-spin" />}
										{busy ? t('auth.registering') : t('auth.register')}
									</Button>
								</Field>
							</FieldGroup>
						</form>
					</CardContent>
				</Card>
				<FieldDescription className="px-6 text-center">
					{t('auth.hasAccount')}{' '}
					<Link to="/login" className="underline underline-offset-4">
						{t('auth.login')}
					</Link>
				</FieldDescription>
			</div>
		</div>
	);
};
