/* eslint-disable max-lines-per-function */

const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const colors = require('picocolors');

const getShortName = (file, root) => {
	return file.startsWith(root + '/')
		? path.posix.relative(root, file)
		: file;
};

// Helper function to load default paths and ensembleOverrides
const getPathsAndOverrides = () => {
	// Start with default glob patterns.
	const defaultPaths = ['./app/**/*.json', './public/app.json'];
	let ensembleOverrides = [];

	// Use process.cwd() to reference the consuming project's root.
	const packageJsonPath = path.resolve(process.cwd(), 'package.json');

	if (fs.existsSync(packageJsonPath)) {
		try {
			const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
			// Check if there's an external config specified
			if (packageJson.opusUiConfig && packageJson.opusUiConfig.externalOpusUiConfig) {
				const externalConfigPath = path.resolve(
					process.cwd(),
					packageJson.opusUiConfig.externalOpusUiConfig
				);
				if (fs.existsSync(externalConfigPath)) {
					const externalConfig = JSON.parse(fs.readFileSync(externalConfigPath, 'utf8'));
					if (externalConfig.opusUiEnsembles && Array.isArray(externalConfig.opusUiEnsembles)) {
						ensembleOverrides = externalConfig.opusUiEnsembles;
						externalConfig.opusUiEnsembles.forEach(ensemble => {
							// If the ensemble is marked as external and has a valid path…
							if (ensemble.external && ensemble.path) {
								// Convert Windows backslashes to forward slashes.
								let ensemblePath = ensemble.path.replace(/\\/g, '/');
								// Append a glob pattern that matches any JSON file (recursively).
								ensemblePath = ensemblePath.endsWith('/')
									? `${ensemblePath}**/*.json`
									: `${ensemblePath}/**/*.json`;
								defaultPaths.push(ensemblePath);
							}
						});
					}
				}
			}
		} catch (error) {
			console.error('Error parsing external opus config:', error);
		}
	}

	return {
		paths: defaultPaths,
		ensembleOverrides
	};
};

// Updated plugin: accepts an options object (optional)
// It automatically loads paths and ensemble overrides from the consuming project.
const plugin = (options = {}) => {
	// Get defaults from the consuming app's configuration.
	const { paths, ensembleOverrides } = getPathsAndOverrides();

	// Allow the consumer to override defaults if needed.
	const finalPaths = options.paths || paths;
	const finalOverrides = options.ensembleOverrides || ensembleOverrides;

	return {
		name: 'vite-plugin-opus-hot-reload',

		configureServer ({ ws, config: { root: viteRoot, logger } }) {
			// Use provided root or fallback to Vite's root.
			const root = options.root || viteRoot;

			const rewritePath = _path => {
				const absoluteFilePath = path.resolve(root, _path);
				// Check each override: if the file is inside one of the external paths,
				// rewrite the path using the alias.
				for (const override of finalOverrides) {
					const overrideAbsPath = path.normalize(override.path);
					if (absoluteFilePath.startsWith(overrideAbsPath)) {
						const relativePart = path.relative(overrideAbsPath, absoluteFilePath);

						return `@${override.name}${path.sep}${relativePart}`;
					}
				}

				return _path;
			};

			const reload = _path => {
				const newPath = rewritePath(_path).replaceAll('\\', '/');
				ws.send('json-reload', { path: newPath });
				if (options.log ?? true) {
					logger.info(
						colors.green('page reload ') + colors.dim(getShortName(newPath, root)),
						{
							clear: true,
							timestamp: true
						}
					);
				}
			};

			// Watch the final paths
			chokidar
				.watch(finalPaths, {
					cwd: root,
					ignoreInitial: true,
					...options
				})
				.on('add', reload)
				.on('change', reload);
		}
	};
};

module.exports = plugin;
