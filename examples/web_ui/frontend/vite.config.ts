import path from 'path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import svgr from 'vite-plugin-svgr';

import { legacyCssChrome106 } from './vite-plugin-legacy-css';

export default defineConfig({
	plugins: [react(), tailwindcss(), svgr(), legacyCssChrome106()],
	server: {
		proxy: {
			'/api': 'http://localhost:3000',
		},
	},
	resolve: {
		alias: {
			'@': path.resolve(__dirname, './src'),
			'next/navigation': path.resolve(__dirname, './src/lib/next-navigation-shim.ts'),
		},
	},
	optimizeDeps: {
		include: ['mime-types'],
	},
});
