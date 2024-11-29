import * as vscode from "vscode";
import { RangeData, PositionHistory } from "./location-tracking";
import * as path from "path"; // Using Node.js path module
import { existsSync, writeFileSync } from "fs";

export interface EnrichedHotspot {
  filePath: string;
  rangeData: RangeData;
  symbols: Array<{
    symbolType: number; // Corresponds to vscode.SymbolKind
    symbolName: string;
    symbolLine: number; // Line number where the symbol was found
    symbolEndLine: number;
  }>;
  timeSpent: number;
  importance: number;
}

export class ImportanceElement {
  constructor(
    public importance: number,
    public fileName: string,
    public hotspotRangeStartLine: number,
    public hotspotsRangeEndLine: number,
    public timeSpent: number,
    public symbolName: string,
    public symbolKindName: string,
    public symbolLine: number,
    public symbolEndLine: number
  ) {}
}

// Define valid language keys as a union type
type LanguageId = "java" | "python" | "javascript" | "typescript" | "rust";

const importanceArrayFilenames: Record<LanguageId, string> = {
  java: "importanceArrayJava.json",
  python: "importanceArrayPython.json",
  javascript: "importanceArrayJavaScript.json",
  typescript: "importanceArrayTypeScript.json",
  rust: "importanceArrayRust.json",
};

// Initialize with all keys
let importanceArrays: Record<LanguageId, ImportanceElement[]> = {
  java: [],
  python: [],
  javascript: [],
  typescript: [],
  rust: [],
};

export async function enrichHotspotsByType(
  hotspots: PositionHistory,
  context: vscode.ExtensionContext
): Promise<EnrichedHotspot[]> {
  const enrichedHotspots: EnrichedHotspot[] = [];
  const symbolTypeCounts: Record<string, number> = {};

  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showErrorMessage("No workspace folder found.");
    return [];
  }

  const workspaceRoot = workspaceFolders[0].uri.fsPath;
  await traverseHotspots(
    hotspots,
    workspaceRoot,
    enrichedHotspots,
    symbolTypeCounts
  );

  enrichedHotspots.sort(
    (a, b) => a.rangeData.startLine - b.rangeData.startLine
  );

  for (const hotspot of enrichedHotspots) {
    const languageId = getLanguageIdFromFilePath(hotspot.filePath) as LanguageId;
    if (!languageId) continue;

    const importanceElements = hotspot.symbols.map(
      (symbolDetail): ImportanceElement =>
        new ImportanceElement(
          hotspot.importance,
          path.basename(hotspot.filePath),
          hotspot.rangeData.startLine,
          hotspot.rangeData.endLine,
          hotspot.timeSpent,
          symbolDetail.symbolName,
          getSymbolKindName(symbolDetail.symbolType),
          symbolDetail.symbolLine,
          symbolDetail.symbolEndLine
        )
    );

    importanceArrays[languageId].push(...importanceElements);
  }

  // Save importance arrays per language
  await saveImportanceArrays(context, importanceArrays);

  return enrichedHotspots;
}

// Helper function to get the language ID from the file extension
function getLanguageIdFromFilePath(filePath: string): LanguageId | undefined {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".java":
      return "java";
    case ".py":
      return "python";
    case ".js":
      return "javascript";
    case ".ts":
      return "typescript";
    case ".rs":
      return "rust";
    default:
      return undefined;
  }
}

// Helper function to save importance arrays per language
async function saveImportanceArrays(
  context: vscode.ExtensionContext,
  importanceArrays: Record<LanguageId, ImportanceElement[]>
) {
  try {
    const storageUri = context.storageUri || context.globalStorageUri;
    if (storageUri) {
      for (const languageId in importanceArrays) {
        const importanceArray = importanceArrays[languageId as LanguageId];
        const importanceFileName = importanceArrayFilenames[languageId as LanguageId];
        if (!importanceFileName) continue;

        const importanceFilePath = path.join(storageUri.fsPath, importanceFileName);
        writeFileSync(
          importanceFilePath,
          JSON.stringify(importanceArray, null, 2)
        );
      }
    } else {
      vscode.window.showErrorMessage("Unable to access storage location.");
    }
  } catch (error) {
    vscode.window.showErrorMessage(
      `Error saving data: ${(error as Error).message}`
    );
  }
}

// Mock implementation of traverseHotspots
async function traverseHotspots(
  positionHistory: PositionHistory,
  parentPath: string,
  enrichedHotspots: EnrichedHotspot[],
  symbolTypeCounts: Record<string, number>
) {
  // Your actual implementation should replace this.
  console.log("Traversing hotspots...");
}

// Get human-readable symbol kind name
function getSymbolKindName(symbolKind: number): string {
  switch (symbolKind) {
    case vscode.SymbolKind.Class:
      return "Class";
    case vscode.SymbolKind.Method:
      return "Method";
    case vscode.SymbolKind.Function:
      return "Function";
    case vscode.SymbolKind.Interface:
      return "Interface";
    case vscode.SymbolKind.Enum:
      return "Enum";
    case vscode.SymbolKind.Constructor:
      return "Constructor";
    case vscode.SymbolKind.Field:
      return "Field";
    case vscode.SymbolKind.Property:
      return "Property";
    case vscode.SymbolKind.Variable:
      return "Variable";
    case vscode.SymbolKind.Struct:
      return "Struct";
    case vscode.SymbolKind.Module:
      return "Module";
    case vscode.SymbolKind.EnumMember:
      return "EnumMember";
    case vscode.SymbolKind.Package:
      return "Package";
    case vscode.SymbolKind.Namespace:
      return "Namespace";
    default:
      return "Unknown";
  }
}

// Function to condense importance arrays
export function getCondensedImportanceArray(
  languageId: string
): ImportanceElement[] {
  const importanceArray = importanceArrays[languageId as LanguageId];
  const condensed = new Map<string, ImportanceElement>();

  importanceArray.forEach((element) => {
    const key = `${element.symbolName}-${element.symbolLine}`; // Unique key
    const existingElement = condensed.get(key);

    if (existingElement) {
      existingElement.importance += element.importance;
      existingElement.timeSpent += element.timeSpent;
    } else {
      condensed.set(key, { ...element });
    }
  });

  return Array.from(condensed.values());
}
