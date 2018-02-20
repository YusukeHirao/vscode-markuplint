require('util.promisify/shim')(); // tslint:disable-line

import * as path from 'path';

// tslint:disable
let markuplint;
try {
	const modPath = path.join(process.cwd(), 'node_modules', 'markuplint');
	markuplint = require(modPath);
} catch (err) {
	markuplint = require('markuplint');
	console.warn(err.message);
}
// tslint:enable

import {
	createConnection,
	Diagnostic,
	DiagnosticSeverity,
	InitializeResult,
	IPCMessageReader,
	IPCMessageWriter,
	TextDocuments,
} from 'vscode-languageserver';

import {
	error,
	info,
	ready,
	warning,
} from './types';

const connection = createConnection(new IPCMessageReader(process), new IPCMessageWriter(process));
const documents = new TextDocuments();
documents.listen(connection);

connection.onInitialize((params): InitializeResult => {
	return {
		capabilities: {
			textDocumentSync: documents.syncKind,
		},
	};
});

documents.onDidChangeContent((change) => {
	const diagnostics: Diagnostic[] = [];

	const filePath = change.document.uri.replace(/^file:\//, '');
	const dir = path.dirname(filePath);

	const html = change.document.getText();
	markuplint.verifyOnWorkspace(html, dir).then((reports) => {
		for (const report of reports) {
			diagnostics.push({
				severity: report.level === 'error' ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning,
				range: {
					start: { line: report.line - 1, character: report.col - 1},
					end: { line: report.line - 1, character: report.col + report.raw.length - 1 },
				},
				message: `${report.message} (${report.ruleId})`,
				source: 'markuplint',
			});
		}
		connection.sendDiagnostics({ uri: change.document.uri, diagnostics });
	}).catch((err) => {
		console.log(err);
	});
});

connection.listen();
