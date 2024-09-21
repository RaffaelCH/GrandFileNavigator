import FileLocation from "./fileLocation";
import SidebarNode from "./sidebarNode";

export class HistogramNode implements SidebarNode {
  public readonly fileLocation: FileLocation;

  constructor(
    public readonly displayName: string,
    public readonly metricValue: number,
    public readonly filePath: string,
    public readonly startLine: number,
    public readonly endLine: number
  ) {
    this.fileLocation = new FileLocation(filePath, startLine, endLine);
  }
}
