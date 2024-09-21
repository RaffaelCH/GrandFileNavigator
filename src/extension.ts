// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { existsSync, mkdirSync } from "fs";
import * as vscode from "vscode";
import {
  loadPositionHistory,
  savePositionHistory,
  updateLocationTracking,
  categorizePositionsByFileName,
  getPositionHistory
} from "./location-tracking";
import { HotspotsProvider, revealLocation } from "./HotspotsProvider";
import { registerWebviewVisualization } from "./WebviewVisualization";
import { enrichHotspotsByType } from "./HotspotsGrouper";

var storageLocation: vscode.Uri | undefined;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  console.log(
    'Congratulations, your extension "grandfilenavigator" is now active!'
  );

  storageLocation = context.storageUri;

  if (storageLocation === undefined) {
    vscode.window.showInformationMessage("storage location not defined");
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
  vscode.commands.registerCommand("hotspots.openRange", revealLocation);

    // Function to enrich and save hotspots whenever location tracking is updated
    async function updateEnrichedHotspots() {
      const hotspots = getPositionHistory();
      if (!hotspots) {
        vscode.window.showErrorMessage('No hotspots found.');
        return;
      }
  
      const enrichedHotspots = await enrichHotspotsByType(hotspots, context);
      //vscode.window.showInformationMessage(`Enriched Hotspots updated with ${enrichedHotspots.length} entries.`);
    }


  vscode.window.onDidChangeActiveTextEditor(async () => {
    updateLocationTracking();
    console.log("Updated location tracking after active editor change.");
    const fileCounts = categorizePositionsByFileName();
    console.log("File counts after active editor change:", fileCounts);
    await updateEnrichedHotspots();
    await provider.updateHistogramData();
  });

  vscode.window.onDidChangeTextEditorVisibleRanges(async () => {
    updateLocationTracking();
    console.log("Updated location tracking after visible ranges change.");
    const fileCounts = categorizePositionsByFileName();
    console.log("File counts after visible ranges change:", fileCounts);
    await updateEnrichedHotspots();
  });

  registerWebviewVisualization(context);

  // Initial categorization after loading position history
  const fileCounts = categorizePositionsByFileName();
  console.log("Initial file counts:", fileCounts);

  const showHistogramCommand = vscode.commands.registerCommand('extension.showHistogram', () => {
    const panel = vscode.window.createWebviewPanel(
      'fileAccessHistogram',
      'File Access Histogram',
      vscode.ViewColumn.One,
      {}
    );
  
    //const fileCounts = categorizePositionsByFileName();
    panel.webview.html = getWebviewContent(fileCounts);
  });
  
  context.subscriptions.push(showHistogramCommand);

  const analyzeHotspotsCommand = vscode.commands.registerCommand('extension.analyzeHotspots', async () => {
    const hotspots = getPositionHistory();

    if (!hotspots) {
        vscode.window.showErrorMessage('No hotspots found.');
        return;
    }

    const groupedHotspots = await enrichHotspotsByType(hotspots, context);

    vscode.window.showInformationMessage(`Grouped Hotspots: ${JSON.stringify(groupedHotspots)}`);
});

context.subscriptions.push(analyzeHotspotsCommand);

}


export function deactivate(context: vscode.ExtensionContext) {
  var location: vscode.Uri | undefined;

  if (context === undefined || context.storageUri === undefined) {
    location = storageLocation;
  } else {
    location = context.storageUri;
  }

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
  const textAreaHeight = 100; // Extra space for the file names

  // Generate random colors for each bar
  const colors = labels.map(() => hsl(${Math.random() * 360}, 70%, 60%));

  let barsHtml = data.map((count, index) => {
    const barHeight = (count / maxCount) * svgHeight;
    const color = colors[index];
    const xPosition = index * barWidth + barWidth / 2;

    // Determine whether to place the count inside or above the bar
    const yTextPosition = barHeight > 20 ? svgHeight - barHeight + 15 : svgHeight - barHeight - 20;
    const textAnchor = barHeight > 20 ? "middle" : "start";

    return 
      <rect x="${index * barWidth}" y="${svgHeight - barHeight}" width="${barWidth - 2}" height="${barHeight}" fill="${color}"></rect>
      <text x="${xPosition}" y="${yTextPosition}" fill="white" text-anchor="middle" font-size="12">${count}</text>
      <text x="${xPosition}" y="${svgHeight + 10}" fill="white" text-anchor="middle" font-size="10" transform="rotate(-90, ${xPosition}, ${svgHeight + 10})">${labels[index]}</text>
    ;
  }).join('');

  return 
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>File Access Histogram</title>
      <style>
        text {
          word-wrap: break-word;
        }
      </style>
    </head>
    <body>
      <h1>File Access Histogram</h1>
      <svg width="${svgWidth}" height="${svgHeight + textAreaHeight}">
        ${barsHtml}
      </svg>
    </body>
    </html>
  ;
}
