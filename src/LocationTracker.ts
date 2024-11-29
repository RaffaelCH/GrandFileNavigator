import * as vscode from "vscode";

export class LocationTracker {
  private static _isTracking: boolean;

  public static lastVisibleRangeUpdate: number;
  public static lastDocument: vscode.TextDocument | undefined;
  public static lastVisibleRanges: readonly vscode.Range[] | undefined;

  public static initialize() {
    this._isTracking = false;
    this.lastVisibleRangeUpdate = Date.now();
  }

  public static updateLocationTracking() {
    if (this.shouldTrackWindow()) {
      this._isTracking = true;
      this.lastDocument = vscode.window.activeTextEditor!.document;
      const visibleRanges = vscode.window.activeTextEditor!.visibleRanges.slice();

      const lastVisibleRange = visibleRanges[visibleRanges.length - 1];
      if (lastVisibleRange.end.line === this.lastDocument.lineCount - 1) {
        let newEndPosition = new vscode.Position(
          lastVisibleRange.end.line + 1,
          lastVisibleRange.end.character
        );
        let updatedLastVisibleRange = new vscode.Range(
          lastVisibleRange.start,
          newEndPosition
        );
        visibleRanges[visibleRanges.length - 1] = updatedLastVisibleRange;
      }

      this.lastVisibleRanges = visibleRanges;
    }

    this.lastVisibleRangeUpdate = Date.now();
  }

  public static shouldUpdateTracking() {
    if (!this._isTracking) {
      return false;
    }

    if (Date.now() - this.lastVisibleRangeUpdate < 400) {
      return false;
    }

    return true;
  }

  public static shouldTrackWindow() {
    if (!vscode.window.activeTextEditor) {
      return false;
    }

    const currentDocument = vscode.window.activeTextEditor.document;

    // Allow tracking for specified languages
    const supportedLanguages = ["java", "python", "javascript", "typescript", "rust"];
    if (!supportedLanguages.includes(currentDocument.languageId)) {
      return false;
    }

    if (currentDocument.uri.scheme !== "file") {
      return false;
    }

    return true;
  }
}
