import * as vscode from "vscode";
import { getFileHistogramData } from "./loadHistogramData.js";
import { getImportanceArray } from "./HotspotsGrouper.js";
import SidebarNode from "./sidebar_types/SidebarNode.js";
import { NodeType } from "./sidebar_types/NodeType.js";

export class HistogramViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "grandfilenavigator-histogram";

  private _view?: vscode.WebviewView;
  private _visualizationType: string = "histogram";

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

    if (this._visualizationType === "histogram") {
      this.updateHistogramData();
    } else {
      this.updateHotspotsData();
    }
  }

  public async indicateFileLocation(visibleRange: vscode.Range) {
    if (!this._view) {
      return;
    }

    this._view.webview.postMessage({
      command: "indicateRange",
      startLine: visibleRange.start.line,
      endLine: visibleRange.end.line,
    });
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
      command: "reloadHistogramData",
      histogramNodes: histogramNodes,
    });

    this.indicateFileLocation(activeTextEditor.visibleRanges[0]); // TODO: Include all ranges.
  }

  public async updateHotspotsData() {
    if (!this._view) {
      return;
    }

    var activeTextEditor = vscode.window.activeTextEditor;
    if (!activeTextEditor) {
      return;
    }

    var hotspotsData = getImportanceArray();
    // TODO: Filter based on current file.
    // hotspotsData = hotspotsData.filter(
    //   (data) => data[1] === activeTextEditor?.document.fileName
    // );

    // TODO: Adjust hotspots type to be more structured.
    var hotspotNodes = hotspotsData.map(
      (data) =>
        new SidebarNode(
          data[2],
          data[0],
          NodeType.Other, // TODO: Replace with actual node type.
          data[1],
          parseInt(data[2].split("-")[0]),
          parseInt(data[2].split("-")[1])
        )
    );
    hotspotNodes.sort((node) => node.metricValue);
    hotspotNodes = hotspotNodes.slice(-6); // take 6 elements with highest metrics

    this._view.webview.postMessage({
      command: "reloadHotspotsData",
      hotspotNodes: hotspotNodes,
    });
  }

  private setupMessageHandlers() {
    if (this._view === undefined) {
      return;
    }

    // Handle messages from the (histogram) webview.
    this._view.webview.onDidReceiveMessage((message) => {
      switch (message.command) {
        case "switchVisualization":
          if (this._visualizationType === "histogram") {
            this._visualizationType = "hotspots";
            this.updateHotspotsData();
          } else {
            this._visualizationType = "histogram";
            this.updateHistogramData();
          }
        case "showRange":
          vscode.window.activeTextEditor?.revealRange(
            new vscode.Range(
              new vscode.Position(message.startLine, 0),
              new vscode.Position(message.endLine, 1)
            )
          );
          return;
        case "showLocation": // TODO: Handle jumping to other files.
          vscode.window.activeTextEditor?.revealRange(
            new vscode.Range(
              new vscode.Position(message.startLine, 0),
              new vscode.Position(message.endLine, 1)
            )
          );
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
    const insertHotspotsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "src",
        "webview_scripts",
        "insertHotspots.js"
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
				
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${
          webview.cspSource
        }; script-src 'nonce-${nonce}';">
        -->

				<meta name="viewport" content="width=device-width, height=device-height initial-scale=1.0">
        <script>
          const vscodeApi = acquireVsCodeApi(); // Set global const with reference to keep track of it.
        </script>
        <script id="histogram-inserter" nonce="${nonce}" src="${insertHistogramUri}"></script>
        <script id="hotspots-inserter" nonce="${nonce}" src="${insertHotspotsUri}"></script>
        <script id="message-handler" nonce="${nonce}" src="${messageHandlerUri}"></script>
			</head>
			<body>
        <p id="errorMessage"></p>
        <button onclick="vscodeApi.postMessage({command: 'switchVisualization'})">Switch Visualization</button>
        <svg id="histogram-container" style="width:100%;height:800px;">
        <div id="hotspots-container" style="width:100%; display: flex; align-items: center; justify-content: center; flex-direction:column;">
        ${
          this._visualizationType === "histogram"
            ? `<script>insertHistogram();</script>`
            : `<script>insertHotspots();</script>`
        }
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
