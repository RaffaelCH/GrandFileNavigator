import * as vscode from "vscode";

export function updateLocationTracking(locationData: PositionHistory) {
  if (vscode.window.activeTextEditor === undefined) {
    return;
  }

  var visibleRange = vscode.window.activeTextEditor.visibleRanges[0];
  //var selection = vscode.window.activeTextEditor?.selection;

  // Only track .java files.
  // if (vscode.window.activeTextEditor?.document.languageId !== "java") {
  //   return;
  // }

  var fileUri = vscode.window.activeTextEditor?.document.uri;

  if (fileUri.scheme !== "file") {
    return;
  }
  let fileIdentifier = fileUri.toString();

  // Strip path to workspace from id to shorten identifier paths.
  let workspace = vscode.workspace.getWorkspaceFolder(fileUri);
  if (workspace && fileIdentifier.startsWith(workspace.uri.toString())) {
    fileIdentifier = fileIdentifier.replace(workspace.uri.toString(), "");
  }

  var identifierKeys = fileIdentifier.split("/").filter((el) => el !== "");

  var currentLocationDataNode = locationData;
  for (var i = 0; i < identifierKeys.length; ++i) {
    let nextKey = identifierKeys[i];
    let positionNode = currentLocationDataNode[nextKey];
    if (i < identifierKeys.length - 1) {
      if (positionNode === undefined) {
        currentLocationDataNode[nextKey] = new PositionHistory();
        currentLocationDataNode = currentLocationDataNode[nextKey];
      }
      if (currentLocationDataNode[nextKey] instanceof PositionHistory) {
        currentLocationDataNode = currentLocationDataNode[nextKey];
      }
    } else {
      if (positionNode === undefined) {
        currentLocationDataNode[nextKey] = [];
      }
      let positionDataArray = currentLocationDataNode[nextKey];
      if (Array.isArray(positionDataArray)) {
        positionDataArray.push(
          new PositionData(visibleRange.start.line, visibleRange.end.line)
        );
      }
    }
  }
}

export class PositionData {
  constructor(startLine: number, endLine: number) {
    this.startLine = startLine;
    this.endLine = endLine;
  }
  startLine: number;
  endLine: number;
  // TODO: Add more info (e.g., class/method).
}

export class PositionHistory {
  [key: string]: PositionHistory | PositionData[] | undefined;
}
