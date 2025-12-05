# How to Install AI Collaboration Extension

There are two ways to install the AI Collaboration extension for VS Code: using the automated installer or manually via the command line.

## Option 1: Automated Installer (Recommended)

We have provided a self-contained installer app that handles everything for you.

1.  Navigate to the `installer` directory.
2.  Double-click **`AI Collab Installer.app`**.
3.  A Terminal window will open to guide you through the process:
    *   It verifies your VS Code installation.
    *   It installs the extension (`.vsix` file).
    *   It helps you configure your API keys (Anthropic & HuggingFace).

## Option 2: Manual Installation

If you prefer to install manually or are on a system where the app doesn't run:

1.  Open your terminal.
2.  Run the following command to install the `.vsix` package directly into VS Code:

    ```bash
    code --install-extension "installer/AI Collab Installer.app/Contents/Resources/ai-collab-vscode-0.1.0.vsix"
    ```

    *Note: If `code` is not in your PATH, you may need to use the full path to the binary, e.g., `/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code`.*

## Configuration

After installation, you can configure the extension settings:

1.  Open VS Code.
2.  Press `Cmd+,` to open Settings.
3.  Search for `AI Collab`.
4.  Enter your API keys:
    *   **Anthropic API Key**: For the Planner (Opus) and Coder (Codex/Claude).
    *   **HuggingFace Token**: For the Reviewer Swarm agents.

## Verification

To verify the installation:

1.  Open the Command Palette (`Cmd+Shift+P`).
2.  Type `AI Collab`.
3.  You should see commands like:
    *   `AI Collab: Plan Task with Opus`
    *   `AI Collab: Execute Full Pipeline`
    *   `AI Collab: Review Code with Swarm`
