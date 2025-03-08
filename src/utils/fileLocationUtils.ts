import * as vscode from "vscode";
import FileLocation from "../sidebar_types/FileLocation";

export async function getFileLocation(
  fileUri: vscode.Uri
): Promise<FileLocation | undefined> {
  try {
    const document = await vscode.workspace.openTextDocument(fileUri);
    const totalLines = document.lineCount;
    const startLine = 0;
    const endLine = totalLines - 1;
    return new FileLocation(fileUri.fsPath, startLine, endLine);
  } catch (error) {
    vscode.window.showErrorMessage(
      `Error getting file location for ${fileUri.fsPath}: ${error}`
    );
    return undefined;
  }
}
