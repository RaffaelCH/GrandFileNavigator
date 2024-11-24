import FileLocation from "./FileLocation";
import { NodeType } from "./NodeType";

export default class SymbolNode {
  constructor(
    public readonly displayName: string,
    public readonly metricValue: number,
    public readonly nodeType: NodeType,
    public readonly filePath: string,
    public readonly startLine: number,
    public readonly endLine: number,
    public readonly timeVisible: number,
    public readonly additionalInformation: string = "" // Shown when clicking on node.
  ) {}
}
