// ============================================================
// FileExecutor - Robust File Operation Executor
// Parses agent responses and executes file operations as backup
// ============================================================

import * as fs from 'fs-extra';
import * as path from 'path';

export interface FileOperation {
    type: 'create' | 'edit' | 'delete' | 'append';
    path: string;
    content?: string;
    oldContent?: string;
    newContent?: string;
}

export interface ExecutionResult {
    success: boolean;
    operations: FileOperation[];
    errors: string[];
    filesModified: string[];
}

export class FileExecutor {
    constructor(private workspaceDir: string) {}

    /**
     * Parse agent response for file operations and execute them
     */
    public async executeFromResponse(response: string, targetPath?: string): Promise<ExecutionResult> {
        const result: ExecutionResult = {
            success: true,
            operations: [],
            errors: [],
            filesModified: []
        };

        // Try multiple extraction strategies
        const operations = this.extractOperations(response, targetPath);

        for (const op of operations) {
            try {
                await this.executeOperation(op);
                result.operations.push(op);
                result.filesModified.push(op.path);
            } catch (error) {
                result.errors.push(`Failed ${op.type} on ${op.path}: ${error}`);
                result.success = false;
            }
        }

        return result;
    }

    /**
     * Extract file operations from response text
     */
    private extractOperations(response: string, targetPath?: string): FileOperation[] {
        const operations: FileOperation[] = [];

        // Strategy 1: Look for code blocks with file paths
        const codeBlockPattern = /```(?:typescript|javascript|ts|js|json)?\s*\n([\s\S]*?)```/g;
        let match;

        while ((match = codeBlockPattern.exec(response)) !== null) {
            const code = match[1].trim();
            if (code && targetPath) {
                operations.push({
                    type: 'create',
                    path: this.resolvePath(targetPath),
                    content: code
                });
            }
        }

        // Strategy 2: Look for "Create file X with content:" patterns
        const createPattern = /(?:create|write|save)\s+(?:file\s+)?[`"]?([^`"\n]+\.[a-z]+)[`"]?\s*(?:with\s+content)?:?\s*```(?:\w+)?\s*\n([\s\S]*?)```/gi;
        while ((match = createPattern.exec(response)) !== null) {
            const filePath = match[1].trim();
            const content = match[2].trim();
            operations.push({
                type: 'create',
                path: this.resolvePath(filePath),
                content
            });
        }

        // Strategy 3: Look for explicit JSON operation blocks
        const jsonOpPattern = /\{[\s\S]*?"operation"[\s\S]*?"path"[\s\S]*?\}/g;
        while ((match = jsonOpPattern.exec(response)) !== null) {
            try {
                const op = JSON.parse(match[0]);
                if (op.operation && op.path) {
                    operations.push({
                        type: op.operation,
                        path: this.resolvePath(op.path),
                        content: op.content,
                        oldContent: op.oldContent,
                        newContent: op.newContent
                    });
                }
            } catch {
                // Not valid JSON, skip
            }
        }

        // Strategy 4: Look for function definitions if target is specified
        if (targetPath && operations.length === 0) {
            const funcPattern = /(?:export\s+)?(?:async\s+)?function\s+\w+[\s\S]*?(?=\n(?:export\s+)?(?:async\s+)?function|\n*$)/g;
            const classPattern = /(?:export\s+)?class\s+\w+[\s\S]*?(?=\n(?:export\s+)?class|\n*$)/g;

            let fullContent = '';
            while ((match = funcPattern.exec(response)) !== null) {
                fullContent += match[0] + '\n\n';
            }
            while ((match = classPattern.exec(response)) !== null) {
                fullContent += match[0] + '\n\n';
            }

            if (fullContent.trim()) {
                operations.push({
                    type: 'create',
                    path: this.resolvePath(targetPath),
                    content: fullContent.trim()
                });
            }
        }

        return operations;
    }

    /**
     * Execute a single file operation
     */
    private async executeOperation(op: FileOperation): Promise<void> {
        const fullPath = op.path;

        // Ensure directory exists
        await fs.ensureDir(path.dirname(fullPath));

        switch (op.type) {
            case 'create':
                if (!op.content) throw new Error('Create operation requires content');
                await fs.writeFile(fullPath, op.content, 'utf-8');
                console.log(`[FileExecutor] Created: ${fullPath}`);
                break;

            case 'edit':
                if (!op.oldContent || !op.newContent) {
                    throw new Error('Edit operation requires oldContent and newContent');
                }
                const existing = await fs.readFile(fullPath, 'utf-8');
                const edited = existing.replace(op.oldContent, op.newContent);
                await fs.writeFile(fullPath, edited, 'utf-8');
                console.log(`[FileExecutor] Edited: ${fullPath}`);
                break;

            case 'append':
                if (!op.content) throw new Error('Append operation requires content');
                await fs.appendFile(fullPath, '\n' + op.content, 'utf-8');
                console.log(`[FileExecutor] Appended to: ${fullPath}`);
                break;

            case 'delete':
                await fs.remove(fullPath);
                console.log(`[FileExecutor] Deleted: ${fullPath}`);
                break;

            default:
                throw new Error(`Unknown operation type: ${op.type}`);
        }
    }

    /**
     * Resolve path relative to workspace
     */
    private resolvePath(filePath: string): string {
        if (path.isAbsolute(filePath)) {
            return filePath;
        }
        return path.join(this.workspaceDir, filePath);
    }

    /**
     * Verify file was created/modified
     */
    public async verifyFile(filePath: string): Promise<boolean> {
        const fullPath = this.resolvePath(filePath);
        return fs.pathExists(fullPath);
    }

    /**
     * Read file content for verification
     */
    public async readFile(filePath: string): Promise<string | null> {
        const fullPath = this.resolvePath(filePath);
        try {
            return await fs.readFile(fullPath, 'utf-8');
        } catch {
            return null;
        }
    }
}
