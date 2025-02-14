// The module 'vscode' contains the VS Code extensibility API
import * as fs from "fs";
import * as vscode from "vscode";
import * as path from "path";
import {
  loadPositionHistory,
  savePositionHistory,
  addLastLocationToHistory,
  getPositionHistory,
  categorizePositionsByFileName,
  resetPositionHistory,
} from "./location-tracking";
import { HotspotsProvider, revealNodeLocation } from "./HotspotsProvider";
import { registerWebviewVisualization } from "./WebviewVisualization";
import { registerWebviewPanelHistogram } from "./WebviewPanelHistogram.js";
import { HistogramViewProvider } from "./HistogramViewProvider.js";
import { enrichHotspotsByType } from "./HotspotsGrouper";
import { LocationTracker } from "./LocationTracker";
import { NavigationHistory } from "./NavigationHistory";
import { HotspotLLMAnalyzer } from "./HotspotsLLMAnalyzer";

let backwardsStatusBarItem: vscode.StatusBarItem;
let forwardsStatusBarItem: vscode.StatusBarItem;

var storageLocation: vscode.Uri | undefined;
var locationUpdater: NodeJS.Timeout; // update location history in regular intervals

let logFilePath: string;
let currentLogDate: string;

function initializeLogFile(context: vscode.ExtensionContext) {
  const storageLocation = context.storageUri || context.globalStorageUri;
  if (storageLocation) {
    updateLogFilePath(storageLocation);
    logMessage(storageLocation, `Log initialized: ${new Date().toISOString()}`);
  } else {
    vscode.window.showErrorMessage(
      "Unable to initialize log file. Storage location not available."
    );
  }
}

function updateLogFilePath(storageLocation: vscode.Uri) {
  const logDate = new Date().toISOString().split("T")[0];
  if (currentLogDate !== logDate) {
    currentLogDate = logDate;
    logFilePath = path.join(storageLocation.fsPath, `navext_${logDate}.log`);
  }
}

export function logMessage(storageLocation: vscode.Uri, message: string) {
  if (logFilePath) {
    const now = new Date();
    // Format to local timezone
    const timestamp = now.toLocaleString("en-GB", {
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      hour12: false, // Optional: Disable 12-hour format
    });
    const logEntry = `[${timestamp}] ${message}\n`;
    fs.appendFileSync(logFilePath, logEntry);
  } else {
    vscode.window.showErrorMessage(
      "Log file path is undefined. Log entry: " + message
    );
  }
}

function captureVSCodeLogs(context: vscode.ExtensionContext) {
  const storageLocation =
    context.storageUri ||
    context.globalStorageUri ||
    vscode.Uri.file(context.extensionPath);
  if (!storageLocation) {
    vscode.window.showErrorMessage(
      "No valid storage location available for logging."
    );
    return;
  }

  logMessage(storageLocation, "Capturing VS Code logs...");

  vscode.workspace.onDidOpenTextDocument((doc) => {
    logMessage(storageLocation, `Document opened: ${doc.uri.fsPath}`);
  });

  vscode.workspace.onDidChangeTextDocument((event) => {
    logMessage(
      storageLocation,
      `Document changed: ${event.document.uri.fsPath}`
    );
  });

  vscode.workspace.onDidSaveTextDocument((doc) => {
    logMessage(storageLocation, `Document saved: ${doc.uri.fsPath}`);
  });

  vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (editor) {
      logMessage(
        storageLocation,
        `Active editor changed to: ${editor.document.uri.fsPath}`
      );
    }
  });

  logMessage(storageLocation, "VS Code logs are now being captured.");
}

export function activate(context: vscode.ExtensionContext) {
  initializeLogFile(context);
  logMessage(
    context.storageUri || context.globalStorageUri!,
    "Extension activated."
  );

  process.on("uncaughtException", (error) => {
    const errorMessage = `Uncaught exception occurred: ${error.name} - ${error.message}\nStack: ${error.stack}`;
    logMessage(context.storageUri || context.globalStorageUri!, errorMessage);
  });

  process.on("unhandledRejection", (reason: any) => {
    const errorDetails =
      reason instanceof Error
        ? `Unhandled rejection: ${reason.name} - ${reason.message}\nStack: ${reason.stack}`
        : `Unhandled rejection: ${reason}`;
    logMessage(context.storageUri || context.globalStorageUri!, errorDetails);
  });

  captureVSCodeLogs(context);

  console.log(
    'Congratulations, your extension "grandfilenavigator" is now active!'
  );

  vscode.window.showInformationMessage(
    `Log file is located at: ${logFilePath}`
  );

  LocationTracker.initialize();
  NavigationHistory.initialize();

  storageLocation = context.storageUri;

  if (storageLocation === undefined) {
    vscode.window.showInformationMessage("Storage location not defined");
  } else {
    if (!fs.existsSync(storageLocation.fsPath)) {
      fs.mkdirSync(storageLocation.fsPath);
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

  vscode.commands.registerCommand("grandFileNavigator.resetData", () => {
    resetPositionHistory(storageLocation);
    //vscode.window.showInformationMessage(`Grouped Hotspots: ${JSON.stringify(groupedHotspots)}`);
  });

  vscode.commands.registerCommand("grandfilenavigator.jumpBackwards", () =>
    NavigationHistory.moveToPreviousPosition()
  );

  vscode.commands.registerCommand("grandfilenavigator.jumpForwards", () =>
    NavigationHistory.moveToNextPosition()
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

  // Set up status bar items.
  backwardsStatusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    9
  );
  backwardsStatusBarItem.command = "grandfilenavigator.jumpBackwards";

  forwardsStatusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    8
  );
  forwardsStatusBarItem.command = "grandfilenavigator.jumpForwards";

  function updateNavigation() {
    NavigationHistory.updateLocation();
    histogramViewProvider.updateNavigation(
      NavigationHistory.hasPreviousPosition(),
      NavigationHistory.hasNextPosition(),
      NavigationHistory.getPreviousRanges(),
      NavigationHistory.getNextRanges()
    );
    updateBackwardsStatusBarItem();
    updateForwardsStatusBarItem();
  }

  async function updateEnrichedHotspots() {
    const hotspots = getPositionHistory();
    if (!hotspots) {
      vscode.window.showErrorMessage("No hotspots found.");
      return;
    }
    await enrichHotspotsByType(hotspots, context);
  }

  vscode.window.onDidChangeActiveTextEditor(async () => {
    updateNavigation();

    if (LocationTracker.shouldUpdateTracking()) {
      addLastLocationToHistory(context);
      await updateEnrichedHotspots(); // TODO: Only update current file.
    }
    histogramViewProvider.updateHistogramData();
    LocationTracker.updateLocationTracking();
  });

  vscode.window.onDidChangeTextEditorVisibleRanges(async () => {
    updateNavigation();

    if (LocationTracker.shouldUpdateTracking()) {
      addLastLocationToHistory(context);
      await updateEnrichedHotspots(); // TODO: Only update current file.
    }
    LocationTracker.updateLocationTracking();

    const visibleRanges = LocationTracker.lastVisibleRanges;
    if (visibleRanges !== undefined) {
      histogramViewProvider.indicateFileLocation(
        visibleRanges[0].start.line + 1,
        visibleRanges.at(-1)?.end.line! + 1
      );
    }
  });

  locationUpdater = setInterval(() => {
    if (LocationTracker.shouldUpdateTracking()) {
      addLastLocationToHistory(context);
    }
  }, 1000);

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
  const storageLocation: vscode.Uri | undefined = context?.storageUri;

  if (storageLocation) {
    savePositionHistory(storageLocation);
    logMessage(storageLocation, "Extension deactivated.");
  } else {
    vscode.window.showWarningMessage(
      "Storage location is not defined. Unable to save position history."
    );
  }

  clearInterval(locationUpdater);
  const location = context?.storageUri || storageLocation;
  if (location !== undefined) {
    savePositionHistory(location);
  }
}

function updateBackwardsStatusBarItem(): void {
  if (NavigationHistory.hasPreviousPosition()) {
    let currentLocation = NavigationHistory.getCurrentLocation();
    var previousPosition = NavigationHistory.getPreviousPositions(1, false)[0]!;
    let statusBarText = previousPosition.range.start.line.toString();
    if (previousPosition.relativePath === currentLocation?.relativePath) {
      statusBarText = "line " + statusBarText;
    } else {
      statusBarText =
        previousPosition.relativePath.split(new RegExp("/")).pop() +
        ":" +
        statusBarText;
    }
    backwardsStatusBarItem.text = `← ${statusBarText}`;
    backwardsStatusBarItem.show();
  } else {
    backwardsStatusBarItem.hide();
  }
}

function updateForwardsStatusBarItem(): void {
  if (NavigationHistory.hasNextPosition()) {
    let currentLocation = NavigationHistory.getCurrentLocation();
    var nextPosition = NavigationHistory.getNextLocations(1, false)[0]!;
    let statusBarText = nextPosition.range.start.line.toString();
    if (nextPosition.relativePath === currentLocation?.relativePath) {
      statusBarText = "line " + statusBarText;
    } else {
      statusBarText =
        nextPosition.relativePath.split(new RegExp("/")).pop() +
        ":" +
        statusBarText;
    }
    forwardsStatusBarItem.text = `→ ${statusBarText}`;
    forwardsStatusBarItem.show();
  } else {
    forwardsStatusBarItem.hide();
  }
}
