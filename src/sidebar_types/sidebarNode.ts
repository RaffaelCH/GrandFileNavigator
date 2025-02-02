import FileLocation from "./fileLocation";
import { NodeType } from "./NodeType";

export default class SidebarNode {
  public readonly fileLocation: FileLocation;

  constructor(
    public readonly displayName: string,
    public readonly metricValue: number,
    public readonly nodeType: NodeType,
    public readonly filePath: string,
    public readonly startLine: number,
    public readonly endLine: number
  ) {
    this.fileLocation = new FileLocation(filePath, startLine, endLine);
  }
}
