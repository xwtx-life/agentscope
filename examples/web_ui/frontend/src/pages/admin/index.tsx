import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';

import { departmentApi, type Department } from '@/api';
import { Button } from '@/components/ui/button.tsx';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card.tsx';
import { FieldLabel } from '@/components/ui/field.tsx';
import { Input } from '@/components/ui/input.tsx';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table.tsx';
import { useTranslation } from '@/i18n/useI18n.ts';

export function AdminPage() {
	const { t } = useTranslation();
	const isAdmin = localStorage.getItem('user_role') === 'admin';
	const [departments, setDepartments] = useState<Department[]>([]);
	const [loading, setLoading] = useState(true);
	const [deptName, setDeptName] = useState('');
	const [deptDesc, setDeptDesc] = useState('');
	const [saving, setSaving] = useState(false);

	const reload = useCallback(async () => {
		setLoading(true);
		try {
			setDepartments(await departmentApi.list());
		} catch (e) {
			toast.error(e instanceof Error ? e.message : t('common.error'));
		} finally {
			setLoading(false);
		}
	}, [t]);

	useEffect(() => {
		if (isAdmin) void reload();
	}, [reload, isAdmin]);

	if (!isAdmin) {
		return <Navigate to="/" replace />;
	}

	const createDepartment = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!deptName.trim()) return;
		setSaving(true);
		try {
			await departmentApi.create({
				name: deptName.trim(),
				description: deptDesc.trim() || null,
			});
			setDeptName('');
			setDeptDesc('');
			await reload();
			toast.success(t('admin.saved'));
		} catch (err) {
			toast.error(err instanceof Error ? err.message : t('common.error'));
		} finally {
			setSaving(false);
		}
	};

	const removeDepartment = async (d: Department) => {
		if (!window.confirm(t('admin.deleteDepartmentConfirm', { name: d.name }))) {
			return;
		}
		try {
			await departmentApi.remove(d.id);
			await reload();
			toast.success(t('admin.departmentDeleted'));
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
				<h1 className="text-xl font-semibold">{t('admin.title')}</h1>
				<p className="text-sm text-muted-foreground">{t('admin.description')}</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>{t('admin.departments')}</CardTitle>
					<CardDescription>{t('admin.departmentsHint')}</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<form onSubmit={createDepartment} className="flex flex-wrap items-end gap-2">
						<div className="min-w-[10rem] flex-1">
							<FieldLabel htmlFor="dept-name">{t('common.name')}</FieldLabel>
							<Input
								id="dept-name"
								value={deptName}
								onChange={(e) => setDeptName(e.target.value)}
								required
							/>
						</div>
						<div className="min-w-[10rem] flex-1">
							<FieldLabel htmlFor="dept-desc">{t('admin.descriptionField')}</FieldLabel>
							<Input
								id="dept-desc"
								value={deptDesc}
								onChange={(e) => setDeptDesc(e.target.value)}
							/>
						</div>
						<Button type="submit" disabled={saving}>
							<Plus className="size-3.5" />
							{t('common.create')}
						</Button>
					</form>
					{departments.length === 0 ? (
						<p className="text-sm text-muted-foreground">{t('common.noData')}</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>{t('common.name')}</TableHead>
									<TableHead>{t('admin.descriptionField')}</TableHead>
									<TableHead className="w-16" />
								</TableRow>
							</TableHeader>
							<TableBody>
								{departments.map((d) => (
									<TableRow key={d.id}>
										<TableCell>{d.name}</TableCell>
										<TableCell className="text-muted-foreground">
											{d.description || '—'}
										</TableCell>
										<TableCell>
											<Button
												variant="ghost"
												size="icon"
												onClick={() => void removeDepartment(d)}
											>
												<Trash2 className="size-3.5" />
											</Button>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
