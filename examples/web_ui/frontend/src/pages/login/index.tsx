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

export const LoginPage = ({ onComplete, className }: Props) => {
	const { t } = useTranslation();
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [busy, setBusy] = useState(false);
	const [errorMsg, setErrorMsg] = useState('');

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setBusy(true);
		setErrorMsg('');
		try {
			await authApi.login({ email: email.trim(), password });
			onComplete();
		} catch (err) {
			if (err instanceof ApiError) {
				setErrorMsg(err.detail || t('auth.loginFailed'));
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
						<CardTitle>{t('auth.loginTitle')}</CardTitle>
						<CardDescription>{t('auth.loginDescription')}</CardDescription>
					</CardHeader>
					<CardContent>
						<form onSubmit={handleSubmit}>
							<FieldGroup>
								<Field>
									<FieldLabel htmlFor="login-email">{t('auth.email')}</FieldLabel>
									<Input
										id="login-email"
										type="email"
										value={email}
										onChange={(e) => setEmail(e.target.value)}
										placeholder={t('auth.emailPlaceholder')}
										autoComplete="email"
										required
									/>
								</Field>
								<Field>
									<FieldLabel htmlFor="login-password">{t('auth.password')}</FieldLabel>
									<Input
										id="login-password"
										type="password"
										value={password}
										onChange={(e) => setPassword(e.target.value)}
										autoComplete="current-password"
										required
									/>
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
										{busy ? t('auth.loggingIn') : t('auth.login')}
									</Button>
								</Field>
							</FieldGroup>
						</form>
					</CardContent>
				</Card>
				<FieldDescription className="px-6 text-center">
					{t('auth.noAccount')}{' '}
					<Link to="/register" className="underline underline-offset-4">
						{t('auth.register')}
					</Link>
					{' · '}
					<Link to="/setup" className="underline underline-offset-4">
						{t('auth.changeServer')}
					</Link>
				</FieldDescription>
			</div>
		</div>
	);
};
