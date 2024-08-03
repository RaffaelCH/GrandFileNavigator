import * as vscode from "vscode";

export class PositionData {
  constructor(startLine: number, endLine: number, totalDuration: number) {
    this.startLine = startLine;
    this.endLine = endLine;
    this.totalDuration = totalDuration;
  }
  startLine: number;
  endLine: number;
  totalDuration: number; // in ms
  // TODO: Add more info (e.g., class/method).
}

export class PositionHistory {
  [key: string]: PositionHistory | PositionData[] | undefined;
}

export function getPositionHistory() {
  return positionHistory;
}

// Track user position.
var positionHistory = new PositionHistory();

var isTracking = false; // is the current window being tracked
var lastDocument: vscode.TextDocument;
var lastVisibleRanges: readonly vscode.Range[];
var lastVisibleRangeUpdate = Date.now();

//vscode.window.onDidChangeWindowState
//vscode.workspace.onDidChangeTextDocument

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
  // if (currentDocument.languageId !== "java") {
  //   return false;
  // }

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

    // no file node yet
    if (i < identifierKeys.length - 1) {
      if (positionNode === undefined) {
        currentLocationDataNode[nextKey] = new PositionHistory();
        currentLocationDataNode = currentLocationDataNode[nextKey];
      }
      if (currentLocationDataNode[nextKey] instanceof PositionHistory) {
        currentLocationDataNode = currentLocationDataNode[nextKey];
      }
    }
    // reached file node
    else {
      if (positionNode === undefined) {
        currentLocationDataNode[nextKey] = [];
      }
      let positionDataArray = currentLocationDataNode[nextKey];
      if (Array.isArray(positionDataArray)) {
        lastVisibleRanges?.forEach((visibleRange) => {
          // TODO: Compactify array.
          positionDataArray.push(
            new PositionData(
              visibleRange.start.line,
              visibleRange.end.line,
              viewDuration
            )
          );
        });
      }
    }
  }
}
