import * as vscode from "vscode";
import { LocationTracker } from "./LocationTracker";
import { revealLocation } from "./revealLocation";
import { start } from "repl";

class FileLocation {
  constructor(
    public readonly relativePath: string,
    public readonly range: vscode.Range // line numbers are 0 based
  ) {}
}

export class NavigationHistory {
  private static navigationHistory: FileLocation[];
  private static intermediateLocation: FileLocation | undefined;
  private static lastLocationUpdate: number;
  private static navigationHistoryIndex = -1;

  private static msBeforeHistoryUpdate: number = 4000;

  public static initialize() {
    this.lastLocationUpdate = Date.now();
    this.navigationHistory = [];
    this.intermediateLocation = undefined;

    setInterval(() => {
      let currentLocation = this.getCurrentLocation();
      var canMerge = this.tryMergeLocations(
        currentLocation,
        this.navigationHistory[this.navigationHistoryIndex]
      );
      if (!canMerge) {
        this.intermediateLocation = currentLocation;
      }
    }, 200);
  }

  public static updateLocation() {
    let currentLocation = this.getCurrentLocation();
    if (!currentLocation) {
      return;
    }

    if (Date.now() - this.lastLocationUpdate < 400) {
      this.lastLocationUpdate = Date.now();
      return;
    }

    if (!this.intermediateLocation && this.navigationHistory.length === 0) {
      this.navigationHistory[0] = currentLocation;
      this.navigationHistoryIndex = 0;
      this.lastLocationUpdate = Date.now();
      return;
    }

    let lastLocationToMergeWith =
      this.intermediateLocation ??
      this.navigationHistory[this.navigationHistoryIndex];
    let mergedLocation = this.tryMergeLocations(
      lastLocationToMergeWith,
      currentLocation
    );

    if (mergedLocation) {
      if (!this.intermediateLocation) {
        this.navigationHistory[this.navigationHistoryIndex] = mergedLocation;
        this.lastLocationUpdate = Date.now();
      } else if (
        Date.now() - this.lastLocationUpdate >
        this.msBeforeHistoryUpdate
      ) {
        this.navigationHistoryIndex += 1;
        this.navigationHistory = this.navigationHistory.slice(
          0,
          this.navigationHistoryIndex
        );
        this.navigationHistory.push(mergedLocation);
        this.intermediateLocation = undefined;
        this.lastLocationUpdate = Date.now();
      } else {
        this.intermediateLocation = mergedLocation;
      }
    } else if (LocationTracker.shouldTrackWindow()) {
      if (Date.now() - this.lastLocationUpdate > this.msBeforeHistoryUpdate) {
        this.navigationHistoryIndex += 1;
        this.navigationHistory = this.navigationHistory.slice(
          0,
          this.navigationHistoryIndex
        );
        this.navigationHistory.push(
          this.intermediateLocation ?? currentLocation
        );
        this.intermediateLocation = undefined;
      } else {
        this.intermediateLocation = currentLocation;
      }
      this.lastLocationUpdate = Date.now();
    } else {
      this.intermediateLocation = undefined;
      this.lastLocationUpdate = Date.now();
    }
  }

  // Returns the most recent locations (newest is first).
  public static getPreviousRanges(locNumber: number = 3): vscode.Range[] {
    if (this.navigationHistoryIndex < 0) {
      return [];
    }

    let relevantPositions = this.navigationHistory.slice(
      0,
      this.navigationHistoryIndex + 1
    );

    let currentLocation = this.getCurrentLocation();
    var currentPositionInHistory = this.tryMergeLocations(
      currentLocation,
      this.navigationHistory[this.navigationHistoryIndex]
    );

    if (currentPositionInHistory) {
      relevantPositions = relevantPositions.slice(
        0,
        relevantPositions.length - 1
      );
    }

    var startIndex = Math.max(0, relevantPositions.length - locNumber);

    return relevantPositions
      .slice(startIndex)
      .reverse()
      .map((loc) => loc.range);

    // let locations = this.navigationHistory.slice(
    //   0,
    //   this.navigationHistoryIndex + 1
    // );

    // let addIntermediateLocation = this.tryMergeLocations(
    //   this.intermediateLocation,
    //   this.navigationHistory[this.navigationHistoryIndex]
    // );
    // if (addIntermediateLocation && this.intermediateLocation) {
    //   locations.push(this.intermediateLocation);
    // }

    // let currentLocation = this.getCurrentLocation();
    // locations = locations.filter((location) =>
    //   this.tryMergeLocations(location, currentLocation)
    // );

    // var startIndex = Math.max(0, locations.length - locNumber);
    // return locations
    //   .slice(startIndex)
    //   .reverse()
    //   .map((loc) => loc.range);
  }

  public static hasPreviousPosition(): boolean {
    if (this.navigationHistory.length <= 0) {
      return false;
    }

    if (this.navigationHistoryIndex > 0) {
      return true;
    }

    let currentLocation = this.getCurrentLocation();
    var mergedLocation = this.tryMergeLocations(
      currentLocation,
      this.navigationHistory[this.navigationHistoryIndex]
    );

    return mergedLocation === undefined;
  }

  public static hasNextPosition(): boolean {
    if (this.navigationHistoryIndex < this.navigationHistory.length - 1) {
      return true;
    }
    if (this.intermediateLocation) {
      let currentLocation = this.getCurrentLocation();
      if (!this.tryMergeLocations(this.intermediateLocation, currentLocation)) {
        return true;
      }
    }

    return false;
  }

  public static moveToPreviousPosition() {
    if (!this.hasPreviousPosition()) {
      return;
    }

    if (!this.intermediateLocation) {
      this.navigationHistoryIndex -= 1;
    } else {
      this.navigationHistory.push(this.intermediateLocation!);
      this.intermediateLocation = undefined;
    }

    let locationToReveal = this.navigationHistory[this.navigationHistoryIndex];

    revealLocation(
      locationToReveal.relativePath,
      locationToReveal.range.start.line,
      locationToReveal.range.end.line
    );
  }

  public static moveToNextPosition() {
    if (!this.hasNextPosition()) {
      return;
    }

    var locationToReveal: FileLocation;
    if (!this.intermediateLocation) {
      this.navigationHistoryIndex += 1;
      locationToReveal = this.navigationHistory[this.navigationHistoryIndex];
    } else {
      locationToReveal = this.intermediateLocation;
      this.intermediateLocation = undefined;
    }

    revealLocation(
      locationToReveal.relativePath,
      locationToReveal.range.start.line,
      locationToReveal.range.end.line
    );
  }

  private static tryMergeLocations(
    previousLocation: FileLocation | undefined,
    currentLocation: FileLocation | undefined
  ): FileLocation | undefined {
    if (!previousLocation || !currentLocation) {
      return undefined;
    }

    // Different files.
    if (previousLocation.relativePath !== currentLocation.relativePath) {
      return undefined;
    }

    let rangeOverlap = previousLocation.range.intersection(
      currentLocation.range
    );

    // No overlap.
    if (rangeOverlap === undefined) {
      return undefined;
    }

    let overlapLength = rangeOverlap.end.line - rangeOverlap.start.line;
    let visibleRangeLength =
      currentLocation.range.end.line - currentLocation.range.start.line;

    // Overlap too small (< 50% of visible range).
    if (overlapLength / visibleRangeLength < 0.5) {
      return undefined;
    }

    return new FileLocation(currentLocation.relativePath, rangeOverlap);
  }

  private static getCurrentLocation(): FileLocation | undefined {
    let currentDocument = vscode.window.activeTextEditor?.document;
    let currentRanges = vscode.window.activeTextEditor?.visibleRanges;
    if (currentDocument === undefined || currentRanges === undefined) {
      return undefined;
    }

    let currentFilePath = vscode.workspace.asRelativePath(
      currentDocument.uri.path
    );
    let currentLocation = new FileLocation(
      currentFilePath,
      new vscode.Range(
        currentRanges[0].start,
        currentRanges[currentRanges.length - 1].end
      )
    );

    return currentLocation;
  }
}
