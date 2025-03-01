import * as vscode from "vscode";

export function adjustRangeBasedOnChange(
  changeEvent: vscode.TextDocumentChangeEvent,
  relPath: string,
  range: vscode.Range
): vscode.Range {
  if (changeEvent.contentChanges.length === 0) {
    return range;
  }

  var changedDocumentRelativePath = vscode.workspace.asRelativePath(
    changeEvent.document.uri.path
  );

  // Different file -> file location not impacted
  if (relPath !== changedDocumentRelativePath) {
    return range;
  }

  let newRange = range;

  for (const contentChange of changeEvent.contentChanges) {
    // Change was higher up in file -> not impacted
    if (contentChange.range.start.line > range.end.line) {
      continue;
    }

    var linesRemoved =
      contentChange.range.end.line - contentChange.range.start.line;
    var linesAdded = contentChange.text.split("\n").length - 1;
    var lineCountChange = linesAdded - linesRemoved;

    // Ignore character-level changes.
    if (lineCountChange === 0) {
      continue;
    }

    var rangeOverlap = range.intersection(contentChange.range);

    // Change was lower down in file (no overlap) and in/decreased lines -> adjust start/end lines.
    if (rangeOverlap === undefined) {
      newRange = new vscode.Range(
        new vscode.Position(
          newRange.start.line + lineCountChange,
          newRange.start.character
        ),
        new vscode.Position(
          newRange.end.line + lineCountChange,
          newRange.end.character
        )
      );
    } else if (lineCountChange !== 0) {
      // When event is received the change already happened -> can't determine how the line changes were distributed.
      // Therefore assume equal distribution for simplicity.

      // If no code was replaced, the range spans 0 lines (but the new code is > 0 lines).
      var changeSize = Math.max(
        contentChange.range.end.line - contentChange.range.start.line,
        linesAdded
      );

      // Fraction of the change that was below the current location.
      var fractionBelow = Math.max(
        0,
        (rangeOverlap.start.line - contentChange.range.start.line) / changeSize
      );

      var overlapFraction = contentChange.range.isSingleLine
        ? 1
        : (rangeOverlap.end.line - rangeOverlap.start.line) / changeSize;
      var overlapLineCountChange = Math.floor(
        lineCountChange * overlapFraction
      );

      var newStartLine =
        range.start.line + Math.floor(fractionBelow * lineCountChange);

      newRange = new vscode.Range(
        new vscode.Position(newStartLine, newRange.start.character),
        new vscode.Position(
          newStartLine +
            (range.end.line - range.start.line) +
            overlapLineCountChange,
          newRange.end.character
        )
      );
    }
  }

  return newRange;
}
