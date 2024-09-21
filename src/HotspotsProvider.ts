import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import {
  getPositionHistory,
  PositionHistory,
  RangeData,
} from "./location-tracking.js";
import { revealLocation } from "./revealLocation.js";

// Used for listing the hotspots in the sidebar.
export class HotspotsProvider
  implements vscode.TreeDataProvider<FilesystemNode | RangeNode>
{
  constructor(private workspaceRoot: string | undefined) {}

  getTreeItem(element: FilesystemNode | RangeNode): vscode.TreeItem {
    return element;
  }

  getChildren(
    element?: FilesystemNode
  ): Thenable<(FilesystemNode | RangeNode)[]> {
    if (!this.workspaceRoot) {
      vscode.window.showInformationMessage("No dependency in empty workspace");
      return Promise.resolve([]);
    }

    // Node is directory -> expand subdirectories
    if (element instanceof FilesystemNode) {
      return Promise.resolve(element.children);
    }

    return Promise.resolve(this.getTrackedNodes());
  }

  /**
   * Convert the tracked ranges/nodes to tree nodes.
   */
  private getTrackedNodes(): (FilesystemNode | RangeNode)[] {
    var positionHistory = getPositionHistory();

    var treePositions = this.convertPositionsToTree("", "", positionHistory);
    if (treePositions === undefined) {
      return [];
    }

    return treePositions;
  }

  // Join paths back together, with all the ranges for each file.
  private convertPositionsToTree(
    fullPath: string,
    relativePath: string,
    positionNode: PositionHistory | RangeData[] | undefined
  ): (FilesystemNode | RangeNode)[] | undefined {
    if (positionNode === undefined) {
      return undefined;
    }

    // Node is RangeData[] -> create leaf nodes.
    if (Array.isArray(positionNode) && positionNode[0] instanceof RangeData) {
      var convertedNodes = positionNode.map((rangeData) => {
        return new RangeNode(
          "Placeholder", // TODO: Give name.
          fullPath,
          rangeData.totalDuration,
          rangeData.startLine,
          rangeData.endLine
        );
      });
      return convertedNodes;
    }

    if (!(positionNode instanceof PositionHistory)) {
      return undefined;
    }

    // Only one tracked subdirectory -> combine directories.
    if (Object.keys(positionNode).length === 1) {
      var key = Object.keys(positionNode)[0];
      var fullPath = fullPath + "/" + key;
      var subPath = relativePath + "/" + key;
      return this.convertPositionsToTree(fullPath, subPath, positionNode[key]);
    }

    var children: FilesystemNode[] = [];
    for (var key in positionNode) {
      var childNodes = this.convertPositionsToTree(
        fullPath + "/" + key,
        key,
        positionNode[key]
      );

      if (childNodes === undefined) {
        continue;
      }

      let node = new FilesystemNode(
        key,
        childNodes,
        vscode.TreeItemCollapsibleState.Collapsed
      );
      children.push(node);
    }

    return [
      new FilesystemNode(
        relativePath,
        children,
        vscode.TreeItemCollapsibleState.Collapsed
      ),
    ];
  }

  private pathExists(p: string): boolean {
    try {
      fs.accessSync(p);
    } catch (err) {
      return false;
    }
    return true;
  }

  // React to a tree node being changed.
  private _onDidChangeTreeData: vscode.EventEmitter<
    FilesystemNode | RangeNode | undefined | null | void
  > = new vscode.EventEmitter<
    FilesystemNode | RangeNode | undefined | null | void
  >();
  readonly onDidChangeTreeData: vscode.Event<
    FilesystemNode | RangeNode | undefined | null | void
  > = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }
}

class FilesystemNode extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly children: (FilesystemNode | RangeNode)[],
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(label, collapsibleState);
    this.importance = children.reduce(
      (accumulator, nextElement) => accumulator + nextElement.importance,
      0
    );
    this.tooltip = `${this.label}-${this.importance}`;
    this.description = "Importance: " + this.importance.toString();
  }
  importance: number;

  iconPath = {
    light: path.join(
      __filename,
      "..",
      "..",
      "resources",
      "light",
      "symbol-file.svg"
    ),
    dark: path.join(
      __filename,
      "..",
      "..",
      "resources",
      "dark",
      "symbol-file.svg"
    ),
  };
}

class RangeNode extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly filePath: string,
    public readonly importance: number,
    public readonly startLine: number,
    public readonly endLine: number
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.tooltip = `${this.label}-${importance}-[${this.startLine}, ${this.endLine}]`;
    this.description = importance.toString();
    this.filePath = filePath;
    this.contextValue = "range"; // used to determine when command is shown in item context
  }

  // TODO: Implement icons.
  // iconPath = new vscode.ThemeIcon("refresh"); // reference built-in icon
  iconPath = {
    light: path.join(
      __filename,
      "..",
      "..",
      "resources",
      "light",
      "list-selection.svg"
    ),
    dark: path.join(
      __filename,
      "..",
      "..",
      "resources",
      "dark",
      "list-selection.svg"
    ),
  };
}

export function revealNodeLocation(node: RangeNode) {
  revealLocation(node.filePath, node.startLine, node.endLine);
}
