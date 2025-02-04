/* eslint-disable max-lines-per-function, no-console */

import { reloadComponentsFromPath, stateManager } from '@intenda/opus-ui';

const appMode = import.meta.env.VITE_APP_MODE;

if (appMode === 'development' && import.meta.hot) {
	const resolversWaitingForAppBuild = [];

	import.meta.hot.on('json-reload', async ({ path }) => {
		console.log('Received json-reload event:', path);

		if (path === 'public/app.json') {
			resolversWaitingForAppBuild.forEach(r => r());
			resolversWaitingForAppBuild.length = 0;

			return;
		}

		await new Promise(resolver => {
			resolversWaitingForAppBuild.push(resolver);
		});

		stateManager.setWgtState('NOTIFICATIONS', {
			newMsg: {
				msg: `File changed. Reloading: ${path}`,
				type: 'info'
			}
		});

		const fetchNewJson = () => {
			fetch('app.json')
				.then(response => response.json())
				.then(data => {
					path = path.replace('app/', '');
					if (path.indexOf('dashboard/') !== 0 && path.indexOf('blueprint/') !== 0)
						path = `dashboard/${path}`;

					const newFileContents = path.split('/').reduce((p, n) => {
						return p[n];
					}, data);

					reloadComponentsFromPath(path, newFileContents);
				})
				.catch(error => {
					console.error('Error fetching updated JSON:', error);
					console.error('Retrying in 500ms');
					setTimeout(fetchNewJson, 500);
				});
		};

		fetchNewJson();
	});
}
