import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.BASE_URL || 'http://localhost:8080';
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(baseURL).hostname) || process.env.E2E_DISPOSABLE !== '1') {
	throw new Error('Use a disposable loopback WordPress site and set E2E_DISPOSABLE=1. Tests create posts and media.');
}

export default defineConfig({
	testDir: 'tests',
	testMatch: '**/*.spec.ts',
	fullyParallel: false,
	workers: 1,
	use: {
		baseURL,
		headless: true,
		viewport: { width: 1600, height: 1000 },
		trace: 'off',
		video: 'off',
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
		},
	],
});
