import * as vscode from "vscode";
import { EnrichedHotspot } from "./HotspotsGrouper"; // Ensure EnrichedHotspot is exported
import { existsSync, writeFileSync, mkdirSync } from "fs";
import * as path from "path";
import axios from 'axios';


let llmHotspotData: Array<{
  filePath: string;
  startLine: number;
  endLine: number;
  surroundingStartLine: number;
  surroundingEndLine: number;
  summary: string;
  relevance: string;
}> = []; // Global array to store LLM results for each hotspot

interface LLMResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

const hotspotQueue: EnrichedHotspot[] = [];  // Queue for hotspots
let isProcessingQueue = false;  // To track if we're currently processing the queue

export class HotspotLLMAnalyzer {
  private static readonly llmHotspotsFilename = "llmHotspots.json";  // Ensure it's a static property

  private static async queryLLM(prompt: string): Promise<{ summary: string, relevance: string }> {
    console.log("LLM Query Prompt: ", prompt);  // Log the query prompt
  
    try {
      const response = await axios.post("http://llm.hasel.dev:20769/v1/chat/completions", {
        model: "openai-gpt-4o",
        messages: [{ role: "user", content: prompt }]
      }, {
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer sk-WhRaeJSugqrKrdTmY5STAw"  // Replace with your API key
        }
      });
  
      const result = response.data as LLMResponse;
  
      if (result.choices && result.choices.length > 0) {
        const jsonResponse = JSON.parse(result.choices[0].message.content);
        console.log("LLM Response: ", jsonResponse);  // Log the LLM response
        return { summary: jsonResponse.summary, relevance: jsonResponse.relevance };
      }
  
      return { summary: "", relevance: "" };
    } catch (error) {
      console.error('Error during LLM query:', error);
      return { summary: "", relevance: "" };
    }
  }
  
  private static async extractSurroundingSection(document: vscode.TextDocument, startLine: number, endLine: number): Promise<{ start: number, end: number }> {
    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      'vscode.executeDocumentSymbolProvider', document.uri
    );
  
    if (!symbols) {
      console.warn(`No symbols found for document: ${document.uri.fsPath}`);
      return { start: startLine, end: endLine };
    }
  
    // Function to recursively find the smallest symbol containing the hotspot range
    function findEnclosingSymbol(symbols: vscode.DocumentSymbol[], range: vscode.Range): vscode.DocumentSymbol | null {
      for (const symbol of symbols) {
        if (symbol.range.contains(range)) {
          const childResult = findEnclosingSymbol(symbol.children, range);
          return childResult || symbol;
        }
      }
      return null;
    }
  
    const hotspotRange = new vscode.Range(startLine, 0, endLine, 0);
    const enclosingSymbol = findEnclosingSymbol(symbols, hotspotRange);
  
    if (enclosingSymbol) {
      console.log(`Enclosing symbol found: ${enclosingSymbol.name} (${enclosingSymbol.kind})`);
      return {
        start: enclosingSymbol.range.start.line,
        end: enclosingSymbol.range.end.line
      };
    } else {
      console.warn(`No enclosing symbol found for hotspot at lines ${startLine}-${endLine}`);
      return { start: startLine, end: endLine };
    }
  }
  
    

  // Analyze a single hotspot with the LLM
  public static async analyzeHotspotWithLLM(hotspot: EnrichedHotspot, document: vscode.TextDocument, context: vscode.ExtensionContext): Promise<void> {
    const { startLine, endLine } = hotspot.rangeData;
    const filePath = hotspot.filePath;

    console.log(`Starting analysis for hotspot: ${filePath} (${startLine}-${endLine})`);  // Log the start of analysis

    // Check if this hotspot (based on filePath and startLine) is already analyzed
    const existingHotspot = llmHotspotData.find(
      (data) => data.filePath === filePath && data.startLine === startLine && data.endLine === endLine
    );

    if (existingHotspot) {
      vscode.window.showInformationMessage(`Hotspot at ${filePath}:${startLine}-${endLine} is already analyzed. Skipping...`);
      return; // Skip if already analyzed
    }

    // Extract surrounding section for the hotspot
    const { start: surroundingStartLine, end: surroundingEndLine } = await this.extractSurroundingSection(document, startLine, endLine);

    const surroundingSection = document.getText(
      new vscode.Range(
        new vscode.Position(surroundingStartLine, 0),
        new vscode.Position(surroundingEndLine, document.lineAt(surroundingEndLine).text.length)
      )
    );

    // LLM prompt
    const prompt = `Analyze the following code section and generate a concise summary and its relevance (high, medium, low). Expected format: { "summary": "...", "relevance": "..." }\n\n${surroundingSection}`;

    try {
  
      const llmResult = await this.queryLLM(prompt);
  
      if (llmResult.summary && llmResult.relevance) {
        llmHotspotData.push({
          filePath,
          startLine,
          endLine,
          surroundingStartLine,
          surroundingEndLine,
          summary: llmResult.summary,
          relevance: llmResult.relevance
        });
  
        await this.saveLLMHotspotData(context);
      } else {
        console.warn(`Received invalid LLM result for hotspot at ${filePath}:${startLine}-${endLine}`);
      }
    } catch (error) {
      console.error(`Error analyzing hotspot at ${filePath}:${startLine}-${endLine}:`, error);
    }

    console.log(`Finished analysis for hotspot: ${filePath} (${startLine}-${endLine})`);  // Log the end of analysis
  }

  // Save the LLM Hotspot data to JSON
  private static async saveLLMHotspotData(context: vscode.ExtensionContext) {
    try {
      // Ensure storageUri is defined
      const storageUri = context.storageUri || context.globalStorageUri;
      if (storageUri) {
        const storagePath = storageUri.fsPath;
        
        // Ensure the directory exists
        if (!existsSync(storagePath)) {
          mkdirSync(storagePath, { recursive: true });  // <-- mkdirSync now available
        }

        // Path to the llmHotspots.json file
        const llmHotspotFilePath = path.join(storagePath, HotspotLLMAnalyzer.llmHotspotsFilename);  // Use the correct reference

        // Write data to llmHotspots.json
        writeFileSync(llmHotspotFilePath, JSON.stringify(llmHotspotData, null, 2));
        //vscode.window.showInformationMessage(`LLM Hotspots Data saved at ${llmHotspotFilePath}.`);
      } else {
        vscode.window.showErrorMessage("Error: Unable to find storage location for llmHotspots.json.");
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Error saving LLM Hotspots data: ${(error as Error).message}`);
    }
  }

  // Get LLM Hotspot data
  public static getLLMHotspotData(): Array<{
    filePath: string;
    startLine: number;
    endLine: number;
    surroundingStartLine: number;
    surroundingEndLine: number;
    summary: string;
    relevance: string;
  }> {
    return llmHotspotData;
  }

  // Add a new hotspot to the queue
  public static async addToQueue(hotspot: EnrichedHotspot, document: vscode.TextDocument, context: vscode.ExtensionContext) {
    hotspotQueue.push(hotspot);
    await HotspotLLMAnalyzer.processQueue(document, context);
  }

  // Process the queue of hotspots
  private static async processQueue(document: vscode.TextDocument, context: vscode.ExtensionContext) {
    if (isProcessingQueue) return;  // If already processing, exit early
    isProcessingQueue = true;

    while (hotspotQueue.length > 0) {
      const hotspot = hotspotQueue.shift();
      if (hotspot) {
        try {
          await HotspotLLMAnalyzer.analyzeHotspotWithLLM(hotspot, document, context);
          await new Promise(resolve => setTimeout(resolve, 3000));
        } catch (error) {
          console.error(`Error processing hotspot: ${error}`);
        }
      }
    }

    isProcessingQueue = false;
  }
}
