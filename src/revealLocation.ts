import * as vscode from "vscode";
import * as fs from "fs";
import FileLocation from "./sidebar_types/fileLocation";



export function revealFileLocation(fileLocation: FileLocation) {
  revealLocation(
    fileLocation.filePath,
    fileLocation.startLine,
    fileLocation.endLine
  );
}

export function revealLocation(
  relativeFilePath: string,
  startLine: number,
  endLine: number
) {
  var isFullFilePath = fs.existsSync(relativeFilePath.slice(1));

  if (isFullFilePath) {
    var file = relativeFilePath.slice(1);
  } else {
    var rootUri = getRootUri(relativeFilePath);

    if (rootUri === undefined) {
      console.log("File path not recognized: " + relativeFilePath);
      return;
    }

    if (
      vscode.workspace.workspaceFolders &&
      vscode.workspace.workspaceFolders.length > 1
    ) {
      var file = rootUri
        .split("/")
        .slice(0, -1)
        .concat(relativeFilePath)
        .join("/");
    } else {
      var file = rootUri + "/" + relativeFilePath;
    }
  }

  vscode.workspace.openTextDocument(file).then(
    (document: vscode.TextDocument) => {
      vscode.window.showTextDocument(document, 1, false).then((editor) => {
        editor.revealRange(
          new vscode.Range(
            new vscode.Position(startLine, 0),
            new vscode.Position(endLine, 0)
          )
        );
      });
    },
    (error: any) => {
      console.error(error);
    }
  );
}

function getRootUri(relativeFilePath: string): string | undefined {
  if (
    !vscode.workspace.workspaceFolders ||
    vscode.workspace.workspaceFolders.length === 0
  ) {
    return undefined;
  }

  if (vscode.workspace.workspaceFolders.length === 1) {
    return vscode.workspace.workspaceFolders[0].uri.fsPath.replaceAll(
      "\\",
      "/"
    );
  }

  for (let i = 0; i < vscode.workspace.workspaceFolders.length; ++i) {
    let rootFolder = vscode.workspace.workspaceFolders[i];
    let rootPath = rootFolder.uri.fsPath.replaceAll("\\", "/");
    let parentDir = rootPath.split("/").at(-1);
    if (parentDir === relativeFilePath.split("/")[0]) {
      return rootPath;
    }
  }
}
