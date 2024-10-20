import * as vscode from "vscode";
import { LocationTracker } from "./LocationTracker";
import { revealLocation } from "./revealLocation";

class FileLocation {
  constructor(
    public readonly relativePath: string,
    public readonly range: vscode.Range
  ) {}
}

export class NavigationHistory {
  private static navigationHistory: FileLocation[];
  private static intermediateLocation: FileLocation | undefined;
  private static lastLocationUpdate: number;
  private static navigationHistoryIndex = -1;

  private static msBeforeHistoryUpdate: number = 5000;

  public static initialize() {
    this.lastLocationUpdate = Date.now();
    this.navigationHistory = [];
    this.intermediateLocation = undefined;
  }

  public static updateLocation() {
    if (Date.now() - this.lastLocationUpdate < 1000) {
      return;
    }

    let lastDocument = LocationTracker.lastDocument;
    let previousRanges = LocationTracker.lastVisibleRanges;
    if (lastDocument === undefined || previousRanges === undefined) {
      return;
    }

    let previousFilePath = vscode.workspace.asRelativePath(lastDocument.uri);
    let currentLocation = new FileLocation(
      previousFilePath,
      new vscode.Range(
        previousRanges[0].start,
        previousRanges[previousRanges.length - 1].end
      )
    );

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
      }
    } else {
      this.intermediateLocation = undefined;
    }

    this.lastLocationUpdate = Date.now();
  }

  public static hasPreviousPosition(): boolean {
    return (
      this.navigationHistoryIndex >= 0 ||
      this.intermediateLocation !== undefined
    );
  }

  public static hasNextPosition(): boolean {
    return (
      this.navigationHistoryIndex < this.navigationHistory.length - 1 ||
      this.intermediateLocation !== undefined
    );
  }

  public static moveToPreviousPosition() {
    if (!this.hasPreviousPosition()) {
      return;
    }

    var locationToReveal: FileLocation;
    if (!this.intermediateLocation) {
      this.navigationHistoryIndex -= 1;
      locationToReveal = this.navigationHistory[this.navigationHistoryIndex];
    } else {
      locationToReveal = this.intermediateLocation;
    }

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
    }

    revealLocation(
      locationToReveal.relativePath,
      locationToReveal.range.start.line,
      locationToReveal.range.end.line
    );
  }

  private static tryMergeLocations(
    previousLocation: FileLocation,
    currentLocation: FileLocation
  ): FileLocation | undefined {
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

    // Overlap too small (< 25% of visible range).
    if (overlapLength / visibleRangeLength < 0.25) {
      return undefined;
    }

    return new FileLocation(currentLocation.relativePath, rangeOverlap);
  }
}
