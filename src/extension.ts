// The module 'vscode' contains the VS Code extensibility API
import { existsSync, mkdirSync } from "fs";
import * as vscode from "vscode";
import {
  loadPositionHistory,
  savePositionHistory,
  addLastLocationToHistory,
  getPositionHistory,
  categorizePositionsByFileName
} from "./location-tracking";
import { HotspotsProvider, revealNodeLocation } from "./HotspotsProvider";
import { registerWebviewVisualization } from "./WebviewVisualization";
import { registerWebviewPanelHistogram } from "./WebviewPanelHistogram.js";
import { HistogramViewProvider } from "./HistogramViewProvider.js";
import { enrichHotspotsByType } from "./HotspotsGrouper";
import { LocationTracker } from "./LocationTracker";

var storageLocation: vscode.Uri | undefined;

export function activate(context: vscode.ExtensionContext) {
  console.log(
    'Congratulations, your extension "grandfilenavigator" is now active!'
  );

  LocationTracker.initialize();

  storageLocation = context.storageUri;

  if (storageLocation === undefined) {
    vscode.window.showInformationMessage("Storage location not defined");
  } else {
    if (!existsSync(storageLocation.fsPath)) {
      mkdirSync(storageLocation.fsPath);
    }

    console.log("Storage location: " + storageLocation.fsPath);
    loadPositionHistory(storageLocation);
  }

  const rootPath =
    vscode.workspace.workspaceFolders &&
    vscode.workspace.workspaceFolders.length > 0
      ? vscode.workspace.workspaceFolders[0].uri.fsPath
      : undefined;

  const hotspotsProvider = new HotspotsProvider(rootPath);
  vscode.window.registerTreeDataProvider("hotspots", hotspotsProvider);
  vscode.commands.registerCommand("hotspots.refreshEntry", () =>
    hotspotsProvider.refresh()
  );
  vscode.commands.registerCommand(
    "hotspots.openNodeLocation",
    revealNodeLocation
  );

  registerWebviewVisualization(context);
  registerWebviewPanelHistogram(context);

  const showHistogramCommand = vscode.commands.registerCommand('grandFileNavigator.showFileHistogram', () => {
    vscode.window.showInformationMessage('Showing File Access Histogram');

    const fileCounts = categorizePositionsByFileName();  // Fetch file counts first

    const panel = vscode.window.createWebviewPanel(
      'fileAccessHistogram',
      'File Access Histogram',
      vscode.ViewColumn.One,
      {}
    );

    panel.webview.html = getWebviewContent(fileCounts);
  });

  context.subscriptions.push(showHistogramCommand);

  const histogramViewProvider = new HistogramViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      HistogramViewProvider.viewType,
      histogramViewProvider
    )
  );

  async function updateEnrichedHotspots() {
    const hotspots = getPositionHistory();
    if (!hotspots) {
      vscode.window.showErrorMessage("No hotspots found.");
      return;
    }
    await enrichHotspotsByType(hotspots, context);
  }

  vscode.window.onDidChangeActiveTextEditor(async () => {
    if (LocationTracker.shouldUpdateTracking()) {
      addLastLocationToHistory();
    }
    histogramViewProvider.updateHistogramData();
    LocationTracker.updateLocationTracking();
    await updateEnrichedHotspots();
  });

  vscode.window.onDidChangeTextEditorVisibleRanges(async () => {
    if (LocationTracker.shouldUpdateTracking()) {
      addLastLocationToHistory();
    }
    LocationTracker.updateLocationTracking();

    const visibleRanges = LocationTracker.lastVisibleRanges;
    if (visibleRanges !== undefined) {
      histogramViewProvider.indicateFileLocation(
        visibleRanges[0].start.line,
        visibleRanges.at(-1)?.end.line!
      );
    }
    await updateEnrichedHotspots();
  });
}

export function deactivate(context: vscode.ExtensionContext) {
  const location = context?.storageUri || storageLocation;
  if (location !== undefined) {
    savePositionHistory(location);
  }
}

function getWebviewContent(fileCounts: { [fileName: string]: number }): string {
  const labels = Object.keys(fileCounts).map(filePath => filePath.split('/').pop());
  const data = Object.values(fileCounts);

  const maxCount = Math.max(...data);
  const svgHeight = 400;
  const svgWidth = 800;
  const barWidth = svgWidth / data.length;
  const textAreaHeight = 100;

  const colors = labels.map(() => `hsl(${Math.random() * 360}, 70%, 60%)`);

  const barsHtml = data.map((count, index) => {
    const barHeight = (count / maxCount) * svgHeight;
    const color = colors[index];
    const xPosition = index * barWidth + barWidth / 2;

    const yTextPosition = barHeight > 20 ? svgHeight - barHeight + 15 : svgHeight - barHeight - 20;

    return `
      <rect x="${index * barWidth}" y="${svgHeight - barHeight}" width="${barWidth - 2}" height="${barHeight}" fill="${color}"></rect>
      <text x="${xPosition}" y="${yTextPosition}" fill="white" text-anchor="middle" font-size="12">${count}</text>
      <text x="${xPosition}" y="${svgHeight + 10}" fill="white" text-anchor="middle" font-size="10" transform="rotate(-90, ${xPosition}, ${svgHeight + 10})">${labels[index]}</text>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>File Access Histogram</title>
      <style> text { word-wrap: break-word; } </style>
    </head>
    <body>
      <h1>File Access Histogram</h1>
      <svg width="${svgWidth}" height="${svgHeight + textAreaHeight}">
        ${barsHtml}
      </svg>
    </body>
    </html>
  `;
}
