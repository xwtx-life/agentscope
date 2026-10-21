import {
	BookText,
	BotMessageSquare,
	Cable,
	Calendars,
	KeyRound,
	LibraryBig,
	LogOut,
	Shield,
	Users,
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

import { authApi } from '@/api';
import { clearSession } from '@/api/client';
import AgentScope from '@/assets/images/agentscope_mono.svg?react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from '@/components/ui/sidebar';
import { useTranslation } from '@/i18n/useI18n';
import { avatarTint } from '@/utils/common';

function userInitials(username: string): string {
	const trimmed = username.trim();
	if (!trimmed) return '?';
	return trimmed.slice(0, 2).toUpperCase();
}

export function AppSidebar() {
	const navigate = useNavigate();
	const location = useLocation();
	const { t } = useTranslation();
	const role = localStorage.getItem('user_role');
	const username = localStorage.getItem('username') || '';
	const isAdmin = role === 'admin';

	const handleLogout = async () => {
		await authApi.logout();
		clearSession();
		navigate('/login', { replace: true });
	};

	const items = [
		{
			key: 'chat',
			label: t('common.chat'),
			icon: <BotMessageSquare />,
			active:
				location.pathname === '/chat' || location.pathname.startsWith('/chat/'),
			onClick: () => navigate('/chat'),
		},
		{
			key: 'schedule',
			label: t('common.schedule'),
			icon: <Calendars />,
			active: location.pathname === '/schedule',
			onClick: () => navigate('/schedule'),
		},
		{
			key: 'channel',
			label: t('common.channel'),
			icon: <Cable />,
			active: location.pathname === '/channel',
			onClick: () => navigate('/channel'),
		},
		{
			key: 'credential',
			label: t('common.credential'),
			icon: <KeyRound />,
			active: location.pathname === '/credential',
			onClick: () => navigate('/credential'),
		},
		{
			key: 'skill',
			label: t('common.skill-hub'),
			icon: <BookText />,
			active: location.pathname.startsWith('/skill'),
			onClick: () => navigate('/skill'),
		},
		{
			key: 'knowledge',
			label: t('common.knowledge'),
			icon: <LibraryBig />,
			active: location.pathname === '/knowledge',
			onClick: () => navigate('/knowledge'),
		},
		...(isAdmin
			? [
					{
						key: 'users',
						label: t('users.title'),
						icon: <Users />,
						active: location.pathname === '/users',
						onClick: () => navigate('/users'),
					},
					{
						key: 'admin',
						label: t('admin.title'),
						icon: <Shield />,
						active: location.pathname === '/admin',
						onClick: () => navigate('/admin'),
					},
				]
			: []),
	];

	return (
		<Sidebar
			collapsible="none"
			className="w-44 shrink-0 border-r border-sidebar-border bg-sidebar"
		>
			<SidebarHeader>
				<div className="mt-1 flex items-center gap-2 px-1">
					<div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary">
						<AgentScope className="size-5 text-primary-foreground" />
					</div>
					<span className="truncate text-sm font-semibold">AgentScope</span>
				</div>
			</SidebarHeader>
			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupContent>
						<SidebarMenu>
							{items.map((item) => (
								<SidebarMenuItem key={item.key}>
									<SidebarMenuButton
										isActive={item.active}
										onClick={item.onClick}
									>
										{item.icon}
										<span>{item.label}</span>
									</SidebarMenuButton>
								</SidebarMenuItem>
							))}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>
			<SidebarFooter>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton
							isActive={location.pathname === '/profile'}
							onClick={() => navigate('/profile')}
							tooltip={t('profile.title')}
						>
							<Avatar className="size-5">
								<AvatarFallback
									className="text-[10px] font-medium"
									style={avatarTint(username || 'user')}
								>
									{userInitials(username)}
								</AvatarFallback>
							</Avatar>
							<span className="truncate">{username || t('profile.title')}</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
					<SidebarMenuItem>
						<SidebarMenuButton onClick={() => void handleLogout()}>
							<LogOut />
							<span>{t('auth.logout')}</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarFooter>
		</Sidebar>
	);
}
