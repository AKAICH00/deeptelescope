import { Orchestrator } from './orchestrator';
import * as path from 'path';

async function main() {
    const workspaceDir = path.resolve(__dirname, '../../'); // Root of deep-telescope
    const orchestrator = new Orchestrator(workspaceDir);

    let userRequest = "Create a simple snake game with HTML, CSS, and JS.";
    try {
        const fs = require('fs');
        const promptPath = path.join(workspaceDir, 'game_prompt.md');
        if (fs.existsSync(promptPath)) {
            userRequest = fs.readFileSync(promptPath, 'utf-8');
            console.log(`[Main] Loaded prompt from ${promptPath}`);
        }
    } catch (e) {
        console.warn("[Main] Could not read game_prompt.md, using default.");
    }

    console.log("=== AI Collaboration Plugin Prototype ===");
    console.log(`Workspace: ${workspaceDir}`);

    await orchestrator.initialize(userRequest);
    await orchestrator.generatePlan();
    await orchestrator.executePlan();
}

main().catch(err => console.error(err));
