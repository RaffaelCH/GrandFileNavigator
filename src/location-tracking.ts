import { existsSync, readFileSync, writeFileSync } from "fs";
import * as vscode from "vscode";
import { LocationTracker } from "./LocationTracker";
import * as path from "path";

export class RangeData {
  constructor(startLine: number, endLine: number, totalDuration: number) {
    this.startLine = startLine;
    this.endLine = endLine;
    this.totalDuration = totalDuration;
  }
  startLine: number;
  endLine: number;
  totalDuration: number;
}

export class PositionHistory {
  [key: string]: PositionHistory | RangeData[] | undefined;
}

var positionHistory = new PositionHistory();
var backupFilename = "backup";

export function getPositionHistory(): PositionHistory {
  return positionHistory;
}

export function resetPositionHistory(storageLocation: vscode.Uri | undefined) {
  if (storageLocation) {
    savePositionHistory(
      storageLocation,
      `${backupFilename}-${Date.now()}.json`
    );
  }
  positionHistory = new PositionHistory();
}

export function savePositionHistory(
  storageLocation: vscode.Uri,
  filename = backupFilename
) {
  var filePath = path.join(storageLocation.fsPath, filename + ".json");
  writeFileSync(filePath, JSON.stringify(getPositionHistory()));
}

export function loadPositionHistory(storageLocation: vscode.Uri) {
  var filePath = path.join(storageLocation.fsPath, backupFilename + ".json");
  if (existsSync(filePath)) {
    var backupContent = readFileSync(filePath).toString();
    var backupData = JSON.parse(backupContent);
    positionHistory = convertPositionHistoryValue(backupData);
    vscode.window.showInformationMessage("Found existing backup with data");
  } else {
    vscode.window.showInformationMessage("No backup found");
  }
}

export function addLastLocationToHistory(context: vscode.ExtensionContext) {
  if (LocationTracker.lastDocument === undefined) {
    return;
  }

  const viewDuration = Date.now() - LocationTracker.lastVisibleRangeUpdate;
  const fileIdentifier = vscode.workspace.asRelativePath(
    LocationTracker.lastDocument.uri
  );
  const identifierKeys = fileIdentifier.split("/").filter((el) => el !== "");

  let currentLocationDataNode = positionHistory;
  for (let i = 0; i < identifierKeys.length; ++i) {
    const nextKey = identifierKeys[i];
    let positionNode = currentLocationDataNode[nextKey];

    if (i < identifierKeys.length - 1) {
      if (positionNode === undefined) {
        currentLocationDataNode[nextKey] = new PositionHistory();
        currentLocationDataNode = currentLocationDataNode[nextKey];
      } else if (currentLocationDataNode[nextKey] instanceof PositionHistory) {
        currentLocationDataNode = currentLocationDataNode[nextKey];
      }
    } else {
      if (positionNode === undefined) {
        currentLocationDataNode[nextKey] = [];
      }
      const positionDataArray = currentLocationDataNode[nextKey];

      if (Array.isArray(positionDataArray)) {
        LocationTracker.lastVisibleRanges?.forEach((visibleRange) => {
          let existingRange = positionDataArray.find(
            (range) =>
              range.startLine === visibleRange.start.line &&
              range.endLine === visibleRange.end.line
          );

          if (existingRange) {
            existingRange.totalDuration += viewDuration;
          } else {
            const newRange = new RangeData(
              visibleRange.start.line,
              visibleRange.end.line,
              viewDuration
            );
            positionDataArray.push(newRange);
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

export function categorizePositionsByFileName(): {
  [fileName: string]: number;
} {
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

export function getFileRangeData(file: vscode.Uri): RangeData[] {
  function traverseHistory(history: PositionHistory, path: string[] = []) {
    if (path.length === 0) {
      return [];
    }
    var nextKey = path[0];
    var value = history[nextKey];
    if (value === undefined) {
      return [];
    }
    if (Array.isArray(value)) {
      return value;
    }
    var subPath = path.slice(1);
    return traverseHistory(value, subPath);
  }

  var fileIdentifier = vscode.workspace.asRelativePath(file);
  var identifierKeys = fileIdentifier.split("/").filter((el) => el !== "");
  return traverseHistory(getPositionHistory(), identifierKeys);
}
