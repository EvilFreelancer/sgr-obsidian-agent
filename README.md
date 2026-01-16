# SGR Obsidian Agent

An AI assistant plugin for Obsidian that works with LLM through OpenAI-compatible API in agent format. This plugin provides a sidebar chat interface similar to implementations in VS Code and Cursor.

## Features

- **Sidebar Chat Interface**: Clean, modern chat interface in a sidebar panel
- **Three Chat Modes**:
  - **Agent**: Autonomous agent mode with tool usage capabilities
  - **Ask**: Simple Q&A assistant mode
  - **Plan**: Planning assistant with step-by-step execution
- **File Context Support**: Attach files to chat using `@` mentions
- **Model Selection**: Dynamic model selection from your API endpoint
- **Chat History**: Save and load previous chat sessions
- **OpenAI-Compatible API**: Works with any OpenAI-compatible API endpoint
- **Streaming Responses**: Real-time streaming of AI responses

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
4. Copy the following files to your Obsidian vault's `.obsidian/plugins/sgr-obsidian-agent/` folder:
   - `main.js`
   - `manifest.json`
   - `styles.css`
5. Enable the plugin in Obsidian Settings → Community Plugins

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
4. For production build:
   ```bash
   npm run build
   ```

## Configuration

### Initial Setup

1. Open Obsidian Settings
2. Go to **Community Plugins** → **SGR Obsidian Agent**
3. Configure the following settings:

   - **Base URL**: Your OpenAI-compatible API endpoint (e.g., `https://api.openai.com/v1`)
   - **API Key**: Your API key for authentication
   - **Proxy URL** (optional): Proxy server URL if needed
   - **Default Model**: Default model to use (e.g., `gpt-4`, `gpt-3.5-turbo`)
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

- **Save Chat**: Click the "Save" button, enter a title, and the chat will be saved to the Chat History folder
- **Load Chat**: Click the "History" button to view and load previous chats
- **Delete Chat**: Use the "Delete" button in the chat history modal

### Model Selection

- The model selector automatically fetches available models from your API endpoint
- Click "Refresh" to reload the model list
- Select a model from the dropdown to use it for the current session

## Architecture

The plugin follows a modular architecture:

```
src/
├── main.ts              # Plugin entry point
├── constants.ts         # Constants and types
├── components/          # React components
│   ├── AgentView.tsx   # Main sidebar view
│   ├── Chat.tsx         # Chat container
│   ├── ChatInput.tsx    # Input with @ mentions
│   ├── ChatMessages.tsx # Message display
│   ├── ChatControls.tsx # Mode and action buttons
│   ├── ModelSelector.tsx # Model selection
│   ├── ChatHistory.tsx  # Chat history management
│   └── ui/              # Reusable UI components
├── settings/            # Settings management
│   ├── model.ts         # Settings interface
│   └── SettingsTab.tsx  # Settings UI
├── core/                # Core logic
│   ├── LLMClient.ts     # LLM API client
│   ├── ChatManager.ts   # Chat session management
│   └── MessageRepository.ts # Message persistence
├── types/               # TypeScript types
└── utils/               # Utility functions
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
- **React**: UI components
- **esbuild**: Build tool
- **Obsidian API**: Integration with Obsidian

### Building

```bash
# Development build with watch mode
npm run dev

# Production build
npm run build
```

### Code Style

- All code comments in English
- TypeScript with strict type checking
- React functional components with hooks
- Modular architecture with clear separation of concerns

## Troubleshooting

### Plugin Not Loading

- Check that `main.js`, `manifest.json`, and `styles.css` are in the correct folder
- Check Obsidian console for errors (Help → Toggle Developer Tools)
- Ensure all dependencies are installed

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

## License

MIT

## Contributing

Contributions are welcome! Please follow the code style guidelines and ensure all code comments are in English.

## Acknowledgments

This plugin is inspired by the architecture and patterns from `obsidian-copilot`, adapted for a simpler, focused implementation.
