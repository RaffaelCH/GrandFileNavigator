import * as vscode from "vscode";
import { getFileHistogramData } from "./loadHistogramData.js";
import {
  getCondensedImportanceArray,
  updateHotspotsData,
} from "./HotspotsGrouper.js";
import SidebarNode from "./sidebar_types/sidebarNode.js";
import { NodeType } from "./sidebar_types/NodeType.js";
import * as path from "path";
import { adaptImportanceArray } from "./adapters/hotspotsGrouper.js";
import { NavigationHistory } from "./NavigationHistory.js";
import { InteractionTracker } from "./utils/interactionTracker.js";
import { getPositionHistory } from "./location-tracking.js";

export class HistogramViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "grandfilenavigator-histogram";

  private _view?: vscode.WebviewView;
  private _visualizationType: string = "histogram";
  private viewUpdateTimer = setInterval(() => this.updateView(), 5000);
  private hoverDataUpdateTimer = setInterval(() => {
    this.updateHoverData();
  }, 100);

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public async resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.onDidChangeVisibility((e) =>
      InteractionTracker.changeSidebarVisibility(webviewView.visible)
    );

    webviewView.webview.options = {
      enableScripts: true, // Allow scripts in the webview.
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = await this._getHtmlForWebview(
      webviewView.webview
    );

    this.setupMessageHandlers();
    this.updateView();
  }

  public async updateView() {
    if (this._visualizationType === "histogram") {
      this.updateHistogramData();
    } else {
      this.updateHotspotsData();
      this.addHotspotsEventHandlers();
    }
  }

  public async indicateFileLocation(startLine: number, endLine: number) {
    if (!this._view) {
      return;
    }

    let command =
      this._visualizationType === "histogram"
        ? "indicateHistogramRange"
        : "indicateHotspotRange";

    this._view.webview.postMessage({
      command: command,
      startLine: startLine,
      endLine: endLine,
    });
  }

  public async updateHoverData() {
    if (!this._view || this._visualizationType !== "hotspots") {
      return;
    }

    this._view.webview.postMessage({
      command: "updateHoverData",
    });
  }

  public async updateNavigation(
    hasPrevious: boolean,
    hasNext: boolean,
    previousRanges: (vscode.Range | null)[],
    nextRanges: (vscode.Range | null)[]
  ) {
    if (!this._view) {
      return;
    }

    this._view.webview.postMessage({
      command: "updateNavigationButtons",
      hasPrevious: hasPrevious,
      hasNext: hasNext,
    });

    this._view.webview.postMessage({
      command: "updateLocationIndicators",
      previousRanges: JSON.stringify(previousRanges),
      nextRanges: JSON.stringify(nextRanges),
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

    this.indicateFileLocation(
      activeTextEditor.visibleRanges[0].start.line + 1,
      activeTextEditor.visibleRanges.at(-1)?.end.line! + 1
    );
  }

  public async updateHotspotsData() {
    if (!this._view) {
      return;
    }

    var activeTextEditor = vscode.window.activeTextEditor;
    if (!activeTextEditor) {
      return;
    }

    let currentFileName = activeTextEditor?.document.fileName;

    let positionHistory = getPositionHistory();
    updateHotspotsData(positionHistory);

    var importanceData = getCondensedImportanceArray();
    importanceData = importanceData.filter((importanceElement) =>
      currentFileName.endsWith(importanceElement.fileName)
    );

    var hotspotsData = adaptImportanceArray(importanceData);

    // TODO: Change based on number of methods, fields, etc.
    // TODO: Add enclosing (hierarchical) information?
    var relevantSymbolTypes = [NodeType.Method];

    if (currentFileName.endsWith(".js") || currentFileName.endsWith(".ts")) {
      relevantSymbolTypes.push(NodeType.Unknown);
    }

    hotspotsData = hotspotsData.filter((hotspot) =>
      relevantSymbolTypes.includes(hotspot.nodeType)
    );

    hotspotsData.sort((a, b) => a.startLine - b.startLine);

    this._view.webview.postMessage({
      command: "reloadHotspotsData",
      hotspotNodes: hotspotsData,
    });

    this.indicateFileLocation(
      activeTextEditor.visibleRanges[0].start.line + 1,
      activeTextEditor.visibleRanges.at(-1)?.end.line! + 1
    );
  }

  public async addHotspotsEventHandlers() {
    if (this._view) {
      this._view.webview.postMessage({
        command: "addHotspotsEvents",
      });
    }
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
            InteractionTracker.switchSidebarView("hotspots");
            this.updateHotspotsData();
          } else {
            this._visualizationType = "histogram";
            InteractionTracker.switchSidebarView("histogram");
            this.updateHistogramData();
          }
        case "showRange":
          const targetRange = new vscode.Range(
            new vscode.Position(message.startLine, 0),
            new vscode.Position(message.endLine, 1)
          );
          InteractionTracker.changedVisibleRanges(
            vscode.window.activeTextEditor?.document.fileName,
            vscode.window.activeTextEditor?.visibleRanges.at(0),
            targetRange
          );
          vscode.window.activeTextEditor?.revealRange(targetRange);
          return;
        case "navigateBackwards":
          InteractionTracker.clickJumpButton(true);
          vscode.commands.executeCommand("grandfilenavigator.jumpBackwards");
          return;
        case "navigateForwards":
          InteractionTracker.clickJumpButton(false);
          vscode.commands.executeCommand("grandfilenavigator.jumpForwards");
          return;
        case "toggleTracking":
          InteractionTracker.toggleTracking();
          return;
      }
    }, undefined);
  }

  private async _getHtmlForWebview(webview: vscode.Webview) {
    // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
    const insertHistogramUri = webview.asWebviewUri(
      vscode.Uri.file(
        path.join(
          this._extensionUri.fsPath,
          "resources",
          "webview_scripts",
          "insertHistogram.js"
        )
      )
    );

    const insertHotspotsUri = webview.asWebviewUri(
      vscode.Uri.file(
        path.join(
          this._extensionUri.fsPath,
          "resources",
          "webview_scripts",
          "insertHotspots.js"
        )
      )
    );

    const messageHandlerUri = webview.asWebviewUri(
      vscode.Uri.file(
        path.join(
          this._extensionUri.fsPath,
          "resources",
          "webview_scripts",
          "visualizationMessageHandler.js"
        )
      )
    );

    var activeTextEditor = vscode.window.activeTextEditor;
    if (!activeTextEditor) {
      return "No file open";
    }

    // Use a nonce to only allow a specific script to be run.
    const nonce = getNonce();

    return `<!DOCTYPE html>
			<html lang="en" style="width: 100%; height: 100%;" >
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
        <script id="histogram-inserter" nonce="${nonce}" src="${insertHistogramUri}"></script>
        <script id="hotspots-inserter" nonce="${nonce}" src="${insertHotspotsUri}"></script>
        <script id="message-handler" nonce="${nonce}" src="${messageHandlerUri}"></script>
			</head>
			<body style="width:90%; height:95%; overflow-x: hidden; overflow-y: auto; padding: 10px;" >
        <div style="margin: 10px; display: flex; justify-content: space-around;" id="toggle-tracking">
          <button style="background-color: white; color: black;" onclick="vscodeApi.postMessage({command: 'toggleTracking'})">Start/Stop Task</button>
        </div>
        <div style="margin: 10px; display: flex; justify-content: space-around; flex-direction: row;">
          <button id="nav-button-backward" style="background-color: white; color: black;"  onclick="vscodeApi.postMessage({command: 'navigateBackwards'})">Jump Backward</button>
          <button id="nav-button-forward" style="background-color: magenta; color: black;" onclick="vscodeApi.postMessage({command: 'navigateForwards'})">Jump Forward</button>
        </div>
        <div style="display: flex; justify-content: space-around; flex-direction: column;">
          <button onclick="vscodeApi.postMessage({command: 'switchVisualization'})">Switch Visualization</button>
          <p id="errorMessage"></p>
        </div>
        <svg id="visualization-container" style="width:100%; height:100%;" />
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
