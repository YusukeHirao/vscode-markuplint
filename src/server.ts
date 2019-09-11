import path from 'path';

console.log('Started: markuplint language server');

import {
	createConnection,
	Diagnostic,
	DiagnosticSeverity,
	InitializeResult,
	IPCMessageReader,
	IPCMessageWriter,
	TextDocuments,
} from 'vscode-languageserver';

import { error, info, ready, warning } from './types';

// tslint:disable
// @ts-ignore
let markuplint;
let version: string;
let onLocalNodeModule = true;
try {
	// const modPath = path.join(process.cwd(), 'node_modules', 'markuplint');
	const modPath = path.join('../../markuplint/packages/markuplint');
	markuplint = require(modPath);
	version = require(`${modPath}/package.json`).version;
} catch (err) {
	markuplint = require('markuplint');
	version = require('markuplint/package.json').version;
	onLocalNodeModule = false;
}
// tslint:enable

const connection = createConnection(new IPCMessageReader(process), new IPCMessageWriter(process));
const documents = new TextDocuments();
documents.listen(connection);

connection.onInitialize(
	(params): InitializeResult => {
		return {
			capabilities: {
				textDocumentSync: documents.syncKind,
			},
		};
	},
);

connection.onInitialized(() => {
	connection.sendRequest(ready, { version });

	if (!onLocalNodeModule) {
		const locale = process.env.VSCODE_NLS_CONFIG ? JSON.parse(process.env.VSCODE_NLS_CONFIG).locale : '';
		let msg: string;
		switch (locale) {
			case 'ja': {
				msg = `ワークスペースのnode_modulesにmarkuplintが発見できなかったためVS Code拡張にインストールされているバージョン(v${version})を利用します。`;
				break;
			}
			default: {
				msg = `Since markuplint could not be found in the node_modules of the workspace, this use the version (v${version}) installed in VS Code Extension.`;
			}
		}
		connection.sendNotification(info, `<markuplint> ${msg}`);
	} else {
		console.log(`markuplint ready: v${version}`);
	}
});

documents.onDidChangeContent(async change => {
	const diagnostics: Diagnostic[] = [];

	const filePath = change.document.uri.replace(/^file:\/+/, '/');
	const dir = path.dirname(filePath);

	const html = change.document.getText();

	console.log({
		html,
		dir,
	});

	// @ts-ignore
	const totalResults = await markuplint.exec({
		sourceCodes: html,
		workspace: dir,
	});

	const reports = totalResults[0] ? totalResults[0].results : [];

	console.log(totalResults);

	for (const report of reports) {
		diagnostics.push({
			severity: report.severity === 'error' ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning,
			range: {
				start: {
					line: report.line - 1,
					character: report.col - 1,
				},
				end: {
					line: report.line - 1,
					character: report.col + report.raw.length - 1,
				},
			},
			message: `${report.message} (${report.ruleId})`,
			source: 'markuplint',
		});
	}

	connection.sendDiagnostics({
		uri: change.document.uri,
		diagnostics,
	});
});

connection.listen();
