#!/usr/bin/env node
/**
 * AI Collab Swarm - Post-install script
 * Downloads Qdrant and sets up configuration
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawn } = require('child_process');

const QDRANT_VERSION = '1.12.1';
const INSTALL_DIR = path.join(os.homedir(), '.ai-collab');

// Colors for terminal
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    red: '\x1b[31m',
};

function log(msg, color = 'reset') {
    console.log(`${colors[color]}${msg}${colors.reset}`);
}

function getQdrantUrl() {
    const platform = os.platform();
    const arch = os.arch();

    if (platform === 'darwin') {
        const qdrantArch = arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
        return {
            url: `https://github.com/qdrant/qdrant/releases/download/v${QDRANT_VERSION}/qdrant-${qdrantArch}.tar.gz`,
            ext: 'tar.gz',
            binary: 'qdrant'
        };
    } else if (platform === 'win32') {
        return {
            url: `https://github.com/qdrant/qdrant/releases/download/v${QDRANT_VERSION}/qdrant-x86_64-pc-windows-msvc.zip`,
            ext: 'zip',
            binary: 'qdrant.exe'
        };
    } else if (platform === 'linux') {
        const qdrantArch = arch === 'arm64' ? 'aarch64-unknown-linux-gnu' : 'x86_64-unknown-linux-gnu';
        return {
            url: `https://github.com/qdrant/qdrant/releases/download/v${QDRANT_VERSION}/qdrant-${qdrantArch}.tar.gz`,
            ext: 'tar.gz',
            binary: 'qdrant'
        };
    }

    return null;
}

async function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);

        const request = (urlStr) => {
            https.get(urlStr, (response) => {
                if (response.statusCode === 302 || response.statusCode === 301) {
                    // Follow redirect
                    request(response.headers.location);
                    return;
                }

                if (response.statusCode !== 200) {
                    reject(new Error(`Failed to download: ${response.statusCode}`));
                    return;
                }

                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve();
                });
            }).on('error', (err) => {
                fs.unlink(dest, () => { });
                reject(err);
            });
        };

        request(url);
    });
}

async function extractArchive(archivePath, destDir, ext) {
    if (ext === 'tar.gz') {
        execSync(`tar -xzf "${archivePath}" -C "${destDir}"`, { stdio: 'inherit' });
    } else if (ext === 'zip') {
        if (os.platform() === 'win32') {
            execSync(`powershell -command "Expand-Archive -Path '${archivePath}' -DestinationPath '${destDir}' -Force"`, { stdio: 'inherit' });
        } else {
            execSync(`unzip -o "${archivePath}" -d "${destDir}"`, { stdio: 'inherit' });
        }
    }
}

async function setupQdrant() {
    const qdrantInfo = getQdrantUrl();
    if (!qdrantInfo) {
        log('  Unsupported platform for Qdrant binary. Use Docker instead.', 'yellow');
        return false;
    }

    const binDir = path.join(INSTALL_DIR, 'bin');
    const qdrantPath = path.join(binDir, qdrantInfo.binary);

    if (fs.existsSync(qdrantPath)) {
        log('  Qdrant already installed', 'green');
        return true;
    }

    log(`  Downloading Qdrant v${QDRANT_VERSION}...`, 'cyan');

    const tempFile = path.join(os.tmpdir(), `qdrant.${qdrantInfo.ext}`);

    try {
        await downloadFile(qdrantInfo.url, tempFile);
        log('  Extracting...', 'cyan');
        await extractArchive(tempFile, binDir, qdrantInfo.ext);
        fs.unlinkSync(tempFile);

        // Make executable on Unix
        if (os.platform() !== 'win32') {
            fs.chmodSync(qdrantPath, 0o755);
        }

        log('  Qdrant installed successfully', 'green');
        return true;
    } catch (err) {
        log(`  Failed to install Qdrant: ${err.message}`, 'yellow');
        log('  You can run Qdrant via Docker: docker run -p 6333:6333 qdrant/qdrant', 'yellow');
        return false;
    }
}

function createQdrantConfig() {
    const configDir = path.join(INSTALL_DIR, 'config');
    const configPath = path.join(configDir, 'qdrant.yaml');

    const config = `storage:
  storage_path: ${path.join(INSTALL_DIR, 'data', 'qdrant')}

service:
  http_port: 6333
  grpc_port: 6334

log_level: WARN
`;

    fs.writeFileSync(configPath, config);
    log('  Qdrant config created', 'green');
}

function copyMcpServer() {
    const srcDir = path.join(__dirname, '..', '..');
    const srcFile = path.join(srcDir, 'dist', 'mcp-server.js');
    const destFile = path.join(INSTALL_DIR, 'bin', 'mcp-server.js');

    if (fs.existsSync(srcFile)) {
        fs.copyFileSync(srcFile, destFile);
        log('  MCP server installed', 'green');
        return true;
    }

    log('  MCP server not found - run npm run build:mcp first', 'yellow');
    return false;
}

function createLauncherScripts() {
    const binDir = path.join(INSTALL_DIR, 'bin');
    const platform = os.platform();

    if (platform === 'win32') {
        // Windows batch scripts
        fs.writeFileSync(path.join(binDir, 'ai-collab.bat'), `@echo off
setlocal
set INSTALL_DIR=${INSTALL_DIR}
set QDRANT_URL=http://localhost:6333
if "%WORKSPACE_DIR%"=="" set WORKSPACE_DIR=%CD%

:: Start Qdrant if not running
tasklist /FI "IMAGENAME eq qdrant.exe" 2>NUL | find /I /N "qdrant.exe">NUL
if "%ERRORLEVEL%"=="1" (
    start /B "" "%INSTALL_DIR%\\bin\\qdrant.exe" --config-path "%INSTALL_DIR%\\config\\qdrant.yaml" > "%INSTALL_DIR%\\logs\\qdrant.log" 2>&1
    timeout /t 2 /nobreak > NUL
)

node "%INSTALL_DIR%\\bin\\mcp-server.js"
`);
    } else {
        // Unix shell script
        const script = `#!/bin/bash
INSTALL_DIR="${INSTALL_DIR}"

# Start Qdrant if not running
if ! pgrep -x "qdrant" > /dev/null; then
    "$INSTALL_DIR/bin/qdrant" --config-path "$INSTALL_DIR/config/qdrant.yaml" > "$INSTALL_DIR/logs/qdrant.log" 2>&1 &
    sleep 2
fi

export QDRANT_URL="http://localhost:6333"
export WORKSPACE_DIR="\${WORKSPACE_DIR:-$(pwd)}"
exec node "$INSTALL_DIR/bin/mcp-server.js"
`;
        const scriptPath = path.join(binDir, 'ai-collab');
        fs.writeFileSync(scriptPath, script);
        fs.chmodSync(scriptPath, 0o755);
    }

    log('  Launcher scripts created', 'green');
}

function getClaudeConfigPath() {
    const platform = os.platform();
    if (platform === 'darwin') {
        return path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
    } else if (platform === 'win32') {
        return path.join(process.env.APPDATA, 'Claude', 'claude_desktop_config.json');
    } else {
        return path.join(os.homedir(), '.config', 'claude', 'claude_desktop_config.json');
    }
}

function setupClaudeConfig() {
    const configPath = getClaudeConfigPath();
    const configDir = path.dirname(configPath);

    if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
    }

    const binDir = path.join(INSTALL_DIR, 'bin');
    const command = os.platform() === 'win32'
        ? path.join(binDir, 'ai-collab.bat')
        : path.join(binDir, 'ai-collab');

    const mcpConfig = {
        command,
        env: {
            HF_TOKEN: process.env.HF_TOKEN || '',
            WORKSPACE_DIR: os.homedir()
        }
    };

    let config = { mcpServers: {} };

    if (fs.existsSync(configPath)) {
        try {
            config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            config.mcpServers = config.mcpServers || {};
        } catch {
            // Use default
        }
    }

    config.mcpServers['ai-collab'] = mcpConfig;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    log('  Claude Desktop configured', 'green');

    if (!process.env.HF_TOKEN) {
        log('', 'reset');
        log('  ⚠️  HF_TOKEN not set. Add it to:', 'yellow');
        log(`     ${configPath}`, 'yellow');
    }
}

async function main() {
    log('');
    log('╔═══════════════════════════════════════════════════════════╗', 'cyan');
    log('║           AI Collab Swarm - Setup                         ║', 'cyan');
    log('╚═══════════════════════════════════════════════════════════╝', 'cyan');
    log('');

    // Create directories
    log('[1/5] Creating directories...', 'blue');
    const dirs = ['bin', 'config', 'data', 'logs'];
    for (const dir of dirs) {
        const dirPath = path.join(INSTALL_DIR, dir);
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    }
    log(`  Install directory: ${INSTALL_DIR}`, 'green');

    // Setup Qdrant
    log('[2/5] Setting up Qdrant...', 'blue');
    await setupQdrant();
    createQdrantConfig();

    // Copy MCP server
    log('[3/5] Installing MCP server...', 'blue');
    copyMcpServer();

    // Create launcher scripts
    log('[4/5] Creating launcher scripts...', 'blue');
    createLauncherScripts();

    // Setup Claude config
    log('[5/5] Configuring Claude Desktop...', 'blue');
    setupClaudeConfig();

    // Done
    log('');
    log('╔═══════════════════════════════════════════════════════════╗', 'green');
    log('║              Setup Complete! 🎉                           ║', 'green');
    log('╚═══════════════════════════════════════════════════════════╝', 'green');
    log('');
    log('Next steps:', 'cyan');
    log('  1. Restart Claude Desktop');
    log('  2. Ask Claude: "Review this code with the swarm"');
    log('');
}

main().catch(err => {
    log(`Error: ${err.message}`, 'red');
    process.exit(1);
});
