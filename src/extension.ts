// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import {
  readdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  mkdirSync,
} from "fs";
import * as vscode from "vscode";
import { PositionHistory, updateLocationTracking } from "./location-tracking";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log(
    'Congratulations, your extension "grandfilenavigator" is now active!'
  );

  const backupFilename = "backup";
  let storageLocation = context.storageUri;

  if (storageLocation === undefined) {
    vscode.window.showInformationMessage("storage location not defined");
  } else {
    if (!existsSync(storageLocation.fsPath)) {
      mkdirSync(storageLocation.fsPath);
    }

    vscode.window.showInformationMessage(storageLocation.fsPath);
    var existingFiles = readdirSync(storageLocation.fsPath);

    var filePath = vscode.Uri.joinPath(storageLocation, backupFilename);
    if (existingFiles.length === 0) {
      writeFileSync(filePath.fsPath, JSON.stringify({ data: 1 }));
    } else {
      var backupContent = readFileSync(filePath.fsPath).toString();
      var backupData = JSON.parse(backupContent);
      vscode.window.showInformationMessage(
        "Found existing backup with data: " + backupData.data
      );
    }
  }

  // Track the current panel with a webview
  let visualizationPanel: vscode.WebviewPanel | undefined = undefined;

  const openVisualization = vscode.commands.registerCommand(
    "grandfilenavigator.openVisualization",
    () => {
      const columnToShowIn = vscode.window.activeTextEditor
        ? vscode.ViewColumn.Beside
        : undefined;

      if (visualizationPanel) {
        // If we already have a panel, show it in the target column
        visualizationPanel.reveal(columnToShowIn);
      } else {
        // Otherwise, create a new panel
        visualizationPanel = vscode.window.createWebviewPanel(
          "grandFileNavigator",
          "GrandFileNavigator Visualization",
          columnToShowIn || vscode.ViewColumn.Beside,
          {
            enableScripts: true,
            localResourceRoots: [
              vscode.Uri.joinPath(context.extensionUri, "history"),
            ],
          }
        );
        visualizationPanel.webview.html = getVisualizationContent();

        // Pass message back to extension.
        if (visualizationPanel) {
          visualizationPanel.webview.onDidReceiveMessage(
            (message) => {
              switch (message.command) {
                case "alert":
                  vscode.window.showErrorMessage(message.text);
                  return;
              }
            },
            undefined,
            context.subscriptions
          );
        }

        // Reset when the current panel is closed
        visualizationPanel.onDidDispose(
          () => {
            visualizationPanel = undefined;
          },
          null,
          context.subscriptions
        );
      }
    }
  );
  context.subscriptions.push(openVisualization);

  vscode.window.registerWebviewPanelSerializer(
    "grandFileNavigator",
    new GrandFileNavigatorSerializer()
  );

  // Pass message to webview.
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "grandfilenavigator.setVisualizationLocation",
      () => {
        if (!visualizationPanel) {
          return;
        }

        // Send a message to our webview.
        // You can send any JSON serializable data.
        visualizationPanel.webview.postMessage({
          command: "setVisualizationLocation",
          data: vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.document.uri.fsPath
            : "No file open",
        });
      }
    )
  );

  // Track user position.
  var positionHistory = new PositionHistory();
  setInterval(() => {
    updateLocationTracking(positionHistory);
    console.log(JSON.stringify(positionHistory));
  }, 1000);
  // TODO: Add listener for vscode.window.onDidChangeTextEditorVisibleRanges
}

// TODO: Move to separate package.
function getVisualizationContent() {
  return `<!DOCTYPE html>
  <html lang="en">
  <head>
	  <meta charset="UTF-8">
	  <meta name="viewport" content="width=device-width, initial-scale=1.0">
	  <title>GrandFileNavigator Visualization</title>
  </head>
  <body>
	  <p>Here be text.</p>
    <p id="location-display">Initial Location</p>
    <p id="first-startup"></p>
    <script>
        const vscode = acquireVsCodeApi(); // Need to keep track of it!
        const locationDisplay = document.getElementById('location-display');

        // Handle the message inside the webview
        window.addEventListener('message', event => {

            const message = event.data; // The JSON data our extension sent

            switch (message.command) {
                case 'setVisualizationLocation':
                    locationDisplay.textContent = message.data;
                    vscode.postMessage({command: 'alert', text: 'Webview Location was set.'}) // Pass message back to extension.
                    break;
            }
        });

        vscode.setState({isFirstStartup: true})

        const previousState = vscode.getState(); // persisted while hidden, destroyed when panel destroyed
        let isFirstStartup = previousState ? previousState.isFirstStartup : false;
        document.getElementById('first-startup').textContent = isFirstStartup;
    </script>
  </body>
  </html>`;
}

class GrandFileNavigatorSerializer implements vscode.WebviewPanelSerializer {
  async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, state: any) {
    // `state` is the state persisted using `setState` inside the webview
    console.log(`Got state: ${state}`);

    // Restore the content of our webview.
    //
    // Make sure we hold on to the `webviewPanel` passed in here and
    // also restore any event listeners we need on it.
    webviewPanel.webview.html = getVisualizationContent();
  }
}
