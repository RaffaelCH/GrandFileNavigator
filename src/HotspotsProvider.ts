import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import {
  getPositionHistory,
  PositionHistory,
  RangeData,
} from "./location-tracking";

// Used for listing the hotspots in the sidebar.
export class HotspotsProvider implements vscode.TreeDataProvider<HotspotNode> {
  constructor(private workspaceRoot: string | undefined) {}

  getTreeItem(element: HotspotNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: HotspotNode): Thenable<HotspotNode[]> {
    if (!this.workspaceRoot) {
      vscode.window.showInformationMessage("No dependency in empty workspace");
      return Promise.resolve([]);
    }

    // Node gets expanded -> show only ranges.
    if (element !== undefined) {
      var ranges = element.ranges.map(
        (range) =>
          new HotspotNode(
            "RangeName", // placeholder
            [range],
            vscode.TreeItemCollapsibleState.None
          )
      );
      return Promise.resolve(ranges);
    }

    return Promise.resolve(this.getTrackedNodes());
  }

  /**
   * Convert the tracked ranges/nodes to tree nodes.
   */
  private getTrackedNodes(): HotspotNode[] {
    var positionHistory = getPositionHistory();

    var treePositions = this.convertPositionsToTree("", positionHistory);
    if (treePositions === undefined) {
      return [];
    }

    var treeViewNodes = treePositions.map(
      (treePosition) =>
        new HotspotNode(
          treePosition.key,
          treePosition.ranges,
          vscode.TreeItemCollapsibleState.Collapsed
        )
    );

    return treeViewNodes;
  }

  // Join paths back together, with all the ranges for each file.
  private convertPositionsToTree(
    relativePath: string,
    positionNode: PositionHistory | RangeData[] | undefined
  ): { key: string; ranges: RangeData[] }[] | undefined {
    if (positionNode === undefined) {
      return undefined;
    }
    if (!(positionNode instanceof PositionHistory)) {
      return [{ key: relativePath, ranges: positionNode }];
    }

    var convertedNodes: { key: string; ranges: RangeData[] }[] = [];
    for (var key in positionNode) {
      var subPath = `${relativePath}/${key}`;
      var convertedSubNodes = this.convertPositionsToTree(
        subPath,
        positionNode[key]
      );
      if (convertedSubNodes === undefined) {
        continue;
      }

      convertedSubNodes.forEach((subNode) => {
        convertedNodes.push(subNode);
      });
    }

    return convertedNodes;
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
    HotspotNode | undefined | null | void
  > = new vscode.EventEmitter<HotspotNode | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    HotspotNode | undefined | null | void
  > = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }
}

class HotspotNode extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly ranges: RangeData[],
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    var importance = ranges
      .reduce(
        (accumulator, nextElement) => accumulator + nextElement.totalDuration,
        0
      )
      .toString();
    super(label, collapsibleState);
    this.tooltip = `${this.label}-${importance}`;
    this.description = importance;
  }

  // iconPath = new vscode.ThemeIcon("refresh"); // reference built-in icon
  iconPath = {
    light: path.join(
      __filename,
      "..",
      "..",
      "resources",
      "light",
      "dependency.svg"
    ),
    dark: path.join(
      __filename,
      "..",
      "..",
      "resources",
      "dark",
      "dependency.svg"
    ),
  };
}
