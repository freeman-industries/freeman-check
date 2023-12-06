const ERROR = 'error';
const WARN = 'warn';
const OFF = 'off';

module.exports = {
	root: true,
	parser: '@typescript-eslint/parser',
	parserOptions: {
		project: 'tsconfig.json',
	},
	plugins: ['justinanastos', '@typescript-eslint'],
	rules: {
		'justinanastos/switch-braces': ERROR,
	},
	ignorePatterns: [
		'dist',
		'node_modules',
		'tsconfig.json',
		'.eslintrc.js',
	],
};
