require('util.promisify/shim')(); // tslint:disable-line

import * as path from 'path';
import * as semver from 'semver';

console.log('Started: markuplint language server');

import {
	createConnection,
	Diagnostic,
	DiagnosticSeverity,
	InitializeResult,
	IPCMessageReader,
	IPCMessageWriter,
	Position,
	Range,
	ResponseError,
	TextDocuments,
	TextDocumentSyncKind,
	TextEdit,
} from 'vscode-languageserver';

import {
	edit,
	error,
	info,
	ready,
	warning,
} from './types';

// tslint:disable
let markuplint;
let version: string;
let onLocalNodeModule = true;
let isOld = false;
try {
	const modPath = path.join(process.cwd(), 'node_modules', 'markuplint');
	markuplint = require(modPath);
	version = require(`${modPath}/package.json`).version;
	console.log(`Local markuplint: v${version}`);
	if (semver.lt(version, '0.25.0')) {
		isOld = true;
		throw new Error();
	}
} catch (err) {
	markuplint = require('../../markuplint');
	version = require('../../markuplint/package.json').version;
	onLocalNodeModule = false;
	console.log(`Default markuplint: v${version}`);
}
// tslint:enable

console.log(`Using markuplint: v${version}`);

const connection = createConnection(new IPCMessageReader(process), new IPCMessageWriter(process));
const documents = new TextDocuments();
documents.listen(connection);

connection.onInitialize((params): InitializeResult => {
	return {
		capabilities: {
			textDocumentSync: {
				openClose: true,
				change: TextDocumentSyncKind.Full,
				willSaveWaitUntil: true,
				save: {
					includeText: false,
				},
			},
		},
	};
});

connection.onInitialized(() => {
	connection.sendRequest(ready, { version });

	if (!onLocalNodeModule) {
		const locale = JSON.parse(process.env.VSCODE_NLS_CONFIG).locale;
		let msg: string;
		if (isOld) {
			switch (locale) {
				case 'ja': {
					msg = `ワークスペースのnode_modulesにあるmarkuplintが古かったため、`;
					break;
				}
				default: {
					msg = `Since markuplint is old in the node_modules of the workspace, `;
				}
			}
		} else {
			switch (locale) {
				case 'ja': {
					msg = `ワークスペースのnode_modulesにmarkuplintが発見できなかったため、`;
					break;
				}
				default: {
					msg = `Since markuplint could not be found in the node_modules of the workspace, `;
				}
			}
		}
		switch (locale) {
			case 'ja': {
				msg += `VS Code拡張にインストールされているバージョン(v${version})を利用します。`;
				break;
			}
			default: {
				msg += `this use the version (v${version}) installed in VS Code Extension.`;
			}
		}
		connection.sendNotification(info, `<markuplint> ${msg}`);
		console.log(`Info: ${msg}`);
	}
});


documents.onDidChangeContent(async (change) => {
	const diagnostics: Diagnostic[] = [];

	const filePath = change.document.uri.replace(/^file:\//, '');
	const dir = path.dirname(filePath);

	const html = change.document.getText();
	const reports = await markuplint.verifyOnWorkspace(html, dir);
	try {
		for (const report of reports) {
			diagnostics.push({
				severity: report.severity === 'error' ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning,
				range: {
					start: { line: report.line - 1, character: report.col - 1},
					end: { line: report.line - 1, character: report.col + report.raw.length - 1 },
				},
				message: `${report.message} (${report.ruleId})`,
				source: 'markuplint',
			});
		}
		connection.sendDiagnostics({ uri: change.document.uri, diagnostics });
	} catch (err) {
		connection.sendNotification(error, `<markuplint> ${err}`);
	}
});

/**
 * Notice: To availize `onWillSaveWaitUntil`, return `{capabilities: {textDocumentSync: {willSaveWaitUntil: true}}}` to `connection.onInitialize`.
 */
documents.onWillSaveWaitUntil(async (change) => {
	try {
		const filePath = change.document.uri.replace(/^file:\//, '');
		const dir = path.dirname(filePath);

		const html = change.document.getText();
		const fixed = await markuplint.fixOnWorkspace(html, dir);

		const fixEdit = TextEdit.replace(Range.create(Position.create(0, 0), Position.create(Array.from(fixed).length, 0)), fixed);
		console.info(`fix on save:\n\n${fixed}`);

		return [fixEdit];
	} catch (err) {
		connection.sendNotification(error, `<markuplint> ${err}`);
	}
});

connection.listen();
