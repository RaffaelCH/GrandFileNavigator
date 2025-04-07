/* 

an importance array element is unique by this composite key:
file path, range start line, range end line

importance array element shares 
(fileName, startLine, endLine, timeSpent, importance) 
and differs by 
(symbolName, symbolKindName)

*/

import * as vscode from "vscode";
import {
  RangeData,
  PositionHistory,
  getPositionHistory,
} from "./location-tracking";
import * as path from "path";
import { existsSync, writeFileSync } from "fs";
import { logMessage } from "./extension";

interface BasicHotspot {
  filePath: string;
  startLine: number;
  endLine: number;
  totalDuration: number; // Summed from duplicates
}

export interface EnrichedHotspot {
  filePath: string; // Absolute file path
  rangeData: RangeData;
  symbols: Array<{
    symbolType: number;
    symbolName: string;
    symbolLine: number;
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

const enrichedHotspotsFilename = "enrichedHotspots.json";
const importanceArrayFilename = "importanceArray.json";
let importanceArray: ImportanceElement[] = [];

export async function updateHotspotsData(
  hotspots: PositionHistory
): Promise<EnrichedHotspot[]> {
  const mergedHotspots: BasicHotspot[] = collectAndMergeAllHotspots(hotspots);

  const enrichedHotspots: EnrichedHotspot[] =
    await resolveSymbolsAndEnrichHotspots(mergedHotspots);

  importanceArray = enrichedHotspots.flatMap((hotspot) => {
    return hotspot.symbols.map(
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
  });

  return enrichedHotspots;
}

/*
 1) Merge hotspots from PositionHistory.
 2) Enrich them by symbol lookups.
 3) Flatten into an importance array.
 4) Save to JSON files in the extension's FS.
 */
export async function enrichHotspotsByType(
  hotspots: PositionHistory,
  context: vscode.ExtensionContext
): Promise<EnrichedHotspot[]> {
  let enrichedHotspots = await updateHotspotsData(hotspots);
  await saveHotspotData(context, enrichedHotspots, importanceArray);

  logMessage(
    context.storageUri || context.globalStorageUri,
    `[enrichHotspotsByType] Done. importanceArray length=${importanceArray.length}`
  );

  return enrichedHotspots;
}

function collectAndMergeAllHotspots(hotspots: PositionHistory): BasicHotspot[] {
  const mergedMap: Map<string, BasicHotspot> = new Map();

  let workspaceRoot = "";
  const ws = vscode.workspace.workspaceFolders;
  if (ws && ws.length > 0) {
    workspaceRoot = ws[0].uri.fsPath;
  }

  function isRangeDataArray(arr: unknown): arr is RangeData[] {
    if (!Array.isArray(arr) || arr.length === 0) {
      return false;
    }
    const firstElement = arr[0];
    return (
      typeof firstElement === "object" &&
      firstElement !== null &&
      "startLine" in firstElement &&
      "endLine" in firstElement &&
      "totalDuration" in firstElement
    );
  }

  function traverseHistory(history: PositionHistory, parentPath: string) {
    for (const key of Object.keys(history)) {
      const value = history[key];

      const nextFullPath = path.join(parentPath, key);

      if (isRangeDataArray(value)) {
        for (const range of value) {
          if (!existsSync(nextFullPath)) {
            continue;
          }

          const absoluteFilePath = path.resolve(nextFullPath);
          const uniqueKey = `${absoluteFilePath}:${range.startLine}-${range.endLine}`;

          const existing = mergedMap.get(uniqueKey);
          if (existing) {
            existing.totalDuration += range.totalDuration;
          } else {
            mergedMap.set(uniqueKey, {
              filePath: absoluteFilePath,
              startLine: range.startLine,
              endLine: range.endLine,
              totalDuration: range.totalDuration,
            });
          }
        }
      } else if (value && typeof value === "object") {
        traverseHistory(value as PositionHistory, nextFullPath);
      }
    }
  }

  traverseHistory(hotspots, workspaceRoot);
  return Array.from(mergedMap.values());
}

async function resolveSymbolsAndEnrichHotspots(
  basicHotspots: BasicHotspot[]
): Promise<EnrichedHotspot[]> {
  // Group by filePath and do one DocumentSymbolProvider call per file
  const byFileMap: Map<string, BasicHotspot[]> = new Map();
  for (const hotspot of basicHotspots) {
    const arr = byFileMap.get(hotspot.filePath) || [];
    arr.push(hotspot);
    byFileMap.set(hotspot.filePath, arr);
  }

  const enrichedResults: EnrichedHotspot[] = [];

  for (const [filePath, hotspotsInFile] of byFileMap.entries()) {
    if (!existsSync(filePath)) {
      continue;
    }

    let symbols: vscode.DocumentSymbol[] = [];
    try {
      const docUri = vscode.Uri.file(filePath);
      const document = await vscode.workspace.openTextDocument(docUri);
      const docSymbols = await vscode.commands.executeCommand<
        vscode.DocumentSymbol[]
      >("vscode.executeDocumentSymbolProvider", document.uri);
      symbols = docSymbols || [];
    } catch (err) {
      continue;
    }

    for (const hotspot of hotspotsInFile) {
      const rangeData = new RangeData(
        hotspot.startLine,
        hotspot.endLine,
        hotspot.totalDuration
      );
      const matchingSymbols = findAllMatchingSymbols(symbols, rangeData);

      const symbolDetails = matchingSymbols.map((ms) => ({
        symbolType: ms.kind,
        symbolName: ms.name,
        symbolLine: ms.range.start.line,
        symbolEndLine: ms.range.end.line,
      }));

      const importance = calculateImportance(
        symbolDetails,
        hotspot.totalDuration
      );

      enrichedResults.push({
        filePath,
        rangeData,
        symbols: symbolDetails,
        timeSpent: hotspot.totalDuration,
        importance,
      });
    }
  }

  return enrichedResults;
}

function findAllMatchingSymbols(
  allSymbols: vscode.DocumentSymbol[],
  rangeData: RangeData
): vscode.DocumentSymbol[] {
  const matchingSymbols: vscode.DocumentSymbol[] = [];

  function recurse(symbols: vscode.DocumentSymbol[]) {
    for (const sym of symbols) {
      const symStart = sym.range.start.line;
      const symEnd = sym.range.end.line;

      // Overlap check
      if (symStart <= rangeData.endLine && symEnd >= rangeData.startLine) {
        matchingSymbols.push(sym);
      }
      if (sym.children && sym.children.length > 0) {
        recurse(sym.children);
      }
    }
  }

  recurse(allSymbols);
  return matchingSymbols;
}

function calculateImportance(
  symbols: Array<{ symbolType: number; symbolName: string }>,
  timeSpent: number
): number {
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

  const symbolImportance = symbols.reduce((acc, s) => {
    return acc + (symbolWeights[s.symbolType] || 1);
  }, 0);

  const timeFactor = 1 + Math.log(timeSpent + 1);
  return symbolImportance * timeFactor;
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

async function saveHotspotData(
  context: vscode.ExtensionContext,
  enrichedHotspots: EnrichedHotspot[],
  importanceArray: ImportanceElement[]
) {
  try {
    const storageUri = context.storageUri || context.globalStorageUri;
    if (!storageUri) {
      vscode.window.showErrorMessage("Unable to access storage location.");
      return;
    }

    const enrichedHotspotsFilePath = path.join(
      storageUri.fsPath,
      enrichedHotspotsFilename
    );
    writeFileSync(
      enrichedHotspotsFilePath,
      JSON.stringify(enrichedHotspots, null, 2)
    );

    const importanceFilePath = path.join(
      storageUri.fsPath,
      importanceArrayFilename
    );
    writeFileSync(importanceFilePath, JSON.stringify(importanceArray, null, 2));
  } catch (error) {
    vscode.window.showErrorMessage(
      `Error saving data: ${(error as Error).message}`
    );
  }
}

export function getImportanceArray(): ImportanceElement[] {
  return importanceArray;
}

export function getCondensedImportanceArray(): ImportanceElement[] {
  const condensed = new Map<string, ImportanceElement>();
  importanceArray.forEach((element) => {
    const key = element.symbolName + element.symbolLine + element.fileName;
    const existing = condensed.get(key);
    if (existing) {
      existing.importance += element.importance;
      existing.timeSpent += element.timeSpent;
    } else {
      condensed.set(key, { ...element });
    }
  });
  return Array.from(condensed.values());
}
