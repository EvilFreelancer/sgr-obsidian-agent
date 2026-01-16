# SGR Obsidian Agent

An AI assistant plugin for Obsidian that works with LLM through OpenAI-compatible API in agent format. This plugin provides a sidebar chat interface similar to implementations in VS Code and Cursor.

![SGR Obsidian Agent](/assets/intro.png)

## Features

- **Sidebar Chat Interface**: Clean, modern chat interface in a sidebar panel
- **Three Chat Modes**:
  - **Agent**: Autonomous agent mode with tool usage capabilities
  - **Ask**: Simple Q&A assistant mode (default)
  - **Plan**: Planning assistant with step-by-step execution
- **File Context Support**: Attach files to chat using `@` mentions with autocomplete
- **Model Selection**: Dynamic model selection from your API endpoint
- **Chat History**:
  - Save and load previous chat sessions
  - Separate history view with search functionality
  - BM25 search algorithm for finding chats by title
  - JSON format for chat storage
- **Markdown Rendering**: Full markdown support with GitHub Flavored Markdown (GFM)
- **OpenAI-Compatible API**: Works with any OpenAI-compatible API endpoint
- **Streaming Responses**: Real-time streaming of AI responses with smooth scrolling
- **Default Mode Setting**: Configure default chat mode in settings

## Installation

### Manual Installation

1. Clone or download this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the plugin:
   ```bash
   npm run build
   ```
4. Copy all files from the `dist/sgr-obsidian-agent/` folder to your Obsidian vault's `.obsidian/plugins/sgr-obsidian-agent/` folder:
   
   **Finding your vault folder:**
   - In Obsidian, go to Settings → Files & Links → "Vault location" to see your vault path
   - The plugins folder is at: `<vault-path>/.obsidian/plugins/sgr-obsidian-agent/`
   
   **Copying files:**
   ```bash
   # On Linux/Mac:
   mkdir -p /path/to/your/vault/.obsidian/plugins/sgr-obsidian-agent
   cp -r dist/sgr-obsidian-agent/* /path/to/your/vault/.obsidian/plugins/sgr-obsidian-agent/
   
   # On Windows (PowerShell):
   New-Item -ItemType Directory -Force -Path "C:\Path\To\Your\Vault\.obsidian\plugins\sgr-obsidian-agent"
   Copy-Item -Path "dist\sgr-obsidian-agent\*" -Destination "C:\Path\To\Your\Vault\.obsidian\plugins\sgr-obsidian-agent\" -Recurse
   
   # Or manually:
   # 1. Navigate to your vault folder
   # 2. Open .obsidian/plugins/ folder (create if it doesn't exist)
   # 3. Create sgr-obsidian-agent folder
   # 4. Copy all files from dist/ folder into it
   ```
   
   **Required files in `dist/sgr-obsidian-agent/`:**
   - `main.js` - Compiled plugin code
   - `manifest.json` - Plugin metadata
   - `styles.css` - Plugin styles
   
5. Enable the plugin in Obsidian Settings → Community Plugins → Toggle "SGR Obsidian Agent" ON

### Development Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd sgr-obsidian-agent
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. For development with watch mode:
   ```bash
   npm run dev
   ```
   This will watch for changes and rebuild automatically. After each build, copy files from `dist/sgr-obsidian-agent/` to your Obsidian plugin folder.
4. For production build:
   ```bash
   npm run build
   ```
   This creates optimized files in the `dist/sgr-obsidian-agent/` folder. Copy all files from `dist/sgr-obsidian-agent/` to your Obsidian vault's `.obsidian/plugins/sgr-obsidian-agent/` folder.

## Configuration

### Initial Setup

1. Open Obsidian Settings
2. Go to **Community Plugins** → **SGR Obsidian Agent**
3. Configure the following settings:

   - **Base URL**: Your OpenAI-compatible API endpoint (e.g., `https://api.openai.com/v1`)
   - **API Key**: Your API key for authentication
   - **Proxy URL** (optional): Proxy server URL if needed
   - **Default Model**: Default model to use (e.g., `gpt-4`, `gpt-3.5-turbo`)
   - **Default Mode**: Default chat mode (Agent, Ask, or Plan)
   - **Temperature**: Model temperature (0-2, default: 0.7)
   - **Max Tokens**: Maximum tokens in response (default: 2000)
   - **Chat History Folder**: Folder where chat history will be saved (default: "Chat History")

4. Click the ribbon icon (message-square) or use the command palette to open the chat view

## Usage

### Opening the Chat

- Click the **message-square** icon in the left ribbon
- Or use Command Palette: "Open SGR Agent"

### Chat Modes

Switch between three modes using the buttons at the top:

- **Agent**: For autonomous task execution with tools
- **Ask**: For direct questions and answers
- **Plan**: For breaking down tasks into steps

### Attaching Files

1. Type `@` in the chat input
2. Start typing a filename
3. Select a file from the autocomplete dropdown
4. The file will be attached as a "pill" above the input
5. The file content will be included in the context when you send your message

### Saving and Loading Chats

- **Save Chat**: Click the "Save" button, enter a title, and the chat will be saved to the Chat History folder as JSON
- **View History**: Click the "History" button to open a dedicated history view
- **Search History**: Use the search box in the history view to find chats by title (BM25 search algorithm)
- **Load Chat**: Click on a chat in the history view to load it into the main chat
- **Delete Chat**: Use the "Delete" button in the chat history view
- **History View**: Accessible via Command Palette: "Open Chat History" or from the History button

### Model Selection

- The model selector automatically fetches available models from your API endpoint
- Click "Refresh" to reload the model list
- Select a model from the dropdown to use it for the current session
- Models are cached and persist across sessions

### Markdown Rendering

- Assistant messages support full markdown rendering
- GitHub Flavored Markdown (GFM) features: tables, strikethrough, task lists, etc.
- Code blocks with syntax highlighting
- Clickable links and file mentions

## Architecture

The plugin follows a modular architecture:

```
src/
├── main.ts              # Plugin entry point
├── constants.ts         # Constants and types
├── components/          # React components
│   ├── AgentView.tsx   # Main sidebar view
│   ├── ChatHistoryView.tsx # Dedicated history view
│   ├── Chat.tsx         # Chat container
│   ├── ChatInput.tsx    # Input with @ mentions
│   ├── ChatMessages.tsx # Message display with markdown
│   ├── ChatControls.tsx # Mode and action buttons
│   ├── ModelSelector.tsx # Model selection
│   ├── ChatHistory.tsx  # Chat history component
│   └── ui/              # Reusable UI components
│       ├── Button.tsx   # Button component
│       ├── Select.tsx    # Select dropdown
│       └── CustomSelect.tsx # Custom select component
├── settings/            # Settings management
│   ├── model.ts         # Settings interface
│   └── SettingsTab.tsx  # Settings UI
├── core/                # Core logic
│   ├── LLMClient.ts     # LLM API client
│   ├── ChatManager.ts   # Chat session management
│   └── MessageRepository.ts # Message persistence (JSON format)
├── types/               # TypeScript types
└── utils/               # Utility functions
    └── bm25Search.ts    # BM25 search algorithm
```

## API Compatibility

The plugin works with any OpenAI-compatible API that supports:

- `GET /models` - List available models
- `POST /chat/completions` - Chat completion with streaming support (SSE)

### Example API Endpoints

- OpenAI: `https://api.openai.com/v1`
- Local LLM (via proxy): Use a proxy server that forwards to your local LLM
- Other providers: Any endpoint that follows OpenAI's API format

## Development

### Project Structure

- **TypeScript**: Main language for development
- **React**: UI components with hooks
- **React Markdown**: Markdown rendering with GFM support
- **esbuild**: Build tool
- **Obsidian API**: Integration with Obsidian

### Dependencies

**Main Dependencies:**
- `react` & `react-dom`: UI framework
- `react-markdown`: Markdown rendering
- `remark-gfm`: GitHub Flavored Markdown support
- `rehype-raw`: Raw HTML support in markdown

**Development Dependencies:**
- `typescript`: Type checking
- `esbuild`: Bundling
- `obsidian`: Obsidian API types

### Building

```bash
# Development build with watch mode
npm run dev

# Production build
npm run build
```

After building, all plugin files will be in the `dist/sgr-obsidian-agent/` folder:
- `dist/sgr-obsidian-agent/main.js` - Compiled plugin code
- `dist/sgr-obsidian-agent/manifest.json` - Plugin metadata
- `dist/sgr-obsidian-agent/styles.css` - Plugin styles

Copy these files to your Obsidian vault's `.obsidian/plugins/sgr-obsidian-agent/` folder to use the plugin.

### Code Style

- All code comments in English
- TypeScript with strict type checking
- React functional components with hooks
- Modular architecture with clear separation of concerns

## Troubleshooting

### Plugin Not Loading

- Check that `main.js`, `manifest.json`, and `styles.css` are in `.obsidian/plugins/sgr-obsidian-agent/` folder
- Ensure you copied files from the `dist/sgr-obsidian-agent/` folder after building
- Check Obsidian console for errors (Help → Toggle Developer Tools)
- Ensure all dependencies are installed
- Try reloading Obsidian (Ctrl+R or Cmd+R)

### API Connection Issues

- Verify Base URL and API Key in settings
- Check network connectivity
- Verify API endpoint supports OpenAI-compatible format
- Check console for detailed error messages

### Models Not Loading

- Ensure API Key is correct
- Verify Base URL is accessible
- Check that `/models` endpoint returns data in OpenAI format
- Try clicking "Refresh" in the model selector

### File Attachments Not Working

- Ensure files are markdown files (`.md`)
- Check that files exist in your vault
- Verify file permissions
- Try typing `@` and waiting for autocomplete to appear

### Chat History Issues

- Check that Chat History folder exists in your vault
- Verify folder path in settings matches actual folder
- History files are saved as JSON format (`.json` files)
- Use search in history view to find specific chats

## License

MIT

## Contributing

Contributions are welcome! Please follow the code style guidelines and ensure all code comments are in English.

## Technical Details

### Chat History Format

Chats are saved as JSON files with the following structure:
```json
{
  "messages": [
    {
      "role": "user" | "assistant" | "system",
      "content": "message content"
    }
  ],
  "metadata": {
    "title": "Chat title",
    "createdAt": "ISO timestamp",
    "lastAccessedAt": "ISO timestamp",
    "model": "model-name",
    "mode": "agent" | "ask" | "plan"
  }
}
```

### Search Algorithm

The chat history uses BM25 (Best Matching 25) algorithm for searching chat titles. This provides relevant search results based on term frequency and inverse document frequency.

## Acknowledgments

This plugin is inspired by the architecture and patterns from `obsidian-copilot`, adapted for a simpler, focused implementation.
