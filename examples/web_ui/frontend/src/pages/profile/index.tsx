import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { authApi, type AuthUser } from '@/api';
import { Avatar, AvatarFallback } from '@/components/ui/avatar.tsx';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card.tsx';
import { useTranslation } from '@/i18n/useI18n.ts';
import { avatarTint } from '@/utils/common';

function initials(label: string): string {
	const trimmed = label.trim();
	if (!trimmed) return '?';
	return trimmed.slice(0, 2).toUpperCase();
}

function userLabel(user: AuthUser): string {
	return user.email || user.username;
}

export function ProfilePage() {
	const { t } = useTranslation();
	const [user, setUser] = useState<AuthUser | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			setLoading(true);
			try {
				const me = await authApi.me();
				if (!cancelled) setUser(me);
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
	}, [t]);

	if (loading) {
		return (
			<div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
				<Loader2 className="size-4 animate-spin" />
				{t('common.loading')}
			</div>
		);
	}

	if (!user) {
		return (
			<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
				{t('common.noData')}
			</div>
		);
	}

	const roleLabel =
		user.role === 'admin' ? t('admin.roleAdmin') : t('admin.roleUser');

	return (
		<div className="flex h-full flex-col gap-6 overflow-auto p-6">
			<div>
				<h1 className="text-xl font-semibold">{t('profile.title')}</h1>
				<p className="text-sm text-muted-foreground">{t('profile.description')}</p>
			</div>

			<Card className="max-w-lg">
				<CardHeader className="flex flex-row items-center gap-4 space-y-0">
					<Avatar className="size-14">
						<AvatarFallback
							className="text-base font-medium"
							style={avatarTint(userLabel(user))}
						>
							{initials(userLabel(user))}
						</AvatarFallback>
					</Avatar>
					<div className="min-w-0">
						<CardTitle className="truncate">
							{user.display_name || userLabel(user)}
						</CardTitle>
						<CardDescription>{roleLabel}</CardDescription>
					</div>
				</CardHeader>
				<CardContent className="space-y-3 text-sm">
					<div className="flex justify-between gap-4 border-b border-border py-2">
						<span className="text-muted-foreground">{t('auth.email')}</span>
						<span className="truncate font-medium">{userLabel(user)}</span>
					</div>
					<div className="flex justify-between gap-4 border-b border-border py-2">
						<span className="text-muted-foreground">{t('admin.role')}</span>
						<span className="font-medium">{roleLabel}</span>
					</div>
					<div className="flex justify-between gap-4 py-2">
						<span className="text-muted-foreground">{t('auth.organization')}</span>
						<span className="truncate font-medium">
							{user.tenant_name ||
								user.department_name ||
								t('auth.noOrganization')}
						</span>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
