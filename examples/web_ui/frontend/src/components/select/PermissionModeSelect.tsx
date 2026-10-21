import { ChevronDown, UserRoundKey } from 'lucide-react';

import type { PermissionMode } from '@/api/types';
import { Button } from '@/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useTranslation } from '@/i18n/useI18n.ts';
import { cn } from '@/lib/utils.ts';

const PERMISSION_MODES: PermissionMode[] = [
	'bypass',
	'default',
	'accept_edits',
	'explore',
	'dont_ask',
];

interface Props extends Omit<React.ComponentPropsWithoutRef<typeof Button>, 'onChange' | 'value'> {
	className?: string;
	value?: PermissionMode;
	disabled?: boolean;
	onChange?: (value: PermissionMode) => void;
}

export function PermissionModeSelect({ className, value, disabled, onChange, ...props }: Props) {
	const { t } = useTranslation();

	const displayLabel = value
		? t(`permission-mode.${value}`)
		: t('permission-mode.placeholder');

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="outline"
					size="sm"
					className={cn('justify-between gap-1 font-normal', className)}
					disabled={disabled}
					tooltip={t('permission-mode.trigger-tooltip')}
					{...props}
				>
					<div className="flex flex-row items-center gap-x-2">
						<UserRoundKey />
						<span className="truncate">{displayLabel}</span>
					</div>
					<ChevronDown className="size-3.5 text-muted-foreground" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="min-w-48">
				<DropdownMenuGroup>
					<DropdownMenuLabel>{t('permission-mode.label')}</DropdownMenuLabel>
					{PERMISSION_MODES.map((mode) => (
						<Tooltip key={mode}>
							<TooltipTrigger asChild>
								<DropdownMenuItem onSelect={() => onChange?.(mode)}>
									{t(`permission-mode.${mode}`)}
								</DropdownMenuItem>
							</TooltipTrigger>
							<TooltipContent side="right">
								{t(`permission-mode.${mode}-tooltip`)}
							</TooltipContent>
						</Tooltip>
					))}
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
