import { QueryClientProvider } from '@tanstack/react-query';
import { Onborda, OnbordaProvider } from 'onborda';
import { useMemo, useState } from 'react';
import {
	createBrowserRouter,
	Navigate,
	RouterProvider,
	useNavigate,
} from 'react-router-dom';
import { Toaster } from 'sonner';

import { SkillHubPage } from './pages/skill';
import { clearSession, isLoggedIn } from '@/api/client';
import { RouteError } from '@/components/error/RouteError';
import { AppLayout } from '@/components/layout/AppLayout';
import { buildChatTour } from '@/components/tour/chatTourSteps';
import { TourCard } from '@/components/tour/TourCard';
import { UploadProvider } from '@/context/UploadContext';
import { useTranslation } from '@/i18n/useI18n';
import { queryClient } from '@/lib/query-client';
import { AdminPage } from '@/pages/admin';
import { ChannelPage } from '@/pages/channel';
import { ChatPage } from '@/pages/chat';
import { CredentialPage } from '@/pages/credential';
import { KnowledgePage } from '@/pages/knowledge';
import { LoginPage } from '@/pages/login';
import { RegisterPage } from '@/pages/register';
import { SchedulePage } from '@/pages/schedule';
import { SetupPage } from '@/pages/setup';
import { ProfilePage } from '@/pages/profile';
import { UsersPage } from '@/pages/users';

function SetupPageRoute() {
	const navigate = useNavigate();
	return (
		<div className="h-screen">
			<SetupPage
				onComplete={() => {
					clearSession();
					navigate('/login', { replace: true });
				}}
			/>
		</div>
	);
}

function LoginPageRoute({ onAuthed }: { onAuthed: () => void }) {
	const navigate = useNavigate();
	if (!localStorage.getItem('server_url')) {
		return <Navigate to="/setup" replace />;
	}
	if (isLoggedIn()) {
		return <Navigate to="/" replace />;
	}
	return (
		<div className="h-screen">
			<LoginPage
				onComplete={() => {
					onAuthed();
					navigate('/', { replace: true });
				}}
			/>
		</div>
	);
}

function RegisterPageRoute({ onAuthed }: { onAuthed: () => void }) {
	const navigate = useNavigate();
	if (!localStorage.getItem('server_url')) {
		return <Navigate to="/setup" replace />;
	}
	if (isLoggedIn()) {
		return <Navigate to="/" replace />;
	}
	return (
		<div className="h-screen">
			<RegisterPage
				onComplete={() => {
					onAuthed();
					navigate('/', { replace: true });
				}}
			/>
		</div>
	);
}

function RequireAuth({ children }: { children: React.ReactNode }) {
	if (!localStorage.getItem('server_url')) {
		return <Navigate to="/setup" replace />;
	}
	if (!isLoggedIn()) {
		return <Navigate to="/login" replace />;
	}
	return children;
}

function buildRouter(onAuthed: () => void) {
	return createBrowserRouter([
		{
			element: (
				<RequireAuth>
					<AppLayout />
				</RequireAuth>
			),
			errorElement: <RouteError />,
			children: [
				{
					errorElement: <RouteError />,
					children: [
						{ path: '/', element: <Navigate to="/chat" replace /> },
						{
							path: '/chat/:agentId?/:sessionId?/:memberId?',
							element: <ChatPage />,
						},
						{ path: '/schedule', element: <SchedulePage /> },
						{ path: '/channel', element: <ChannelPage /> },
						{ path: '/credential', element: <CredentialPage /> },
						{ path: '/mcp', element: <Navigate to="/chat" replace /> },
						{ path: '/mcp/:hubId', element: <Navigate to="/chat" replace /> },
						{ path: '/skill', element: <SkillHubPage /> },
						{ path: '/skill/:hubId', element: <SkillHubPage /> },
						{ path: '/knowledge', element: <KnowledgePage /> },
						{ path: '/knowledge/:kbId', element: <KnowledgePage /> },
						{ path: '/admin', element: <AdminPage /> },
						{ path: '/users', element: <UsersPage /> },
						{ path: '/profile', element: <ProfilePage /> },
					],
				},
			],
		},
		{ path: '/setup', element: <SetupPageRoute />, errorElement: <RouteError /> },
		{
			path: '/login',
			element: <LoginPageRoute onAuthed={onAuthed} />,
			errorElement: <RouteError />,
		},
		{
			path: '/register',
			element: <RegisterPageRoute onAuthed={onAuthed} />,
			errorElement: <RouteError />,
		},
	]);
}

function App() {
	const { t } = useTranslation();
	// Bump key after login so RequireAuth re-reads localStorage on next navigation.
	const [, setAuthEpoch] = useState(0);
	const tours = useMemo(() => [buildChatTour(t)], [t]);
	const router = useMemo(
		() =>
			buildRouter(() => {
				setAuthEpoch((n) => n + 1);
			}),
		[],
	);

	return (
		<QueryClientProvider client={queryClient}>
			<OnbordaProvider>
				<Onborda
					steps={tours}
					cardComponent={TourCard}
					shadowOpacity="0.6"
					cardTransition={{ type: 'spring', duration: 0.4 }}
				>
					<UploadProvider>
						<RouterProvider router={router} />
					</UploadProvider>
					<Toaster richColors position="top-right" />
				</Onborda>
			</OnbordaProvider>
		</QueryClientProvider>
	);
}

export default App;
