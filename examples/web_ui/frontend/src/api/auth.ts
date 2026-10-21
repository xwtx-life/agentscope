import { client, persistSession } from './client';

export interface AuthUser {
	id: string;
	email: string;
	display_name: string;
	username: string;
	role: 'admin' | 'user';
	tenant_id: string | null;
	tenant_name: string | null;
	department_id: string | null;
	department_name: string | null;
}

export interface TokenResponse {
	access_token: string;
	token_type: string;
	user: AuthUser;
}

export interface Department {
	id: string;
	name: string;
	description: string | null;
	created_at: string;
	updated_at: string;
}

function displayName(user: AuthUser) {
	return user.email || user.username;
}

function cacheUser(user: AuthUser) {
	localStorage.setItem('user_id', user.id);
	localStorage.setItem('username', displayName(user));
	localStorage.setItem('user_role', user.role);
	const org = user.tenant_name || user.department_name;
	if (org) {
		localStorage.setItem('department_name', org);
	} else {
		localStorage.removeItem('department_name');
	}
}

export const authApi = {
	register: async (
		body: {
			email: string;
			password: string;
			display_name?: string;
			tenant_name: string;
		},
		baseUrl?: string,
	) => {
		const res = await client.post<TokenResponse>('/auth/register', body, undefined, {
			silent: true,
			baseUrl,
			anonymous: true,
		});
		persistSession(res.access_token, displayName(res.user));
		cacheUser(res.user);
		return res;
	},

	login: async (body: { email: string; password: string }, baseUrl?: string) => {
		const res = await client.post<TokenResponse>('/auth/login', body, undefined, {
			silent: true,
			baseUrl,
			anonymous: true,
		});
		persistSession(res.access_token, displayName(res.user));
		cacheUser(res.user);
		return res;
	},

	me: () => client.get<AuthUser>('/auth/me', undefined, { silent: true }),

	logout: async () => {
		try {
			await client.post('/auth/logout', undefined, undefined, { silent: true });
		} catch {
			// Client clears token regardless of server response.
		}
	},

	listUsers: () => client.get<AuthUser[]>('/auth/users'),

	createUser: (body: {
		email: string;
		password: string;
		display_name?: string;
		role?: 'admin' | 'user';
		department_id: string;
	}) => client.post<AuthUser>('/auth/users', body),

	updateUser: (
		userId: string,
		body: {
			role?: 'admin' | 'user';
			department_id?: string | null;
			tenant_id?: string | null;
			clear_department?: boolean;
			password?: string;
			display_name?: string;
		},
	) => client.patch<AuthUser>(`/auth/users/${userId}`, body),

	removeUser: (userId: string) => client.delete(`/auth/users/${userId}`),
};

export const departmentApi = {
	list: (baseUrl?: string) =>
		client.get<Department[]>('/departments', undefined, {
			silent: true,
			baseUrl,
			anonymous: true,
		}),

	create: (body: { name: string; description?: string | null }) =>
		client.post<Department>('/departments', body),

	update: (id: string, body: { name?: string; description?: string | null }) =>
		client.patch<Department>(`/departments/${id}`, body),

	remove: (id: string) => client.delete(`/departments/${id}`),
};
