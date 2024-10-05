import * as vscode from "vscode";
import { RangeData, PositionHistory } from "./location-tracking";
import * as path from "path";
import { existsSync, writeFileSync } from "fs";

interface EnrichedHotspot {
  filePath: string;
  rangeData: RangeData;
  symbols: Array<{
    symbolType: number; // Corresponds to vscode.SymbolKind
    symbolName: string;
  }>;
  timeSpent: number; 
  importance: number;
}

const enrichedHotspotsFilename = "enrichedHotspots.json"; 
const importanceArrayFilename = "importanceArray.json"; 
let importanceArray: [number, string, string, number, number, number, string, string][] = []; // Global 2D array

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

  // Sort by startLine before creating the array
  enrichedHotspots.sort(
    (a, b) => a.rangeData.startLine - b.rangeData.startLine
  );

  importanceArray = enrichedHotspots.flatMap((hotspot) => {
    return hotspot.symbols.map((symbolDetail): [number, string, string, number, number, number, string, string] => [
        hotspot.importance,   
        path.basename(hotspot.filePath),  
        `${hotspot.rangeData.startLine}-${hotspot.rangeData.endLine}`,  
        hotspot.rangeData.startLine,  
        hotspot.rangeData.endLine,    
        hotspot.timeSpent,            
        symbolDetail.symbolName,      
        getSymbolKindName(symbolDetail.symbolType)
    ]);
  });

  // Save the enriched hotspots and importance array to JSON
  await saveHotspotData(context, enrichedHotspots, importanceArray);

  return enrichedHotspots;
}

// Helper function to save enrichedHotspots and importanceArray
async function saveHotspotData(
  context: vscode.ExtensionContext,
  enrichedHotspots: EnrichedHotspot[],
  importanceArray: [number, string, string, number, number, number, string, string][]
) {
  try {
    const storageUri = context.storageUri || context.globalStorageUri;

    if (storageUri) {
      // Save enrichedHotspots
      const enrichedHotspotsFilePath = vscode.Uri.joinPath(
        storageUri,
        enrichedHotspotsFilename
      ).fsPath;
      writeFileSync(enrichedHotspotsFilePath, JSON.stringify(enrichedHotspots, null, 2));

      // Save importanceArray
      const importanceFilePath = vscode.Uri.joinPath(
        storageUri,
        importanceArrayFilename
      ).fsPath;
      writeFileSync(importanceFilePath, JSON.stringify(importanceArray, null, 2));

      vscode.window.showInformationMessage("Enriched Hotspots and Importance Array have been written to storage.");
    } else {
      vscode.window.showErrorMessage("Unable to access storage location.");
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Error saving data: ${(error as Error).message}`);
  }
}

// Retrieve the 2D array of importance and line range
export function getImportanceArray(): [number, string, string, number, number, number, string, string][] {
  return importanceArray;
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

  // scaling time spent to smooth out long durations
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
    const fullPath = path.join(parentPath, key);

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

        const symbols = await vscode.commands.executeCommand<
          vscode.DocumentSymbol[]
        >("vscode.executeDocumentSymbolProvider", document.uri);

        if (symbols) {
          for (const rangeData of value) {
            const matchingSymbols = findAllMatchingSymbols(symbols, rangeData);

            if (matchingSymbols.length > 0) {
              const symbolDetails = matchingSymbols.map((matchingSymbol) => ({
                symbolType: matchingSymbol.kind,
                symbolName: matchingSymbol.name,
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

function findAllMatchingSymbols(symbols: vscode.DocumentSymbol[], rangeData: RangeData): vscode.DocumentSymbol[] {
  const matchingSymbols: vscode.DocumentSymbol[] = [];

  function findSymbols(symbols: vscode.DocumentSymbol[]) {
      for (const symbol of symbols) {
          console.log(`Checking Symbol: ${symbol.name}, Symbol Kind: ${vscode.SymbolKind[symbol.kind]}, Symbol Range: ${symbol.range.start.line}-${symbol.range.end.line}`);

          if (
              symbol.range.start.line <= rangeData.endLine && 
              symbol.range.end.line >= rangeData.startLine
          ) {
              matchingSymbols.push(symbol);
          }

          // Recursively search through child symbols
          if (symbol.children) {
              findSymbols(symbol.children);
          }
      }
  }

  findSymbols(symbols);
  return matchingSymbols;
}
