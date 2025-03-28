import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

// Track all user interactions during the evaluation.
export class InteractionTracker {
  private static storageLocation: string;

  public static setStorageLocation(storageDir: vscode.Uri) {
    if (!fs.existsSync(storageDir.fsPath)) {
      fs.mkdirSync(storageDir.fsPath);
    }
    this.storageLocation = path.join(
      storageDir.fsPath,
      `interactions_${Date.now()}.json`
    );
  }

  // Move view in same file.
  public static changedVisibleRanges(
    sourceFilePath: string | undefined,
    sourceRange: vscode.Range | undefined,
    targetRange: vscode.Range | undefined
  ) {
    let changeVisibleRangesData = {
      timeStamp: Date.now(),
      interactionType: "ChangeVisibleRanges",
      sourceFilePath: sourceFilePath ?? "",
      sourceRange: this.stringifyRange(sourceRange),
      targetRange: this.stringifyRange(targetRange),
    };
    let stringified = JSON.stringify(changeVisibleRangesData);
    fs.appendFileSync(this.storageLocation, `${stringified}\n`);
  }

  // Move view in same file.
  public static changedFile(
    sourceFilePath: string | undefined,
    sourceRange: vscode.Range | undefined,
    targetFilePath: string | undefined,
    targetRange: vscode.Range | undefined
  ) {
    let changeFileData = {
      timeStamp: Date.now(),
      interactionType: "ChangeFile",
      sourceFilePath: sourceFilePath ?? "",
      sourceRange: this.stringifyRange(sourceRange),
      targetFilePath: targetFilePath ?? "",
      targetRange: this.stringifyRange(targetRange),
    };
    let stringified = JSON.stringify(changeFileData);
    fs.appendFileSync(this.storageLocation, `${stringified}\n`);
  }

  public static clickHistogram(
    sourceFilePath: string | undefined,
    sourceRange: vscode.Range | undefined,
    targetLine: number
  ) {
    let clickHistogramData = {
      timeStamp: Date.now(),
      interactionType: "ClickHistogram",
      sourceFilePath: sourceFilePath ?? "",
      visibleRange: this.stringifyRange(sourceRange),
      targetLine: targetLine,
    };
    let stringified = JSON.stringify(clickHistogramData);
    fs.appendFileSync(this.storageLocation, `${stringified}\n`);
  }

  public static clickJumpButton(direction: string) {
    let clickJumpButton = {
      timeStamp: Date.now(),
      interactionType: "ClickJumpButton",
      direction: direction,
    };
    let stringified = JSON.stringify(clickJumpButton);
    fs.appendFileSync(this.storageLocation, `${stringified}\n`);
  }

  public static ExecuteNavigationJump(
    backwards: boolean,
    sourceFilePath: string | undefined,
    sourceRange: vscode.Range | undefined,
    targetFilePath: string | undefined,
    targetLine: number | undefined
  ) {
    let navigationJumpData = {
      timeStamp: Date.now(),
      interactionType: "NavigationJump",
      backwards: backwards,
      sourceFilePath: sourceFilePath ?? "",
      sourceRange: this.stringifyRange(sourceRange),
      targetFilePath: targetFilePath ?? "",
      targetLine: targetLine,
    };
    let stringified = JSON.stringify(navigationJumpData);
    fs.appendFileSync(this.storageLocation, `${stringified}\n`);
  }

  public static editFile(filePath: string | undefined) {
    let editFileData = {
      timeStamp: Date.now(),
      interactionType: "EditFile",
      filePath: filePath,
    };
    let stringified = JSON.stringify(editFileData);
    fs.appendFileSync(this.storageLocation, `${stringified}\n`);
  }

  private static stringifyRange(range: vscode.Range | undefined) {
    return range ? `${range?.start.line}-${range?.end.line}` : "";
  }
}
