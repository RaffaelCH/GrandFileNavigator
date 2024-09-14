//import Chart from "chart.js/auto";
import * as vscode from "vscode";
import { getFileRangeData } from "./location-tracking.js";

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

export function getCurrentFileRangeData(): [number[], string[]] {
  var activeEditor = vscode.window.activeTextEditor;

  if (activeEditor === undefined) {
    return [[], []];
  }

  var currentFile = activeEditor.document;
  var rangeData = getFileRangeData(currentFile.uri);

  const splitCount = 20; // TODO: Make dynamic

  var totalLineCount = currentFile.lineCount;
  var bucketSize =
    totalLineCount < splitCount
      ? totalLineCount
      : Math.ceil(totalLineCount / splitCount);

  var buckets = new Array(splitCount).fill(0);
  var labels = new Array(splitCount).fill("");

  rangeData.forEach((range) => {
    var startBucket = Math.floor((range.startLine / totalLineCount) * 20);
    var endBucket = Math.min(
      Math.floor((range.startLine / totalLineCount) * 20),
      20
    );

    if (startBucket === endBucket) {
      buckets[startBucket] += range.totalDuration;
      return;
    }

    var currentLine = range.startLine;
    var currentBucket = startBucket;
    while (currentLine < range.endLine) {
      var bucketEndLine = currentBucket * bucketSize;
      var linesInBucket = bucketEndLine - currentLine + 1;
      var weightedImportance =
        linesInBucket / (range.endLine - range.startLine);
      buckets[currentBucket] += weightedImportance * range.totalDuration;
      currentBucket++;
      currentLine = bucketEndLine + 1;
    }
  });

  for (var i = 0; i < splitCount; ++i) {
    var startLine = i * bucketSize;
    var endLine = i * (bucketSize + 1) - 1;
    labels[i] = `${startLine} - ${endLine}`;
  }

  return [buckets, labels];
}
