import * as vscode from "vscode";

export class LocationTracker {
  private static _isTracking: boolean; // is the current window being tracked

  public static lastVisibleRangeUpdate: number;
  public static lastDocument: vscode.TextDocument | undefined;
  public static lastVisibleRanges: readonly vscode.Range[] | undefined;

  public static initialize() {
    LocationTracker._isTracking = false; // is the current window being tracked
    LocationTracker.lastVisibleRangeUpdate = Date.now();
  }

  public static updateLocationTracking() {
    if (this.shouldTrackWindow()) {
      LocationTracker._isTracking = true;
      LocationTracker.lastDocument = vscode.window.activeTextEditor!.document;
      LocationTracker.lastVisibleRanges =
        vscode.window.activeTextEditor!.visibleRanges;
    }

    this.lastVisibleRangeUpdate = Date.now();
  }

  // If previous position was relevant for location tracking.
  public static shouldUpdateTracking() {
    if (!this._isTracking) {
      return false;
    }

    if (Date.now() - this.lastVisibleRangeUpdate < 200) {
      return false;
    }

    return true;
  }

  public static shouldTrackWindow() {
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
}
