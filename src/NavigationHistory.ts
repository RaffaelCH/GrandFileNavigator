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
  private navigationHistory: FileLocation[];
  private intermediateLocations: FileLocation[];
  private lastLocationUpdate: number;
  private navigationHistoryIndex = 0;

  private msBeforeHistoryUpdate: number = 5000;

  public constructor() {
    this.lastLocationUpdate = Date.now();
    this.navigationHistory = [];
    this.intermediateLocations = [];
  }

  public updateLocation() {
    if (Date.now() - this.lastLocationUpdate < 1000) {
      return;
    }

    // TODO: If moved back in navigation history, prune off previous history!

    if (!LocationTracker.shouldTrackWindow()) {
      if (Date.now() - this.lastLocationUpdate > this.msBeforeHistoryUpdate) {
        if (this.intermediateLocations.length > 0) {
          let lastLocation =
            this.intermediateLocations[this.intermediateLocations.length - 1];
          this.navigationHistory.push(lastLocation);
        }
      }
      this.intermediateLocations = [];
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

    let intermediateIsEmpty = this.intermediateLocations.length === 0;
    let lastLocationToMergeWith = intermediateIsEmpty
      ? this.intermediateLocations[this.intermediateLocations.length - 1]
      : this.navigationHistory[this.navigationHistory.length - 1];
    let mergedLocation = this.tryMergeLocations(
      lastLocationToMergeWith,
      currentLocation
    );

    if (mergedLocation) {
      if (intermediateIsEmpty) {
        this.navigationHistory.pop();
        this.navigationHistory.push(mergedLocation);
      } else {
        this.intermediateLocations.pop();
        this.intermediateLocations.push(mergedLocation);
      }
    } else {
      if (this.lastLocationUpdate - Date.now() > this.msBeforeHistoryUpdate) {
        if (!intermediateIsEmpty) {
          this.navigationHistory.push(
            this.intermediateLocations[this.intermediateLocations.length - 1]
          );
          this.intermediateLocations = [];
        }

        this.intermediateLocations.push(currentLocation);
      }
    }

    this.lastLocationUpdate = Date.now();
  }

  public hasPreviousPosition() {
    return this.navigationHistoryIndex > 0;
  }

  public hasNextPosition() {
    return this.navigationHistoryIndex < this.navigationHistory.length - 1;
  }

  public moveToPreviousPosition() {
    if (!this.hasPreviousPosition()) {
      return;
    }

    this.navigationHistoryIndex -= 1;
    let locationToReveal = this.navigationHistory[this.navigationHistoryIndex];
    revealLocation(
      locationToReveal.relativePath,
      locationToReveal.range.start.line,
      locationToReveal.range.end.line
    );
  }

  public moveToNextPosition() {
    if (!this.hasNextPosition()) {
      return;
    }

    this.navigationHistoryIndex += 1;
    let locationToReveal = this.navigationHistory[this.navigationHistoryIndex];
    revealLocation(
      locationToReveal.relativePath,
      locationToReveal.range.start.line,
      locationToReveal.range.end.line
    );
  }

  private tryMergeLocations(
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
