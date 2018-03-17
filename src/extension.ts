import * as path from 'path';

import {
	window,
	workspace,
	ExtensionContext,
	Position,
	Selection,
	StatusBarAlignment,
} from 'vscode';

import {
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
	TransportKind,
} from 'vscode-languageclient';

import {
	edit,
	error,
	info,
	ready,
	warning,
} from './types';

export function activate (context: ExtensionContext) {
	const serverModule = context.asAbsolutePath(path.join('out', 'server.js'));
	const debugOptions = { execArgv: ['--nolazy', '--debug=6009'] };

	const serverOptions: ServerOptions = {
		run : { module: serverModule, transport: TransportKind.ipc },
		debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions },
	};

	const clientOptions: LanguageClientOptions = {
		documentSelector: [
			{scheme: 'file', language: 'html'},
			{scheme: 'file', language: 'vue'},
		],
		synchronize: {
			configurationSection: 'markuplint',
			fileEvents: workspace.createFileSystemWatcher('**/{.markuplintrc,markuplintrc.json,markuplint.config.json,markuplint.json,markuplint.config.js}'),
		},
	};

	const client = new LanguageClient('markuplint', 'markuplint server', serverOptions, clientOptions);
	const disposable = client.start();
	context.subscriptions.push(disposable);

	client.onReady().then(() => {

		const statusBar = window.createStatusBarItem(StatusBarAlignment.Right, 0);

		client.onRequest(ready, (data) => {
			statusBar.show();
			statusBar.text = `$(check)markuplint[v${data.version}]`;
		});

		client.onRequest(edit, (fixed) => {
			window.activeTextEditor.edit((edited) => {
				edited.replace(client.protocol2CodeConverter.asRange(fixed.range), fixed.newText);
			});
		});

		client.onNotification(error, (message) => {
			window.showErrorMessage(message);
		});

		client.onNotification(warning, (message) => {
			window.showWarningMessage(message);
		});

		client.onNotification(info, (message) => {
			window.showInformationMessage(message);
			window.showInformationMessage(JSON.stringify(window.activeTextEditor.setDecorations));
		});
	});

}
