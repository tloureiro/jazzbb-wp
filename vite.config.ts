import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
	root: 'admin',
	publicDir: false,
	build: {
		lib: {
			entry: path.resolve(__dirname, 'admin/src/main.ts'),
			name: 'JazzbbWpAdmin',
			formats: ['iife'],
			fileName: () => 'admin.js',
		},
		emptyOutDir: true,
		outDir: path.resolve(__dirname, 'plugin/build'),
		sourcemap: true,
		assetsDir: '.',
		rollupOptions: {
			output: {
				inlineDynamicImports: true,
				assetFileNames: (assetInfo) => {
					if (assetInfo.name && assetInfo.name.endsWith('.css')) {
						return 'admin.css';
					}
					return 'admin-[name][extname]';
				},
			},
		},
	},
});
