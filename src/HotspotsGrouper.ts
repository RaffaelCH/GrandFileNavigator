import * as vscode from 'vscode';
import { RangeData, PositionHistory } from './location-tracking';
import * as path from 'path';
import { existsSync, mkdirSync, writeFileSync } from "fs";

interface EnrichedHotspot {
    filePath: string;
    rangeData: RangeData;
    symbols: Array<{
        symbolType: number;  // Corresponds to vscode.SymbolKind
        symbolName: string;
    }>;
    timeSpent: number;   // Time spent in the hotspot (from RangeData.totalDuration)
    importance: number;  // Calculated importance
}

const enrichedHotspotsFilename = "enrichedHotspots.json"; // File name
let importanceArray: [number, string][] = [];  // Global 2D array to store importance and labels

export async function enrichHotspotsByType(hotspots: PositionHistory, context: vscode.ExtensionContext): Promise<EnrichedHotspot[]> {
    const enrichedHotspots: EnrichedHotspot[] = [];
    const symbolTypeCounts: { [key: string]: number } = {}; 

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('No workspace folder found.');
        return [];
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    await traverseHotspots(hotspots, workspaceRoot, enrichedHotspots, symbolTypeCounts);

    // Sort enrichedHotspots by startLine before creating the 2D array
    enrichedHotspots.sort((a, b) => a.rangeData.startLine - b.rangeData.startLine);

    // Save the enriched hotspots to JSON
    try {
        const storageUri = context.storageUri || context.globalStorageUri;
        if (storageUri) {
            const filePath = vscode.Uri.joinPath(storageUri, enrichedHotspotsFilename).fsPath;
            writeFileSync(filePath, JSON.stringify(enrichedHotspots, null, 2));
            console.log(`Enriched Hotspots have been written to ${filePath}`);
        } else {
            vscode.window.showErrorMessage('Unable to access storage location.');
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Error saving enriched hotspots: ${error.message}`);
    }

    importanceArray = enrichedHotspots.map(hotspot => [
        hotspot.importance,  
        `${hotspot.rangeData.startLine}-${hotspot.rangeData.endLine}`  
    ]);

    console.log("Updated Importance Array:", importanceArray);

    const importanceArrayFilename = "importanceArray.json";

    try {
        const storageUri = context.storageUri || context.globalStorageUri;
        if (storageUri) {
            const importanceFilePath = vscode.Uri.joinPath(storageUri, importanceArrayFilename).fsPath;
            writeFileSync(importanceFilePath, JSON.stringify(importanceArray, null, 2));
            console.log(`Importance Array has been written to ${importanceFilePath}`);
        } else {
            vscode.window.showErrorMessage('Unable to access storage location.');
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Error saving importance array: ${error.message}`);
    }

    return enrichedHotspots;
}


// retrieve the 2D array of importance and line range
export function getImportanceArray(): [number, string][] {
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

function calculateImportance(symbols: Array<{ symbolType: number, symbolName: string }>, timeSpent: number): number {
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
            await traverseHotspots(value, fullPath, enrichedHotspots, symbolTypeCounts);
        } else if (Array.isArray(value) && value.length > 0 && value[0] instanceof RangeData) {
            try {
                const resolvedFilePath = vscode.Uri.file(fullPath);
                if (!existsSync(resolvedFilePath.fsPath)) {
                    continue;
                }

                const document = await vscode.workspace.openTextDocument(resolvedFilePath);

                // Get symbols 
                const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                    'vscode.executeDocumentSymbolProvider', document.uri
                );

                if (symbols) {
                    for (const rangeData of value) {
                        const matchingSymbols = findAllMatchingSymbols(symbols, rangeData);

                        if (matchingSymbols.length > 0) {
                            const symbolDetails = matchingSymbols.map((matchingSymbol) => ({
                                symbolType: matchingSymbol.kind,
                                symbolName: matchingSymbol.name,
                            }));

                            const importance = calculateImportance(symbolDetails, rangeData.totalDuration);

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
                vscode.window.showErrorMessage(`Error opening file ${fullPath}: ${error.message}`);
            }
        }
    }
}

function findAllMatchingSymbols(symbols: vscode.DocumentSymbol[], rangeData: RangeData): vscode.DocumentSymbol[] {
    const matchingSymbols: vscode.DocumentSymbol[] = [];

    function findSymbols(symbols: vscode.DocumentSymbol[]) {
        for (const symbol of symbols) {
            // Symbols must fall within the range of the hotspot
            if (
                symbol.range.start.line <= rangeData.endLine && 
                symbol.range.end.line >= rangeData.startLine  
            ) {
                matchingSymbols.push(symbol);
            }

            if (symbol.children) {
                findSymbols(symbol.children);
            }
        }
    }

    findSymbols(symbols); 
    return matchingSymbols;
}

