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
    public fileName: string, // TODO: Use relative path?
    public hotspotRangeStartLine: number, // TODO: Remove?
    public hotspotsRangeEndLine: number, // TODO: Remove?
    public timeSpent: number,
    public symbolName: string,
    public symbolKindName: string,
    public symbolLine: number, // line where symbol is defined
    public symbolEndLine: number // endLine of symbol definition range
  ) {}
}

const enrichedHotspotsFilename = "enrichedHotspots.json";
const importanceArrayFilename = "importanceArray.json";
let importanceArray: ImportanceElement[] = []; // Global 2D array with line number

export async function enrichHotspotsByType(
  hotspots: PositionHistory,
  context: vscode.ExtensionContext
): Promise<EnrichedHotspot[]> {
  const enrichedHotspots: EnrichedHotspot[] = [];
  const symbolTypeCounts: { [key: string]: number } = {};

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

  importanceArray = enrichedHotspots.flatMap((hotspot) => {
    return hotspot.symbols.map(
      (symbolDetail): ImportanceElement =>
        new ImportanceElement(
          hotspot.importance,
          path.basename(hotspot.filePath),
          hotspot.rangeData.startLine,
          hotspot.rangeData.endLine,
          hotspot.timeSpent, // Time spent in hotspot
          symbolDetail.symbolName, // Actual symbol (e.g., "FlywayAutoConfigurationTests")
          getSymbolKindName(symbolDetail.symbolType), // Symbol type (e.g., "Class", "Method")
          symbolDetail.symbolLine, // Line number where the symbol was encountered
          symbolDetail.symbolEndLine
        )
    );
  });

  await saveHotspotData(context, enrichedHotspots, importanceArray);

  return enrichedHotspots;
}

// Helper function to save enrichedHotspots and importanceArray
async function saveHotspotData(
  context: vscode.ExtensionContext,
  enrichedHotspots: EnrichedHotspot[],
  importanceArray: ImportanceElement[]
) {
  try {
    const storageUri = context.storageUri || context.globalStorageUri;

    if (storageUri) {
      // Save enrichedHotspots
      const enrichedHotspotsFilePath = path.join(
        storageUri.fsPath,
        enrichedHotspotsFilename
      );
      writeFileSync(
        enrichedHotspotsFilePath,
        JSON.stringify(enrichedHotspots, null, 2)
      );

      // Save importanceArray
      const importanceFilePath = path.join(
        storageUri.fsPath,
        importanceArrayFilename
      );
      writeFileSync(
        importanceFilePath,
        JSON.stringify(importanceArray, null, 2)
      );

      //vscode.window.showInformationMessage("Enriched Hotspots and Importance Array have been written to storage.");
    } else {
      vscode.window.showErrorMessage("Unable to access storage location.");
    }
  } catch (error) {
    vscode.window.showErrorMessage(
      `Error saving data: ${(error as Error).message}`
    );
  }
}

function getSymbolKindName(symbolKind: number): string {
  switch (symbolKind) {
    case vscode.SymbolKind.Class:
      return "Class";
    case vscode.SymbolKind.Method:
      return "Method";
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

export function getImportanceArray(): ImportanceElement[] {
  return importanceArray;
}

// TODO: Think about better ways to combine the entries, esp. at earlier stages.
export function getCondensedImportanceArray(): ImportanceElement[] {
  let condensed = new Map<string, ImportanceElement>();
  importanceArray.forEach((element) => {
    let key = element.symbolName + element.symbolLine;
    let existingElement = condensed.get(key);
    if (existingElement) {
      existingElement.importance += element.importance;
      existingElement.timeSpent += element.timeSpent;
    } else {
      condensed.set(key, { ...element });
    }
  });

  return Array.from(condensed.values());
}

const symbolWeights: { [key: number]: number } = {
  [vscode.SymbolKind.Class]: 10,
  [vscode.SymbolKind.Interface]: 9,
  [vscode.SymbolKind.Enum]: 8,
  [vscode.SymbolKind.Constructor]: 7,
  [vscode.SymbolKind.Method]: 6,
  [vscode.SymbolKind.Field]: 4,
  [vscode.SymbolKind.Property]: 4,
  [vscode.SymbolKind.Variable]: 3,
  [vscode.SymbolKind.EnumMember]: 5,
  [vscode.SymbolKind.Package]: 6,
  [vscode.SymbolKind.Namespace]: 6,
};

function calculateImportance(
  symbols: Array<{ symbolType: number; symbolName: string }>,
  timeSpent: number
): number {
  const symbolImportance = symbols.reduce((total, symbol) => {
    const weight = symbolWeights[symbol.symbolType] || 1;
    return total + weight;
  }, 0);

  const timeFactor = 1 + Math.log(timeSpent + 1);
  return symbolImportance * timeFactor;
}

async function traverseHotspots(
  positionHistory: PositionHistory,
  parentPath: string,
  enrichedHotspots: EnrichedHotspot[],
  symbolTypeCounts: { [key: string]: number }
) {
  for (const [key, value] of Object.entries(positionHistory)) {
    const fullPath = path.join(parentPath, key); // TODO: Fix, as range data frmo other files might be present.

    if (value instanceof PositionHistory) {
      await traverseHotspots(
        value,
        fullPath,
        enrichedHotspots,
        symbolTypeCounts
      );
    } else if (
      Array.isArray(value) &&
      value.length > 0 &&
      value[0] instanceof RangeData
    ) {
      try {
        const resolvedFilePath = vscode.Uri.file(fullPath);
        if (!existsSync(resolvedFilePath.fsPath)) {
          continue;
        }

        const document = await vscode.workspace.openTextDocument(
          resolvedFilePath
        );

        // TODO: Add caching.
        const symbols = await vscode.commands.executeCommand<
          vscode.DocumentSymbol[]
        >("vscode.executeDocumentSymbolProvider", document.uri);

        if (symbols) {
          for (const rangeData of value) {
            const matchingSymbols = await findAllMatchingSymbols(
              symbols,
              rangeData,
              document
            );

            if (matchingSymbols.length > 0) {
              const symbolDetails = matchingSymbols.map((matchingSymbol) => ({
                symbolType: matchingSymbol.kind,
                symbolName: matchingSymbol.name,
                symbolLine: matchingSymbol.range.start.line, // Capture the line number where the symbol starts
                symbolEndLine: matchingSymbol.range.end.line,
              }));

              const importance = calculateImportance(
                symbolDetails,
                rangeData.totalDuration
              );

              enrichedHotspots.push({
                filePath: resolvedFilePath.fsPath,
                rangeData,
                symbols: symbolDetails,
                timeSpent: rangeData.totalDuration,
                importance,
              });
            }
          }
        }
      } catch (error) {
        if (error instanceof Error) {
          vscode.window.showErrorMessage(
            `Error opening file ${fullPath}: ${error.message}`
          );
        } else {
          vscode.window.showErrorMessage(`Error opening file: ${error}`);
        }
      }
    }
  }
}

async function findAllMatchingSymbols(
  symbols: vscode.DocumentSymbol[],
  rangeData: RangeData,
  document: vscode.TextDocument
): Promise<vscode.DocumentSymbol[]> {
  const matchingSymbols: vscode.DocumentSymbol[] = [];

  function isCommentLine(line: string): boolean {
    return (
      line.trim().startsWith("//") ||
      line.trim().startsWith("/*") ||
      line.trim().startsWith("*")
    );
  }

  async function findSymbols(symbols: vscode.DocumentSymbol[]) {
    for (const symbol of symbols) {
      let symbolStartLine = symbol.range.start.line;
      const symbolEndLine = symbol.range.end.line;

      // Adjust symbolStartLine to skip comments
      while (symbolStartLine <= symbolEndLine) {
        const lineText = document.lineAt(symbolStartLine).text;
        if (!isCommentLine(lineText)) {
          break;
        }
        symbolStartLine++;
      }

      const correctedStartPosition = new vscode.Position(symbolStartLine, 0);
      const correctedEndPosition = new vscode.Position(
        symbolEndLine,
        symbol.range.end.character
      );

      if (
        correctedStartPosition.line <= rangeData.endLine &&
        correctedEndPosition.line >= rangeData.startLine
      ) {
        matchingSymbols.push({
          ...symbol,
          range: new vscode.Range(correctedStartPosition, correctedEndPosition),
        });
      }

      if (symbol.children) {
        await findSymbols(symbol.children);
      }
    }
  }

  await findSymbols(symbols);
  return matchingSymbols;
}
