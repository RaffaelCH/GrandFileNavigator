// The module 'vscode' contains the VS Code extensibility API
import { existsSync, mkdirSync } from "fs";
import * as vscode from "vscode";
import {
  loadPositionHistory,
  savePositionHistory,
  addLastLocationToHistory,
  getPositionHistory,
  categorizePositionsByFileName,
} from "./location-tracking";
import { HotspotsProvider, revealNodeLocation } from "./HotspotsProvider";
import { registerWebviewVisualization } from "./WebviewVisualization";
import { registerWebviewPanelHistogram } from "./WebviewPanelHistogram.js";
import { HistogramViewProvider } from "./HistogramViewProvider.js";
import { enrichHotspotsByType } from "./HotspotsGrouper";
import { LocationTracker } from "./LocationTracker";
import { HotspotLLMAnalyzer } from './HotspotsLLMAnalyzer';

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
      addLastLocationToHistory(context);
      await updateEnrichedHotspots();
    }
    histogramViewProvider.updateHistogramData();
    LocationTracker.updateLocationTracking();
  });

  vscode.window.onDidChangeTextEditorVisibleRanges(async () => {
    if (LocationTracker.shouldUpdateTracking()) {
      addLastLocationToHistory(context);
      await updateEnrichedHotspots();
    }
    LocationTracker.updateLocationTracking();

    const visibleRanges = LocationTracker.lastVisibleRanges;
    if (visibleRanges !== undefined) {
      histogramViewProvider.indicateFileLocation(
        visibleRanges[0].start.line,
        visibleRanges.at(-1)?.end.line!
      );
    }
  });

  const analyzeHotspotsCommand = vscode.commands.registerCommand(
    "extension.analyzeHotspots",
    async () => {
      const groupedHotspots = updateEnrichedHotspots();
      //vscode.window.showInformationMessage(`Grouped Hotspots: ${JSON.stringify(groupedHotspots)}`);
    }
  );



  //HotspotLLMAnalyzer.registerAnalyzeHotspotCommand(context, hotspotsProvider);

  context.subscriptions.push(analyzeHotspotsCommand);
}

export function deactivate(context: vscode.ExtensionContext) {
  const location = context?.storageUri || storageLocation;
  if (location !== undefined) {
    savePositionHistory(location);
  }
}
