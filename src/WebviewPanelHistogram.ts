import * as vscode from "vscode";
import { categorizePositionsByFileName } from "./location-tracking.js";

export function registerWebviewPanelHistogram(
  context: vscode.ExtensionContext
) {
  // Initial categorization after loading position history
  const fileCounts = categorizePositionsByFileName();
  console.log("Initial file counts:", fileCounts);

  const showFileHistogramCommand = vscode.commands.registerCommand(
    "grandFileNavigator.showFileHistogram",
    () => {
      const panel = vscode.window.createWebviewPanel(
        "fileAccessHistogram",
        "File Access Histogram",
        vscode.ViewColumn.One,
        {}
      );

      //const fileCounts = categorizePositionsByFileName();
      panel.webview.html = getWebviewContent(fileCounts);
    }
  );

  context.subscriptions.push(showFileHistogramCommand);
}

function getWebviewContent(fileCounts: { [fileName: string]: number }): string {
  const labels = Object.keys(fileCounts).map((filePath) =>
    filePath.split("/").pop()
  );
  const data = Object.values(fileCounts);

  const maxCount = Math.max(...data);
  const svgHeight = 1200;
  const svgWidth = 800;
  const barWidth = svgWidth / data.length;
  const textAreaHeight = 100; // Extra space for the file names

  // Generate random colors for each bar using a correct template string
  const colors = labels.map(() => `hsl(${Math.random() * 360}, 70%, 60%)`);

  let barsHtml = data
    .map((count, index) => {
      const barHeight = (count / maxCount) * svgHeight;
      const color = colors[index];
      const xPosition = index * barWidth + barWidth / 2;

      // Determine whether to place the count inside or above the bar
      const yTextPosition =
        barHeight > 20
          ? svgHeight - barHeight + 15
          : svgHeight - barHeight - 20;
      const textAnchor = barHeight > 20 ? "middle" : "start";

      return `
        <rect x="${index * barWidth}" y="${svgHeight - barHeight}" width="${
        barWidth - 2
      }" height="${barHeight}" fill="${color}"></rect>
        <text x="${xPosition}" y="${yTextPosition}" fill="white" text-anchor="middle" font-size="12">${count}</text>
        <text x="${xPosition}" y="${
        svgHeight + 10
      }" fill="white" text-anchor="middle" font-size="10" transform="rotate(-90, ${xPosition}, ${
        svgHeight + 10
      })">${labels[index]}</text>
      `;
    })
    .join("");

  return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>File Access Histogram</title>
        <style>
          text {
            word-wrap: break-word;
          }
        </style>
      </head>
      <body>
        <h1>File Access Histogram</h1>
        <svg width="${svgWidth}" height="${svgHeight + textAreaHeight}">
          ${barsHtml}
        </svg>
      </body>
      </html>
    `;
}
