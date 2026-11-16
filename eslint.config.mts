import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores, defineConfig } from 'eslint/config';

export default defineConfig(
	globalIgnores([
		'node_modules',
		'dist',
		'esbuild.config.mjs',
		'version-bump.mjs',
		'versions.json',
		'main.js',
		'package.json',
		'package-lock.json',
		'tsconfig.json',
	]),
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.mts', 'manifest.json'],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json'],
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		// "Kindle" e "USB" são nomes próprios.
		rules: { 'obsidianmd/ui/sentence-case': ['warn', { brands: ['Kindle', 'USB'], acronyms: ['USB'] }] },
	},
	{
		// node:test devolve promessas que o executor já aguarda.
		files: ['test/**/*.ts'],
		rules: { '@typescript-eslint/no-floating-promises': 'off' },
	},
);
