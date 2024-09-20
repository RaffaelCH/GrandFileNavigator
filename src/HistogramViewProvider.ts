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
  }

  public async reloadView() {
    if (!this._view) {
      return;
    }

    this._view.webview.html = await this._getHtmlForWebview(this._view.webview);
  }

  private async _getHtmlForWebview(webview: vscode.Webview) {
    // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
    const chartJsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "resources", "chart.js")
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "src", "insertHistogram.js")
    );

    var activeTextEditor = vscode.window.activeTextEditor;
    if (!activeTextEditor) {
      return "No file open";
    }

    var [importance, labels] = await getFileHistogramData(
      activeTextEditor.document.uri
    );
    var importanceJson = JSON.stringify(importance);
    var labelsJson = JSON.stringify(labels);

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
			</head>
			<body>
        <p id="errorMessage"></p>
        <div><canvas id="histogram"></canvas></div>
        <script src="${chartJsUri}"></script>
				<script type="module" id="histogram-inserter" data-importance='${importanceJson}' data-labels='${labelsJson}' nonce="${nonce}" src="${scriptUri}"></script>
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
