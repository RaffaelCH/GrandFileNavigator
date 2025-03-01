import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import * as vscode from "vscode";
import { LocationTracker } from "./LocationTracker";
import { HotspotLLMAnalyzer } from "./HotspotsLLMAnalyzer";
import * as path from "path";
import { adjustRangeBasedOnChange } from "./utils/documentChangeUtils";

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

// Tracks user position.
var positionHistory = new PositionHistory();
var backupFilename = "backup"; // TODO: Allow multiple files.

export function getPositionHistory(): PositionHistory {
  return positionHistory;
}

export function resetPositionHistory(storageLocation: vscode.Uri | undefined) {
  if (storageLocation) {
    savePositionHistory(
      storageLocation,
      `${backupFilename}-${Date.now()}.json`
    ); // retain backups
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

// Load history from file.
export function loadPositionHistory(storageLocation: vscode.Uri) {
  var filePath = path.join(storageLocation.fsPath, backupFilename + ".json");
  if (existsSync(filePath)) {
    var backupContent = readFileSync(filePath).toString();
    var backupData = JSON.parse(backupContent);
    positionHistory = convertPositionHistoryValue(backupData);
    vscode.window.showInformationMessage("Found existing backup with data");
  } else {
    vscode.window.showInformationMessage("no backup found");
  }
}

//vscode.window.onDidChangeWindowState
//vscode.workspace.onDidChangeTextDocument

export function addLastLocationToHistory(context: vscode.ExtensionContext) {
  if (LocationTracker.lastDocument === undefined) {
    return;
  }

  const viewDuration = Date.now() - LocationTracker.lastVisibleRangeUpdate;
  const fileIdentifier = vscode.workspace.asRelativePath(
    LocationTracker.lastDocument.uri.path
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
            // Only update the viewDuration for existing hotspots
            existingRange.totalDuration += viewDuration;
          } else {
            // Add a new hotspot and trigger LLM analysis
            const newRange = new RangeData(
              visibleRange.start.line,
              visibleRange.end.line,
              viewDuration
            );
            positionDataArray.push(newRange);

            // Create the enriched hotspot object
            const enrichedHotspot = {
              filePath: LocationTracker.lastDocument?.uri.fsPath || "", // Ensure it's safe
              rangeData: newRange,
              symbols: [], // Populate as needed
              timeSpent: viewDuration,
              importance: viewDuration, // You can change how you calculate importance
            };

            // TODO: Reenable
            // Add the new hotspot to the LLM analysis queue
            // if (LocationTracker.lastDocument) {
            //   console.log("Adding hotspot to LLM analysis queue.");
            //   HotspotLLMAnalyzer.addToQueue(
            //     enrichedHotspot,
            //     LocationTracker.lastDocument,
            //     context
            //   );
            // }
          }
        });
      }
    }
  }
}

export function handleTextDocumentChangeEvent(
  changeEvent: vscode.TextDocumentChangeEvent
) {
  if (changeEvent.contentChanges.length === 0) {
    return;
  }

  var relevantHistory = getFileRangeData(changeEvent.document.uri);
  if (relevantHistory.length === 0) {
    return;
  }

  let relativePath = vscode.workspace.asRelativePath(
    changeEvent.document.uri.path
  );

  var updatedRanges = relevantHistory.map((rangeData) => {
    let newRange = adjustRangeBasedOnChange(
      changeEvent,
      relativePath,
      new vscode.Range(
        new vscode.Position(rangeData.startLine, 0),
        new vscode.Position(rangeData.endLine, 0)
      )
    );
    return new RangeData(
      newRange.start.line,
      newRange.end.line,
      rangeData.totalDuration
    );
  });

  var positionHistoryData = positionHistory;
  const identifierKeys = relativePath.split("/").filter((el) => el !== "");

  // Replace old with new data in positionHistory.
  for (var i = 0; i < identifierKeys.length; ++i) {
    let nextKey = identifierKeys[i];
    if (Array.isArray(positionHistoryData[nextKey])) {
      positionHistoryData[nextKey] = updatedRanges;
    } else if (positionHistoryData[nextKey] instanceof PositionHistory) {
      positionHistoryData = positionHistoryData[nextKey];
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

  var fileIdentifier = vscode.workspace.asRelativePath(file.path);
  var identifierKeys = fileIdentifier.split("/").filter((el) => el !== "");
  return traverseHistory(getPositionHistory(), identifierKeys);
}
