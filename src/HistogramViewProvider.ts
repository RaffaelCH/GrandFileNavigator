import * as vscode from "vscode";
import { getFileHistogramData } from "./loadHistogramData.js";

export class HistogramViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "grandfilenavigator-histogram";

  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public async resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true, // Allow scripts in the webview.
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = await this._getHtmlForWebview(
      webviewView.webview
    );

    this.setupMessageHandlers();
    this.updateHistogramData();
  }

  public async updateHistogramData() {
    if (!this._view) {
      return;
    }

    var activeTextEditor = vscode.window.activeTextEditor;
    if (!activeTextEditor) {
      return;
    }

    var histogramNodes = await getFileHistogramData(
      activeTextEditor.document.uri
    );

    this._view.webview.postMessage({
      command: "reloadData",
      histogramNodes: histogramNodes,
    });
  }

  private setupMessageHandlers() {
    if (this._view === undefined) {
      return;
    }

    // Handle messages from the webview
    this._view.webview.onDidReceiveMessage((message) => {
      switch (message.command) {
        case "showRange":
          vscode.window.activeTextEditor?.revealRange(
            new vscode.Range(
              new vscode.Position(message.startLine, 0),
              new vscode.Position(message.endLine, 1)
            )
          );
          return;
      }
    }, undefined);
  }

  private async _getHtmlForWebview(webview: vscode.Webview) {
    // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
    const insertHistogramUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "src",
        "webview_scripts",
        "insertHistogram.js"
      )
    );
    const messageHandlerUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "src",
        "webview_scripts",
        "visualizationMessageHandler.js"
      )
    );

    var activeTextEditor = vscode.window.activeTextEditor;
    if (!activeTextEditor) {
      return "No file open";
    }

    // Use a nonce to only allow a specific script to be run.
    const nonce = getNonce();

    return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">

				<!--
					Use a content security policy to only allow loading styles from our extension directory,
					and only allow scripts that have a specific nonce.
					(See the 'webview-sample' extension sample for img-src content security policy examples)
				
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
        -->

				<meta name="viewport" content="width=device-width, height=device-height initial-scale=1.0">
        <script>
          const vscodeApi = acquireVsCodeApi(); // Set global const with reference to keep track of it.
        </script>
			</head>
			<body>
        <p id="errorMessage"></p>
        <svg id="histogram-container" style="width:100%;height:800px;"></svg>
        <button onclick="vscodeApi.postMessage({command:'showRange', startLine: 0, endLine: 1});">Jump to Top</button>
				<script id="histogram-inserter" nonce="${nonce}" src="${insertHistogramUri}"></script>
        <script id="message-handler" nonce="${nonce}" src="${messageHandlerUri}"></script>
        <script>insertHistogram();</script>
			</body>
			</html>`;
  }
}

function getNonce() {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
