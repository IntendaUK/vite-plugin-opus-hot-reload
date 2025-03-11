/* eslint-disable max-lines-per-function */

//Imports
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const colors = require('picocolors');

//Helpers
const getShortName = (file, root) => {
	if (file.startsWith(root + '/'))
		return path.posix.relative(root, file);

	return file;
};

const defaultPaths = ['./app/**/*.json', './app/**/*.js', './app/**/*.jsx', './public/app.json'];

const getPathsAndOverrides = () => {
	try {
		const paths = [...defaultPaths];
		const ensembleOverrides = [];

		let opusUiEnsembles = [];

		try {
			const pkgPath = path.resolve(process.cwd(), 'package.json');
			const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
			opusUiEnsembles = pkg.opusUiEnsembles ?? opusUiEnsembles;

			const extPath = path.resolve(process.cwd(), pkg.opusUiConfig.externalOpusUiConfig);
			const extConfig = JSON.parse(fs.readFileSync(extPath, 'utf8'));
			opusUiEnsembles = extConfig.opusUiEnsembles ?? opusUiEnsembles;
		} catch {}

		opusUiEnsembles.forEach(ensemble => {
			if (!ensemble.external || !ensemble.path)
				return;

			let ePath = ensemble.path.replace(/\\/g, '/');
			ePath = ePath.endsWith('/') ? `${ePath}**/*` : `${ePath}/**/*`;
			paths.push(`${ePath}.json`);
			paths.push(`${ePath}.js`);
			paths.push(`${ePath}.jsx`);

			ensembleOverrides.push(ensemble);
		});

		return {
			paths,
			ensembleOverrides
		};
	} catch (e) {
		console.error('Error parsing external opus config:', e);

		return {
			paths: defaultPaths,
			ensembleOverrides: []
		};
	}
};

//Plugin
const plugin = (options = {}) => {
	const { paths: _paths, ensembleOverrides: _ensembleOverrides } = getPathsAndOverrides();

	const paths = options.paths ?? _paths;
	const ensembleOverrides = options.ensembleOverrides ?? _ensembleOverrides;

	return {
		name: 'vite-plugin-opus-hot-reload',
		configureServer ({
			ws,
			config: {
				root: viteRoot,
				logger
			}
		}) {
			const root = options.root || viteRoot;
			const rewritePath = _path => {
				const absFile = path.resolve(root, _path);
				for (const override of ensembleOverrides) {
					const overrideAbs = path.normalize(override.path);
					if (absFile.startsWith(overrideAbs))
						return `@${override.name}${path.sep}${path.relative(overrideAbs, absFile)}`;
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

			chokidar
				.watch(paths, {
					cwd: root,
					ignoreInitial: true,
					...options
				})
				.on('add', reload)
				.on('change', reload);
		}
	};
};

//Exports
module.exports = plugin;
