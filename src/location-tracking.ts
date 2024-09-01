import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import * as vscode from "vscode";

// Encapsulates the information about one node (hotspot).
export class RangeData {
  constructor(startLine: number, endLine: number, totalDuration: number) {
    this.startLine = startLine;
    this.endLine = endLine;
    this.totalDuration = totalDuration;
  }
  startLine: number;
  endLine: number;
  totalDuration: number; // in ms
  // TODO: Add more info (e.g., class/method, viewing/editing).
}

export class PositionHistory {
  [key: string]: PositionHistory | RangeData[] | undefined;
}

export function getPositionHistory(): PositionHistory {
  return positionHistory;
}

var backupFilename = "backup.json"; // TODO: Allow multiple files.

export function savePositionHistory(storageLocation: vscode.Uri) {
  var filePath = vscode.Uri.joinPath(storageLocation, backupFilename);
  writeFileSync(filePath.fsPath, JSON.stringify(getPositionHistory()));
}

// Load history from file.
export function loadPositionHistory(storageLocation: vscode.Uri) {
  var filePath = vscode.Uri.joinPath(storageLocation, backupFilename);
  if (existsSync(filePath.fsPath)) {
    var backupContent = readFileSync(filePath.fsPath).toString();
    var backupData = JSON.parse(backupContent);
    positionHistory = convertPositionHistoryValue(backupData);
    vscode.window.showInformationMessage("Found existing backup with data");
  } else {
    vscode.window.showInformationMessage("no backup found");
  }
}

// Tracks user position.
var positionHistory = new PositionHistory();

// Whenever the editor location changes, add previous location to history.
var isTracking = false; // is the current window being tracked
var lastDocument: vscode.TextDocument;
var lastVisibleRanges: readonly vscode.Range[];
var lastVisibleRangeUpdate = Date.now();

//vscode.window.onDidChangeWindowState
//vscode.workspace.onDidChangeTextDocument

// Adds current view to history.
export function updateLocationTracking() {
  if (shouldUpdateTracking()) {
    addLastLocationToHistory();
  }

  if (shouldTrackWindow()) {
    if (vscode.window.activeTextEditor) {
      isTracking = true;
      lastDocument = vscode.window.activeTextEditor.document;
      lastVisibleRanges = vscode.window.activeTextEditor.visibleRanges;
    }
  }

  lastVisibleRangeUpdate = Date.now();
}

// If previous position was relevant for location tracking.
function shouldUpdateTracking() {
  if (!isTracking) {
    return false;
  }

  if (Date.now() - lastVisibleRangeUpdate < 100) {
    return false;
  }

  return true;
}

function shouldTrackWindow() {
  if (!vscode.window.activeTextEditor) {
    return false;
  }

  var currentDocument = vscode.window.activeTextEditor.document;

  // Only track .java files.
  if (currentDocument.languageId !== "java") {
    return false;
  }

  if (currentDocument.uri.scheme !== "file") {
    return false;
  }

  return true;
}

function addLastLocationToHistory() {
  var viewDuration = Date.now() - lastVisibleRangeUpdate;
  let fileIdentifier = vscode.workspace.asRelativePath(lastDocument.uri);
  var identifierKeys = fileIdentifier.split("/").filter((el) => el !== "");

  var currentLocationDataNode = positionHistory;
  for (var i = 0; i < identifierKeys.length; ++i) {
    let nextKey = identifierKeys[i];
    let positionNode = currentLocationDataNode[nextKey];

    // no file node yet -> add PositionHistory
    if (i < identifierKeys.length - 1) {
      if (positionNode === undefined) {
        currentLocationDataNode[nextKey] = new PositionHistory();
        currentLocationDataNode = currentLocationDataNode[nextKey];
      }
      if (currentLocationDataNode[nextKey] instanceof PositionHistory) {
        currentLocationDataNode = currentLocationDataNode[nextKey];
      }
    }
    // reached file node -> add RangeData[]
    else {
      if (positionNode === undefined) {
        currentLocationDataNode[nextKey] = [];
      }
      let positionDataArray = currentLocationDataNode[nextKey];
      if (Array.isArray(positionDataArray)) {
        lastVisibleRanges?.forEach((visibleRange) => {
          var existingRange = positionDataArray.find(
            (range) =>
              range.startLine === visibleRange.start.line &&
              range.endLine === visibleRange.end.line
          );
          if (existingRange) {
            existingRange.totalDuration += viewDuration;
          } else {
            positionDataArray.push(
              new RangeData(
                visibleRange.start.line,
                visibleRange.end.line,
                viewDuration
              )
            );
          }
        });
      }
    }
  }
}

function convertPositionHistoryValue(
  value: any
): PositionHistory | RangeData | any {
  if ("startLine" in value && "endLine" in value && "totalDuration" in value) {
    return new RangeData(value.startLine, value.endLine, value.totalDuration);
  } else if (Array.isArray(value)) {
    let fileHistory: RangeData[] = [];
    value.forEach((entry) => {
      fileHistory.push(convertPositionHistoryValue(entry));
    });
    return fileHistory;
  } else if (isObject(value) && !(value instanceof PositionHistory)) {
    let positionHistory = new PositionHistory();
    Object.keys(value).forEach((key) => {
      positionHistory[key] = convertPositionHistoryValue(value[key]);
    });
    return positionHistory;
  } else {
    return value;
  }
}

function isObject(value: any): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function categorizePositionsByFileName(): { [fileName: string]: number } {
  const positionHistory = getPositionHistory();
  const fileCountMap: { [fileName: string]: number } = {};

  function traverseHistory(history: PositionHistory, path: string[] = []) {
    for (const key in history) {
      const value = history[key];
      if (value instanceof PositionHistory) {
        traverseHistory(value, [...path, key]);
      } else if (Array.isArray(value) && value.length > 0) {
        const fileName = [...path, key].join("/");
        fileCountMap[fileName] = (fileCountMap[fileName] || 0) + value.length;
      }
    }
  }

  traverseHistory(positionHistory);

  return fileCountMap;
}
