import FileLocation from "./FileLocation";
import { NodeType } from "./NodeType";

export default class SymbolNode {
  constructor(
    public readonly symbolName: string,
    public readonly metricValue: number,
    public readonly symbolType: NodeType,
    public readonly filePath: string,
    public readonly startLine: number,
    public readonly endLine: number,
    public readonly timeVisible: number
  ) {}
}
