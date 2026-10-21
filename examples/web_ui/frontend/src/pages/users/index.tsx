import { KeyRound, Loader2, Plus, Search, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';

import { authApi, departmentApi, type AuthUser, type Department } from '@/api';
import { Button } from '@/components/ui/button.tsx';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card.tsx';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog.tsx';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field.tsx';
import { Input } from '@/components/ui/input.tsx';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select.tsx';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table.tsx';
import { useTranslation } from '@/i18n/useI18n.ts';

const emptyUser = {
	email: '',
	display_name: '',
	password: '',
	role: 'user' as 'admin' | 'user',
	department_id: '',
};

const emptyFilter = {
	email: '',
	role: '__all__' as '__all__' | 'admin' | 'user',
	department_id: '__all__',
};

function userLabel(u: AuthUser) {
	return u.email || u.username;
}

export function UsersPage() {
	const { t } = useTranslation();
	const isAdmin = localStorage.getItem('user_role') === 'admin';
	const [users, setUsers] = useState<AuthUser[]>([]);
	const [departments, setDepartments] = useState<Department[]>([]);
	const [loading, setLoading] = useState(true);
	const [filter, setFilter] = useState(emptyFilter);
	const [appliedFilter, setAppliedFilter] = useState(emptyFilter);
	const [createOpen, setCreateOpen] = useState(false);
	const [newUser, setNewUser] = useState(emptyUser);
	const [passwordTarget, setPasswordTarget] = useState<AuthUser | null>(null);
	const [password, setPassword] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');
	const [saving, setSaving] = useState(false);

	const reload = useCallback(async () => {
		setLoading(true);
		try {
			const [u, d] = await Promise.all([authApi.listUsers(), departmentApi.list()]);
			setUsers(u);
			setDepartments(d);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : t('common.error'));
		} finally {
			setLoading(false);
		}
	}, [t]);

	useEffect(() => {
		if (isAdmin) void reload();
	}, [reload, isAdmin]);

	const filteredUsers = useMemo(() => {
		const keyword = appliedFilter.email.trim().toLowerCase();
		return users.filter((u) => {
			if (keyword && !userLabel(u).toLowerCase().includes(keyword)) return false;
			if (appliedFilter.role !== '__all__' && u.role !== appliedFilter.role) return false;
			if (appliedFilter.department_id === '__none__') {
				if (u.department_id) return false;
			} else if (
				appliedFilter.department_id !== '__all__' &&
				u.department_id !== appliedFilter.department_id
			) {
				return false;
			}
			return true;
		});
	}, [users, appliedFilter]);

	if (!isAdmin) {
		return <Navigate to="/" replace />;
	}

	const applySearch = (e: React.FormEvent) => {
		e.preventDefault();
		setAppliedFilter(filter);
	};

	const resetSearch = () => {
		setFilter(emptyFilter);
		setAppliedFilter(emptyFilter);
	};

	const createUser = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!newUser.email.trim() || !newUser.password) {
			toast.error(t('users.createEmailPasswordRequired'));
			return;
		}
		if (!newUser.department_id) {
			toast.error(t('users.createOrganizationRequired'));
			return;
		}
		setSaving(true);
		try {
			await authApi.createUser({
				email: newUser.email.trim(),
				password: newUser.password,
				display_name: newUser.display_name.trim(),
				role: newUser.role,
				department_id: newUser.department_id,
			});
			setNewUser(emptyUser);
			setCreateOpen(false);
			await reload();
			toast.success(t('admin.saved'));
		} catch (err) {
			toast.error(err instanceof Error ? err.message : t('common.error'));
		} finally {
			setSaving(false);
		}
	};

	const changePassword = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!passwordTarget) return;
		if (password !== confirmPassword) {
			toast.error(t('auth.passwordMismatch'));
			return;
		}
		if (password.length < 6) {
			toast.error(t('auth.passwordTooShort'));
			return;
		}
		setSaving(true);
		try {
			await authApi.updateUser(passwordTarget.id, { password });
			setPasswordTarget(null);
			setPassword('');
			setConfirmPassword('');
			toast.success(t('users.passwordUpdated'));
		} catch (err) {
			toast.error(err instanceof Error ? err.message : t('common.error'));
		} finally {
			setSaving(false);
		}
	};

	const assignUser = async (
		userId: string,
		patch: { role?: 'admin' | 'user'; department_id?: string | null; clear_department?: boolean },
	) => {
		try {
			await authApi.updateUser(userId, patch);
			await reload();
			toast.success(t('admin.saved'));
		} catch (e) {
			toast.error(e instanceof Error ? e.message : t('common.error'));
		}
	};

	const currentUserId = localStorage.getItem('user_id') || '';
	const currentUsername = (localStorage.getItem('username') || '').toLowerCase();
	const isSelf = (u: AuthUser) =>
		(currentUserId && u.id === currentUserId) ||
		userLabel(u).toLowerCase() === currentUsername;

	const removeUser = async (u: AuthUser) => {
		if (isSelf(u)) {
			toast.error(t('users.cannotDeleteSelf'));
			return;
		}
		if (!window.confirm(t('users.deleteConfirm', { email: userLabel(u) }))) {
			return;
		}
		try {
			await authApi.removeUser(u.id);
			await reload();
			toast.success(t('users.deleted'));
		} catch (e) {
			toast.error(e instanceof Error ? e.message : t('common.error'));
		}
	};

	if (loading) {
		return (
			<div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
				<Loader2 className="size-4 animate-spin" />
				{t('common.loading')}
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col gap-6 overflow-auto p-6">
			<div>
				<h1 className="text-xl font-semibold">{t('users.title')}</h1>
				<p className="text-sm text-muted-foreground">{t('users.description')}</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>{t('users.listTitle')}</CardTitle>
					<CardDescription>{t('users.listHint')}</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<form onSubmit={applySearch} className="space-y-3">
						<div className="flex flex-wrap items-end gap-2">
							<div className="min-w-[8rem] flex-1">
								<FieldLabel htmlFor="user-search-email">{t('auth.email')}</FieldLabel>
								<Input
									id="user-search-email"
									value={filter.email}
									placeholder={t('users.searchEmailPlaceholder')}
									onChange={(e) =>
										setFilter((f) => ({ ...f, email: e.target.value }))
									}
									autoComplete="off"
								/>
							</div>
							<div className="min-w-[7rem]">
								<FieldLabel>{t('admin.role')}</FieldLabel>
								<Select
									value={filter.role}
									onValueChange={(v) =>
										setFilter((f) => ({
											...f,
											role: v as typeof filter.role,
										}))
									}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="__all__">
											{t('users.allRoles')}
										</SelectItem>
										<SelectItem value="user">{t('admin.roleUser')}</SelectItem>
										<SelectItem value="admin">{t('admin.roleAdmin')}</SelectItem>
									</SelectContent>
								</Select>
							</div>
							<div className="min-w-[8rem] flex-1">
								<FieldLabel>{t('auth.organization')}</FieldLabel>
								<Select
									value={filter.department_id}
									onValueChange={(v) =>
										setFilter((f) => ({ ...f, department_id: v }))
									}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="__all__">
											{t('users.allOrganizations')}
										</SelectItem>
										<SelectItem value="__none__">
											{t('auth.noOrganization')}
										</SelectItem>
										{departments.map((d) => (
											<SelectItem key={d.id} value={d.id}>
												{d.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<Button type="submit" variant="secondary">
								<Search className="size-3.5" />
								{t('users.search')}
							</Button>
							<Button type="button" variant="outline" onClick={resetSearch}>
								{t('users.reset')}
							</Button>
						</div>
					</form>

					<div>
						<Button
							type="button"
							onClick={() => {
								setNewUser(emptyUser);
								setCreateOpen(true);
							}}
						>
							<Plus className="size-3.5" />
							{t('common.create')}
						</Button>
					</div>

					{filteredUsers.length === 0 ? (
						<p className="text-sm text-muted-foreground">{t('common.noData')}</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>{t('auth.email')}</TableHead>
									<TableHead>{t('admin.role')}</TableHead>
									<TableHead>{t('auth.organization')}</TableHead>
									<TableHead className="w-16" />
								</TableRow>
							</TableHeader>
							<TableBody>
								{filteredUsers.map((u) => (
									<TableRow key={u.id}>
										<TableCell>{userLabel(u)}</TableCell>
										<TableCell>
											<Select
												value={u.role}
												onValueChange={(v) =>
													void assignUser(u.id, {
														role: v as 'admin' | 'user',
													})
												}
											>
												<SelectTrigger className="w-28">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="user">
														{t('admin.roleUser')}
													</SelectItem>
													<SelectItem value="admin">
														{t('admin.roleAdmin')}
													</SelectItem>
												</SelectContent>
											</Select>
										</TableCell>
										<TableCell>
											<Select
												value={u.department_id || '__none__'}
												onValueChange={(v) =>
													void assignUser(
														u.id,
														v === '__none__'
															? { clear_department: true }
															: { department_id: v },
													)
												}
											>
												<SelectTrigger className="w-40">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="__none__">
														{t('auth.noOrganization')}
													</SelectItem>
													{departments.map((d) => (
														<SelectItem key={d.id} value={d.id}>
															{d.name}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</TableCell>
										<TableCell>
											<div className="flex items-center gap-1">
												<Button
													variant="ghost"
													size="icon"
													title={t('users.changePassword')}
													onClick={() => {
														setPasswordTarget(u);
														setPassword('');
														setConfirmPassword('');
													}}
												>
													<KeyRound className="size-3.5" />
												</Button>
												<Button
													variant="ghost"
													size="icon"
													title={t('users.delete')}
													disabled={isSelf(u)}
													onClick={() => void removeUser(u)}
												>
													<Trash2 className="size-3.5" />
												</Button>
											</div>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>

			<Dialog
				open={createOpen}
				onOpenChange={(open) => {
					setCreateOpen(open);
					if (!open) setNewUser(emptyUser);
				}}
			>
				<DialogContent className="!w-[420px] !max-w-[420px]">
					<form onSubmit={createUser}>
						<DialogHeader>
							<DialogTitle>{t('users.addTitle')}</DialogTitle>
							<DialogDescription>{t('users.addHint')}</DialogDescription>
						</DialogHeader>
						<FieldGroup className="gap-3 py-2">
							<Field>
								<FieldLabel htmlFor="create-email">{t('auth.email')}</FieldLabel>
								<Input
									id="create-email"
									type="email"
									value={newUser.email}
									onChange={(e) =>
										setNewUser((u) => ({ ...u, email: e.target.value }))
									}
									placeholder={t('users.emailPlaceholder')}
									required
									autoComplete="off"
								/>
							</Field>
							<Field>
								<FieldLabel htmlFor="create-display">
									{t('auth.displayName')}
								</FieldLabel>
								<Input
									id="create-display"
									value={newUser.display_name}
									onChange={(e) =>
										setNewUser((u) => ({
											...u,
											display_name: e.target.value,
										}))
									}
									placeholder={t('auth.displayNamePlaceholder')}
									autoComplete="off"
								/>
							</Field>
							<Field>
								<FieldLabel htmlFor="create-password">{t('auth.password')}</FieldLabel>
								<Input
									id="create-password"
									type="password"
									value={newUser.password}
									onChange={(e) =>
										setNewUser((u) => ({ ...u, password: e.target.value }))
									}
									required
									minLength={6}
									autoComplete="new-password"
								/>
							</Field>
							<Field>
								<FieldLabel>{t('auth.organization')}</FieldLabel>
								<Select
									value={newUser.department_id || undefined}
									onValueChange={(v) =>
										setNewUser((u) => ({
											...u,
											department_id: v,
										}))
									}
									required
								>
									<SelectTrigger>
										<SelectValue
											placeholder={t('users.organizationPlaceholder')}
										/>
									</SelectTrigger>
									<SelectContent>
										{departments.map((d) => (
											<SelectItem key={d.id} value={d.id}>
												{d.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</Field>
							<Field>
								<FieldLabel>{t('admin.role')}</FieldLabel>
								<Select
									value={newUser.role}
									onValueChange={(v) =>
										setNewUser((u) => ({
											...u,
											role: v as 'admin' | 'user',
										}))
									}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="user">{t('admin.roleUser')}</SelectItem>
										<SelectItem value="admin">{t('admin.roleAdmin')}</SelectItem>
									</SelectContent>
								</Select>
							</Field>
						</FieldGroup>
						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								onClick={() => setCreateOpen(false)}
								disabled={saving}
							>
								{t('common.cancel')}
							</Button>
							<Button type="submit" disabled={saving}>
								{saving && <Loader2 className="size-3.5 animate-spin" />}
								{t('common.create')}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			<Dialog
				open={!!passwordTarget}
				onOpenChange={(open) => {
					if (!open) {
						setPasswordTarget(null);
						setPassword('');
						setConfirmPassword('');
					}
				}}
			>
				<DialogContent className="!w-[420px] !max-w-[420px]">
					<form onSubmit={changePassword}>
						<DialogHeader>
							<DialogTitle>{t('users.changePasswordTitle')}</DialogTitle>
							<DialogDescription>
								{t('users.changePasswordHint', {
									username: passwordTarget ? userLabel(passwordTarget) : '',
								})}
							</DialogDescription>
						</DialogHeader>
						<FieldGroup className="gap-3 py-2">
							<Field>
								<FieldLabel htmlFor="reset-password">{t('users.newPassword')}</FieldLabel>
								<Input
									id="reset-password"
									type="password"
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									required
									minLength={6}
									autoComplete="new-password"
								/>
							</Field>
							<Field>
								<FieldLabel htmlFor="reset-confirm">
									{t('users.confirmPassword')}
								</FieldLabel>
								<Input
									id="reset-confirm"
									type="password"
									value={confirmPassword}
									onChange={(e) => setConfirmPassword(e.target.value)}
									required
									minLength={6}
									autoComplete="new-password"
								/>
							</Field>
						</FieldGroup>
						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								onClick={() => setPasswordTarget(null)}
								disabled={saving}
							>
								{t('common.cancel')}
							</Button>
							<Button type="submit" disabled={saving}>
								{saving && <Loader2 className="size-3.5 animate-spin" />}
								{t('common.save')}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</div>
	);
}
