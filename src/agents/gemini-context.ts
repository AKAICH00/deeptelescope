import { CLIManager, ModelConfig } from '../cli-manager';
import { SharedContext } from '../types';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

export class GeminiAgent {
    private genAI: GoogleGenerativeAI;
    private model: any;

    constructor(private cliManager: CLIManager, private config: ModelConfig) {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.error("[GeminiAgent] GEMINI_API_KEY not found in environment variables.");
            throw new Error("GEMINI_API_KEY is required for GeminiAgent (Free Tier).");
        }

        this.genAI = new GoogleGenerativeAI(apiKey);
        // Debug: List available models
        // Use gemini-3-pro-preview as confirmed by ListModels
        this.model = this.genAI.getGenerativeModel({ model: 'gemini-3-pro-preview' });
    }

    /**
     * Enriches the shared context by reading all relevant files and summarizing them if needed.
     */
    public async enrichContext(context: SharedContext): Promise<void> {
        console.log("[GeminiAgent] Reading entire repository to enrich context...");

        const files = await this.listFiles(this.cliManager['workspaceDir']);

        for (const file of files) {
            if (file.endsWith('.ts') || file.endsWith('.json') || file.endsWith('.md')) {
                const content = await fs.readFile(file, 'utf-8');
                context.workspaceFiles.set(file, content);
            }
        }

        console.log(`[GeminiAgent] Enriched context with ${context.workspaceFiles.size} files.`);

        // Use Gemini to generate a summary
        try {
            const prompt = `Summarize the following project structure: ${files.join(', ')} `;
            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();
            console.log("[GeminiAgent] Project Summary (Gemini Free Tier):", text);
        } catch (e: any) {
            console.error("[GeminiAgent] Failed to generate summary with Gemini:", e);
            if (e.response) {
                console.error("[GeminiAgent] Full Error Response:", JSON.stringify(e.response, null, 2));
            }
        }
    }

    private async listFiles(dir: string): Promise<string[]> {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        const files: string[] = [];
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== 'dist' && entry.name !== 'frontend') {
                files.push(...await this.listFiles(fullPath));
            } else if (entry.isFile()) {
                files.push(fullPath);
            }
        }
        return files;
    }

    private async listModels(): Promise<void> {
        try {
            // @ts-ignore
            const model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
            // This is a hack to access the underlying API client if possible, or we just rely on the error message which lists models
            console.log("[GeminiAgent] Listing models is not directly supported by this SDK version in this way, but the error message usually helps.");
        } catch (e) {
            console.error("[GeminiAgent] Error listing models:", e);
        }
    }
}
