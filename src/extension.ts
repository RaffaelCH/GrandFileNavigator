// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { existsSync, mkdirSync } from "fs";
import * as vscode from "vscode";
import {
  loadPositionHistory,
  savePositionHistory,
  updateLocationTracking,
  categorizePositionsByFileName
} from "./location-tracking";
import { HotspotsProvider, revealLocation } from "./HotspotsProvider";
import { registerWebviewVisualization } from "./WebviewVisualization";

var storageLocation: vscode.Uri | undefined;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  console.log('Congratulations, your extension "grandfilenavigator" is now active!');

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

  vscode.window.onDidChangeActiveTextEditor(() => {
    updateLocationTracking();
    console.log("Updated location tracking after active editor change.");
    const fileCounts = categorizePositionsByFileName();
    console.log("File counts after active editor change:", fileCounts);
  });

  vscode.window.onDidChangeTextEditorVisibleRanges(() => {
    updateLocationTracking();
    console.log("Updated location tracking after visible ranges change.");
    const fileCounts = categorizePositionsByFileName();
    console.log("File counts after visible ranges change:", fileCounts);
  });

  registerWebviewVisualization(context);

  // Initial categorization after loading position history
  const fileCounts = categorizePositionsByFileName();
  console.log("Initial file counts:", fileCounts);

  vscode.commands.registerCommand('extension.showHistogram', () => {
    const panel = vscode.window.createWebviewPanel(
      'fileAccessHistogram',
      'File Access Histogram',
      vscode.ViewColumn.One,
      {}
    );
  
    const fileCounts = categorizePositionsByFileName();
    panel.webview.html = getWebviewContent(fileCounts);
  });
  
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
  const labels = Object.keys(fileCounts).map(fileName => `'${fileName}'`);
  const data = Object.values(fileCounts);

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>File Access Histogram</title>
      <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    </head>
    <body>
      <canvas id="myChart" width="400" height="400"></canvas>
      <script>
        const ctx = document.getElementById('myChart').getContext('2d');
        const myChart = new Chart(ctx, {
          type: 'bar',
          data: {
            labels: [${labels.join(',')}],
            datasets: [{
              label: 'File Access Counts',
              data: [${data.join(',')}],
              backgroundColor: 'rgba(75, 192, 192, 0.2)',
              borderColor: 'rgba(75, 192, 192, 1)',
              borderWidth: 1
            }]
          },
          options: {
            scales: {
              y: {
                beginAtZero: true
              }
            }
          }
        });
      </script>
    </body>
    </html>
  `;
}



