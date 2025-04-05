import * as vscode from "vscode";
import { LocationTracker } from "./LocationTracker";
import { revealLocation } from "./revealLocation";
import { adjustRangeBasedOnChange } from "./utils/documentChangeUtils";

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

    // setInterval(() => {
    //   console.log(
    //     this.navigationHistory.map(
    //       (el) => el.relativePath + el.range.start.line
    //     )
    //   );
    //   console.log(this.navigationHistoryIndex);
    //   console.log(this.intermediateLocation);
    //   console.log("------------");
    // }, 5000);
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

    // console.log("--- Updating location ---");
    // console.log(
    //   this.navigationHistory.map((el) => el.relativePath + el.range.start.line)
    // );
    // console.log(this.navigationHistoryIndex);
    // console.log(this.intermediateLocation);
    // console.log("---");

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

    // console.log(
    //   this.navigationHistory.map((el) => el.relativePath + el.range.start.line)
    // );
    // console.log(this.navigationHistoryIndex);
    // console.log(this.intermediateLocation);
    // console.log("--- End updating location ---");
  }

  public static handleTextDocumentChangeEvent(
    changeEvent: vscode.TextDocumentChangeEvent
  ) {
    if (changeEvent.contentChanges.length === 0) {
      return;
    }

    this.navigationHistory = this.navigationHistory.map((fileLocation) => {
      let newRange = adjustRangeBasedOnChange(
        changeEvent,
        fileLocation.relativePath,
        fileLocation.range
      );

      return new FileLocation(fileLocation.relativePath, newRange);
    });
  }

  // Returns the most recent locations (ordering: newest is first).
  public static getPreviousPositions(
    locNumber: number = 3,
    currentEditorOnly = true
  ): (FileLocation | null)[] {
    if (this.navigationHistoryIndex < 0) {
      return [];
    }

    let endIndex = this.navigationHistoryIndex + 1;

    let currentLocation = this.getCurrentLocation();
    var currentPositionInHistory = this.tryMergeLocations(
      currentLocation,
      this.navigationHistory[this.navigationHistoryIndex]
    );

    // We already are at this position -> ignore.
    if (currentPositionInHistory) {
      --endIndex;
    }

    var startIndex = Math.max(0, endIndex - locNumber);

    return this.navigationHistory
      .slice(startIndex, endIndex)
      .reverse()
      .map((loc) => {
        if (
          !currentEditorOnly ||
          loc.relativePath === currentLocation?.relativePath
        ) {
          return loc;
        }
        return null;
      });
  }

  // Returns the most recent ranges (ordering: newest is first).
  public static getPreviousRanges(
    locNumber: number = 3,
    currentEditorOnly = true
  ): (vscode.Range | null)[] {
    return this.getPreviousPositions(locNumber, currentEditorOnly).map(
      (fileLoc) => (fileLoc !== null ? fileLoc.range : null)
    );
  }

  // Returns the next jump locations.
  public static getNextLocations(
    locNumber: number = 3,
    currentEditorOnly = true
  ): (FileLocation | null)[] {
    if (this.navigationHistoryIndex < 0) {
      return [];
    }

    let startIndex = this.navigationHistoryIndex + 1;

    let currentLocation = this.getCurrentLocation();
    var currentPositionInHistory = this.tryMergeLocations(
      currentLocation,
      this.navigationHistory[startIndex]
    );

    // We already are at this position -> ignore.
    if (currentPositionInHistory) {
      ++startIndex;
    }

    return this.navigationHistory
      .slice(startIndex, startIndex + locNumber)
      .map((loc) => {
        if (
          !currentEditorOnly ||
          loc.relativePath === currentLocation?.relativePath
        ) {
          return loc;
        }
        return null;
      });
  }

  // Returns the next jump ranges.
  public static getNextRanges(
    locNumber: number = 3,
    currentEditorOnly = true
  ): (vscode.Range | null)[] {
    return this.getNextLocations(locNumber, currentEditorOnly).map((fileLoc) =>
      fileLoc !== null ? fileLoc.range : null
    );
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

    return false;
  }

  public static moveToPreviousPosition() {
    if (!this.hasPreviousPosition()) {
      return;
    }

    // Issue: intermediate location is current location, and approximately equal to previous location.
    // console.log("Moving to previous position");
    // console.log(this.intermediateLocation);
    // console.log(this.navigationHistoryIndex);

    if (!this.intermediateLocation) {
      this.navigationHistoryIndex -= 1;
    } else {
      var mergedLocation = this.tryMergeLocations(
        this.intermediateLocation,
        this.navigationHistory[this.navigationHistoryIndex]
      );

      if (!mergedLocation) {
        if (this.navigationHistoryIndex < this.navigationHistory.length - 1) {
          this.navigationHistory = this.navigationHistory.slice(
            0,
            this.navigationHistoryIndex + 1
          );
        }
        this.navigationHistory.push(this.intermediateLocation);
      }
      this.intermediateLocation = undefined;
    }

    // console.log("--- Moved to previous position ---");
    // console.log(
    //   this.navigationHistory.map((el) => el.relativePath + el.range.start.line)
    // );
    // console.log(this.navigationHistoryIndex);
    // console.log(this.intermediateLocation);
    // console.log("-------------");

    let locationToReveal = this.navigationHistory[this.navigationHistoryIndex];
    if (
      this.navigationHistoryIndex > 0 &&
      this.tryMergeLocations(locationToReveal, this.getCurrentLocation())
    ) {
      this.navigationHistoryIndex -= 1;
      locationToReveal = this.navigationHistory[this.navigationHistoryIndex];
    }

    revealLocation(
      locationToReveal.relativePath,
      locationToReveal.range.start.line,
      locationToReveal.range.end.line
    );

    this.lastLocationUpdate = Date.now(); // prevents the next location update from being triggered immediately
  }

  public static moveToNextPosition() {
    if (!this.hasNextPosition()) {
      return;
    }

    var locationToReveal: FileLocation;

    if (this.navigationHistoryIndex < this.navigationHistory.length - 1) {
      this.navigationHistoryIndex += 1;
      locationToReveal = this.navigationHistory[this.navigationHistoryIndex];
    } else if (this.intermediateLocation) {
      locationToReveal = this.intermediateLocation;
      this.intermediateLocation = undefined;
    } else {
      return;
    }

    revealLocation(
      locationToReveal.relativePath,
      locationToReveal.range.start.line,
      locationToReveal.range.end.line
    );
    this.lastLocationUpdate = Date.now(); // prevents the next location update from being triggered immediately
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

    // If one range is contained in other one, return larger one.
    if (rangeOverlap.contains(previousLocation.range)) {
      return currentLocation;
    }
    if (rangeOverlap.contains(currentLocation.range)) {
      return previousLocation;
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

  public static getCurrentLocation(): FileLocation | undefined {
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
