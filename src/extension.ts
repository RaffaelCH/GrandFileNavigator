// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { existsSync, mkdirSync } from "fs";
import * as vscode from "vscode";
import {
  loadPositionHistory,
  savePositionHistory,
  updateLocationTracking,
  categorizePositionsByFileName,
  getPositionHistory,
} from "./location-tracking.js";
import { HotspotsProvider, revealLocation } from "./HotspotsProvider.js";
import { registerWebviewVisualization } from "./WebviewVisualization.js";
import { registerWebviewPanelHistogram } from "./WebviewPanelHistogram.js";
import { HistogramViewProvider } from "./HistogramViewProvider.js";

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

  registerWebviewVisualization(context);

  registerWebviewPanelHistogram(context);

  console.log(getPositionHistory());

  const provider = new HistogramViewProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      HistogramViewProvider.viewType,
      provider
    )
  );

  vscode.window.onDidChangeActiveTextEditor(async () => {
    updateLocationTracking();
    console.log("Updated location tracking after active editor change.");
    const fileCounts = categorizePositionsByFileName();
    console.log("File counts after active editor change:", fileCounts);
    await provider.reloadView();
  });

  vscode.window.onDidChangeTextEditorVisibleRanges(() => {
    updateLocationTracking();
    console.log("Updated location tracking after visible ranges change.");
    const fileCounts = categorizePositionsByFileName();
    console.log("File counts after visible ranges change:", fileCounts);
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
