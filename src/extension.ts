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
} from "./location-tracking";
import { HotspotsProvider, revealNodeLocation } from "./HotspotsProvider";
import { registerWebviewVisualization } from "./WebviewVisualization";
import { registerWebviewPanelHistogram } from "./WebviewPanelHistogram.js";
import { HistogramViewProvider } from "./HistogramViewProvider.js";
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
  vscode.commands.registerCommand(
    "hotspots.openNodeLocation",
    revealNodeLocation
  );

  registerWebviewVisualization(context);
  registerWebviewPanelHistogram(context);

  const provider = new HistogramViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      HistogramViewProvider.viewType,
      provider
    )
  );

  // Function to enrich and save hotspots whenever location tracking is updated
  async function updateEnrichedHotspots() {
    const hotspots = getPositionHistory();
    if (!hotspots) {
      vscode.window.showErrorMessage("No hotspots found.");
      return;
    }
    await enrichHotspotsByType(hotspots, context);
  }

  vscode.window.onDidChangeActiveTextEditor(async () => {
    updateLocationTracking();
    provider.updateHistogramData();
    await updateEnrichedHotspots();
  });

  vscode.window.onDidChangeTextEditorVisibleRanges(async () => {
    updateLocationTracking();
    await updateEnrichedHotspots();
  });

  const analyzeHotspotsCommand = vscode.commands.registerCommand(
    "extension.analyzeHotspots",
    async () => {
      const hotspots = getPositionHistory();

      if (!hotspots) {
        vscode.window.showErrorMessage("No hotspots found.");
        return;
      }

      const groupedHotspots = await enrichHotspotsByType(hotspots, context);

      vscode.window.showInformationMessage(
        `Grouped Hotspots: ${JSON.stringify(groupedHotspots)}`
      );
    }
  );

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
