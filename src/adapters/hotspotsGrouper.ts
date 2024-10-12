import { NodeType } from "../sidebar_types/NodeType";
import SymbolNode from "../sidebar_types/SymbolNode";

export function adaptImportanceArray(
  importanceArray: [
    number,
    string,
    string,
    number,
    number,
    number,
    string,
    string,
    number
  ][]
): SymbolNode[] {
  return importanceArray.map(
    (el) =>
      new SymbolNode(el[6], el[0], mapNodeType(el[7]), el[1], el[8], el[5])
  );
}

function mapNodeType(symbolKindName: string): NodeType {
  switch (symbolKindName) {
    case "Class":
      return NodeType.Class;
    case "Method":
      return NodeType.Method;
    case "Interface":
      return NodeType.Class;
    case "Enum":
      return NodeType.Class;
    case "Contructor":
      return NodeType.Method;
    case "Field":
      return NodeType.Snippet;
    case "Property":
      return NodeType.Snippet;
    case "Variable":
      return NodeType.Snippet;
    case "EnumMember":
      return NodeType.Snippet;
    case "Package":
      return NodeType.Other;
    case "Namespace":
      return NodeType.Other;
    default:
      return NodeType.Other;
  }
}
