import * as vscode from "vscode";
import { EnrichedHotspot } from "./HotspotsGrouper"; // Ensure EnrichedHotspot is exported
import { existsSync, writeFileSync } from "fs";
import * as path from "path";
import { RangeNode } from "./HotspotsProvider";

const llmHotspotsFilename = "llmHotspots.json";
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

export class HotspotLLMAnalyzer {
  // Query the LLM with the given prompt and return a summary and relevance
  private static async queryLLM(prompt: string): Promise<{ summary: string, relevance: string }> {
    console.log("LLM Query Prompt: ", prompt);  // Log the query prompt
    
    const response = await fetch("http://llm.hasel.dev:20769/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer sk-WhRaeJSugqrKrdTmY5STAw"
      },
      body: JSON.stringify({
        model: "openai-gpt-4o",
        messages: [{ role: "user", content: prompt }]
      })
    });

    const result = await response.json() as LLMResponse;

    if (result.choices && result.choices.length > 0) {
      const jsonResponse = JSON.parse(result.choices[0].message.content);
      console.log("LLM Response: ", jsonResponse);  // Log the LLM response
      return { summary: jsonResponse.summary, relevance: jsonResponse.relevance };
    }

    return { summary: "", relevance: "" };
  }

  // Extract the surrounding code section (e.g., method) from a document
  private static async extractSurroundingSection(document: vscode.TextDocument, startLine: number, endLine: number): Promise<{ start: number, end: number }> {
    let sectionStart = startLine;
    let sectionEnd = endLine;

    while (sectionStart > 0) {
      const lineText = document.lineAt(sectionStart).text.trim();
      if (lineText.endsWith("{")) {
        break;
      }
      sectionStart--;
    }

    while (sectionEnd < document.lineCount - 1) {
      const lineText = document.lineAt(sectionEnd).text.trim();
      if (lineText === "}") {
        break;
      }
      sectionEnd++;
    }

    return { start: sectionStart, end: sectionEnd };
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
    const prompt = `Analyze the following code section and generate a JSON response with two key-value pairs: 
    "summary" (a concise summary of what the code does) and "relevance" (with values: high, medium, or low based on the code's importance).
    Return the result as a valid JSON object.
  
    Code section:
    \n\n${surroundingSection}`;
    
    const llmResult = await this.queryLLM(prompt);

    llmHotspotData.push({
      filePath,
      startLine,
      endLine,
      surroundingStartLine,
      surroundingEndLine,
      summary: llmResult.summary,
      relevance: llmResult.relevance
    });

    // Add a 2-second delay before querying the next hotspot
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Save the LLM result for this hotspot
    await this.saveLLMHotspotData(context);

    console.log(`Finished analysis for hotspot: ${filePath} (${startLine}-${endLine})`);  // Log the end of analysis
  }

  // Save the LLM Hotspot data to JSON
  private static async saveLLMHotspotData(context: vscode.ExtensionContext) {
    try {
      const storageUri = context.storageUri || context.globalStorageUri;
      if (storageUri) {
        const llmHotspotFilePath = path.join(storageUri.fsPath, llmHotspotsFilename);
        writeFileSync(llmHotspotFilePath, JSON.stringify(llmHotspotData, null, 2));
        vscode.window.showInformationMessage("LLM Hotspots Data has been saved.");
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Error saving LLM Hotspots data: ${(error as Error).message}`);
    }
  }

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

  public static registerAnalyzeHotspotCommand(context: vscode.ExtensionContext, hotspotsProvider: any) {
    const disposable = vscode.commands.registerCommand('extension.analyzeHotspotWithLLM', async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const document = editor.document;

        const hotspots = await hotspotsProvider.getTrackedNodes();

        const rangeNodes = hotspots.filter((node: any) => node instanceof RangeNode) as RangeNode[];

        if (rangeNodes.length > 0) {
          const rangeNode = rangeNodes[0];  // Take only the first hotspot

          const enrichedHotspot: EnrichedHotspot = {
            filePath: rangeNode.filePath,
            rangeData: {
              startLine: rangeNode.startLine,
              endLine: rangeNode.endLine,
              totalDuration: rangeNode.importance,
            },
            symbols: [],
            timeSpent: rangeNode.importance,
            importance: rangeNode.importance,
          };

          await HotspotLLMAnalyzer.analyzeHotspotWithLLM(enrichedHotspot, document, context);

          vscode.window.showInformationMessage(`First hotspot has been analyzed with the LLM: ${rangeNode.filePath}:${rangeNode.startLine}-${rangeNode.endLine}`);
        } else {
          vscode.window.showInformationMessage("No hotspots found for analysis.");
        }
      } else {
        vscode.window.showErrorMessage("No active editor found. Please open a file to analyze.");
      }
    });

    context.subscriptions.push(disposable);
  }
}
