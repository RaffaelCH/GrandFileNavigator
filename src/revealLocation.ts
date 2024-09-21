import * as vscode from "vscode";
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
  var rootUri =
    vscode.workspace.workspaceFolders &&
    vscode.workspace.workspaceFolders.length > 0
      ? vscode.workspace.workspaceFolders[0].uri.fsPath.replaceAll("\\", "/")
      : undefined;

  if (rootUri === undefined) {
    return;
  }

  var file = rootUri + relativeFilePath;
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
