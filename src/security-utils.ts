/**
 * Security utilities for input validation and sanitization
 * Addresses: CWE-78, CWE-22, CWE-88, Prompt Injection
 */

import * as path from 'path';

/**
 * Validates that a target path is within the workspace and safe to use.
 * Prevents path traversal attacks (CWE-22)
 *
 * @param targetPath - The path to validate
 * @param workspaceDir - The workspace root directory
 * @returns Sanitized absolute path within workspace
 * @throws Error if path is outside workspace or uses absolute paths
 */
export function validatePath(targetPath: string, workspaceDir: string): string {
    // Reject empty or null paths
    if (!targetPath || !targetPath.trim()) {
        throw new Error('Path cannot be empty');
    }

    // Block absolute paths (both Unix and Windows style)
    if (path.isAbsolute(targetPath)) {
        throw new Error(`Absolute paths not allowed: ${targetPath}`);
    }

    // Block null bytes (path injection)
    if (targetPath.includes('\0')) {
        throw new Error('Null bytes not allowed in paths');
    }

    // Resolve to absolute path
    const resolvedWorkspace = path.resolve(workspaceDir);
    const resolvedTarget = path.resolve(resolvedWorkspace, targetPath);

    // Ensure resolved path is within workspace
    if (!resolvedTarget.startsWith(resolvedWorkspace + path.sep) &&
        resolvedTarget !== resolvedWorkspace) {
        throw new Error(`Path traversal detected: ${targetPath} escapes workspace`);
    }

    // Block dangerous filenames
    const basename = path.basename(resolvedTarget);
    const dangerousPatterns = [
        /^\.\./, // Starting with ..
        /^\.ssh/, // SSH keys
        /^\.env/, // Environment files
        /passwd$/, // Password files
        /shadow$/, // Shadow files
        /\.key$/, // Private keys
        /\.pem$/, // Certificates
    ];

    for (const pattern of dangerousPatterns) {
        if (pattern.test(basename)) {
            throw new Error(`Dangerous filename pattern detected: ${basename}`);
        }
    }

    return resolvedTarget;
}

/**
 * Sanitizes command-line arguments to prevent injection attacks (CWE-88)
 *
 * @param arg - The argument to sanitize
 * @returns Sanitized argument
 * @throws Error if argument contains dangerous characters
 */
export function sanitizeArg(arg: string): string {
    if (!arg) return '';

    // Block null bytes
    if (arg.includes('\0')) {
        throw new Error('Null bytes not allowed in arguments');
    }

    // Block shell metacharacters that enable command injection
    const shellMetachars = /[;&|`$(){}[\]<>\\'"!*?~]/;
    if (shellMetachars.test(arg)) {
        throw new Error(`Shell metacharacters not allowed in argument: ${arg}`);
    }

    // Whitelist safe characters: alphanumeric, dash, underscore, dot, slash, colon, equals
    // This allows: file paths, URLs, common flags like --key=value
    if (!/^[a-zA-Z0-9._\-\/:=@]+$/.test(arg)) {
        throw new Error(`Invalid characters in argument: ${arg}`);
    }

    // Length limit to prevent buffer overflows
    if (arg.length > 4096) {
        throw new Error('Argument too long (max 4096 characters)');
    }

    return arg;
}

/**
 * Validates command name to prevent arbitrary command execution
 *
 * @param command - The command to validate
 * @returns Sanitized command
 * @throws Error if command is invalid
 */
export function validateCommand(command: string): string {
    if (!command || !command.trim()) {
        throw new Error('Command cannot be empty');
    }

    // Block path traversal in command
    if (command.includes('..') || command.includes('/')) {
        throw new Error('Path separators not allowed in command name');
    }

    // Block shell metacharacters
    const shellMetachars = /[;&|`$(){}[\]<>\\'"!*?~]/;
    if (shellMetachars.test(command)) {
        throw new Error(`Shell metacharacters not allowed in command: ${command}`);
    }

    // Whitelist safe command names (alphanumeric, dash, underscore)
    if (!/^[a-zA-Z0-9._\-]+$/.test(command)) {
        throw new Error(`Invalid command name: ${command}`);
    }

    return command;
}

/**
 * Sanitizes LLM prompts to prevent prompt injection attacks
 *
 * @param text - The text to sanitize
 * @returns Sanitized text
 */
export function sanitizePrompt(text: string): string {
    if (!text) return '';

    // Remove control characters (except newlines and tabs)
    let clean = text.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');

    // Limit length to prevent DOS
    if (clean.length > 50000) {
        clean = clean.substring(0, 50000) + '\n[... truncated for length]';
    }

    // Escape potential instruction injection patterns
    const injectionPatterns = [
        { pattern: /IGNORE (ALL )?PREVIOUS (INSTRUCTIONS?|COMMANDS?)/gi, replacement: '[REDACTED INSTRUCTION]' },
        { pattern: /NEW INSTRUCTIONS?:/gi, replacement: '[REDACTED INSTRUCTION]:' },
        { pattern: /SYSTEM PROMPT:/gi, replacement: '[REDACTED PROMPT]:' },
        { pattern: /OVERRIDE (INSTRUCTIONS?|SETTINGS?)/gi, replacement: '[REDACTED OVERRIDE]' },
        { pattern: /YOU ARE NOW/gi, replacement: '[REDACTED DIRECTIVE]' },
        { pattern: /DISREGARD (ALL|PREVIOUS)/gi, replacement: '[REDACTED DIRECTIVE]' },
    ];

    for (const { pattern, replacement } of injectionPatterns) {
        clean = clean.replace(pattern, replacement);
    }

    return clean;
}

/**
 * Validates user input from CLI to prevent injection attacks
 *
 * @param input - The user input to validate
 * @throws Error if input contains dangerous patterns
 */
export function validateUserInput(input: string): void {
    if (!input) return;

    // Length limit
    if (input.length > 10000) {
        throw new Error('Input too long (max 10000 characters)');
    }

    // Block null bytes
    if (input.includes('\0')) {
        throw new Error('Null bytes not allowed in input');
    }

    // Warn on shell metacharacters (but don't block - might be legitimate)
    const shellMetachars = /[;&|`$()]/;
    if (shellMetachars.test(input)) {
        console.warn('[Security] Warning: User input contains shell metacharacters. This will be sanitized before execution.');
    }
}

/**
 * Validates workspace directory to ensure it's safe to use
 *
 * @param workspaceDir - The workspace directory to validate
 * @returns Sanitized absolute workspace path
 * @throws Error if workspace is invalid or dangerous
 */
export function validateWorkspace(workspaceDir: string): string {
    if (!workspaceDir || !workspaceDir.trim()) {
        throw new Error('Workspace directory cannot be empty');
    }

    // Resolve to absolute path
    const resolved = path.resolve(workspaceDir);

    // Block dangerous system directories
    const dangerousRoots = [
        '/etc',
        '/bin',
        '/sbin',
        '/usr/bin',
        '/usr/sbin',
        '/System',
        '/Windows',
        '/boot',
        '/',
    ];

    for (const dangerous of dangerousRoots) {
        if (resolved === dangerous || resolved.startsWith(dangerous + path.sep)) {
            throw new Error(`Workspace cannot be in system directory: ${resolved}`);
        }
    }

    return resolved;
}

/**
 * Sanitizes all arguments in an array
 *
 * @param args - Array of arguments to sanitize
 * @returns Array of sanitized arguments
 */
export function sanitizeArgs(args: string[]): string[] {
    return args.map(arg => sanitizeArg(arg));
}

/**
 * Creates a safe environment for spawning processes
 * Removes dangerous environment variables
 *
 * @returns Safe environment object
 */
export function getSafeEnvironment(): NodeJS.ProcessEnv {
    const env = { ...process.env };

    // Remove potentially dangerous environment variables
    delete env.LD_PRELOAD;
    delete env.LD_LIBRARY_PATH;
    delete env.DYLD_INSERT_LIBRARIES;
    delete env.DYLD_LIBRARY_PATH;

    return env;
}
