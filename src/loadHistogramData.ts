//import Chart from "chart.js/auto";
import * as vscode from "vscode";
import { getFileRangeData } from "./location-tracking.js";
import { start } from "repl";

// export function createHistogram(document: any) {
//   var bucketedData,
//     labels = getCurrentFileRangeData();

//   return new Chart(document.getElementById("histogram"), {
//     type: "bar",
//     data: {
//       labels: labels,
//       datasets: [
//         {
//           label: "My First Dataset",
//           data: bucketedData,
//           backgroundColor: [
//             "rgba(255, 99, 132, 0.2)",
//             "rgba(255, 159, 64, 0.2)",
//           ],
//           borderColor: ["rgb(255, 99, 132)", "rgb(255, 159, 64)"],
//           borderWidth: 1,
//           barPercentage: 1.25,
//         },
//       ],
//     },
//     options: {
//       indexAxis: "y",
//       // Elements options apply to all of the options unless overridden in a dataset
//       // In this case, we are setting the border of each horizontal bar to be 2px wide
//       elements: {
//         bar: {
//           borderWidth: 2,
//         },
//       },
//       responsive: true,
//       plugins: {
//         //   legend: {
//         //     position: 'right',
//         //   },
//         title: {
//           display: false,
//           //text: 'Chart.js Horizontal Bar Chart'
//         },
//       },
//     },
//   });
// }

export async function getFileHistogramData(
  fileUri: vscode.Uri
): Promise<[number[], string[]]> {
  var rangeData = getFileRangeData(fileUri);

  if (rangeData.length === 0) {
    return [[], []];
  }

  const splitCount = 20; // TODO: Make dynamic
  var totalLineCount = await vscode.workspace
    .openTextDocument(fileUri)
    .then((textDocument) => {
      return textDocument.lineCount;
    });

  var buckets = new Array(splitCount).fill(0);
  var labels = new Array(splitCount).fill("");

  var startLines = getBucketStartLines(totalLineCount, splitCount);

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

  for (var i = 0; i < splitCount; ++i) {
    var startLine = startLines[i];
    var endLine: number;
    if (i + 1 >= splitCount) {
      endLine = totalLineCount;
    } else {
      endLine = startLines[i + 1] - 1;
    }
    labels[i] = `${startLine} - ${endLine}`;
  }

  return [buckets, labels];
}

function getBucketStartLines(
  totalLineCount: number,
  splitCount: number
): number[] {
  var bucketSize =
    totalLineCount < splitCount
      ? totalLineCount
      : Math.ceil(totalLineCount / splitCount);

  var bucketStartLines = [splitCount];
  for (var i = 0; i < splitCount; ++i) {
    let startLine = i * bucketSize + 1;
    bucketStartLines[i] = startLine;
  }

  return bucketStartLines;
}
