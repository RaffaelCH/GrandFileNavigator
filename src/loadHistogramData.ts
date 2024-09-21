//import Chart from "chart.js/auto";
import * as vscode from "vscode";
import { getFileRangeData } from "./location-tracking.js";
import { HistogramNode } from "./sidebar_types/histogramNode.js";

export async function getFileHistogramData(
  fileUri: vscode.Uri
): Promise<HistogramNode[]> {
  var rangeData = getFileRangeData(fileUri);

  if (rangeData.length === 0) {
    return [];
  }

  var totalLineCount = await vscode.workspace
    .openTextDocument(fileUri)
    .then((textDocument) => {
      return textDocument.lineCount;
    });

  var maxSplitCount = Math.min(totalLineCount, 20);
  var bucketSize = Math.ceil(totalLineCount / maxSplitCount);
  var splitCount = Math.ceil(totalLineCount / bucketSize);

  var buckets = new Array(splitCount).fill(0);

  var startLines = [splitCount];
  for (var i = 0; i < splitCount; ++i) {
    let startLine = i * bucketSize + 1;
    startLines[i] = startLine;
  }

  rangeData.forEach((range) => {
    var indexAfterStartBucket = startLines.findIndex(
      (line) => line > range.startLine
    );
    var startBucketIndex =
      indexAfterStartBucket === -1 ? splitCount - 1 : indexAfterStartBucket - 1;

    var indexAfterEndBucket = startLines.findIndex(
      (line) => line > range.endLine
    );
    var endBucketIndex =
      indexAfterEndBucket === -1 ? splitCount - 1 : indexAfterEndBucket;

    if (startBucketIndex === endBucketIndex) {
      buckets[startBucketIndex] += range.totalDuration;
      return;
    }

    var currentLine = range.startLine;
    var currentBucketIndex = startBucketIndex;
    while (currentLine < range.endLine) {
      var bucketEndLine: number;
      if (range.endLine >= totalLineCount) {
        bucketEndLine = totalLineCount;
      } else {
        bucketEndLine = startLines[currentBucketIndex + 1] - 1;
      }
      var linesInBucket = bucketEndLine - currentLine + 1;
      var weightedImportance =
        linesInBucket / (range.endLine - range.startLine);
      buckets[currentBucketIndex] += weightedImportance * range.totalDuration;
      currentBucketIndex++;
      currentLine = bucketEndLine + 1;
    }
  });

  var histogramNodes = new Array(splitCount);
  for (var i = 0; i < splitCount; ++i) {
    var startLine = startLines[i];
    var endLine: number;
    if (i + 1 >= splitCount) {
      endLine = totalLineCount;
    } else {
      endLine = startLines[i + 1] - 1;
    }
    var label = `${startLine}-${endLine}`;
    histogramNodes[i] = new HistogramNode(
      label,
      buckets[i],
      fileUri.fsPath.replaceAll("\\", "/"),
      startLine,
      endLine
    );
  }

  return histogramNodes;
}
