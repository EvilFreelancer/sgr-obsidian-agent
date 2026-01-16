# SGR Obsidian Agent Plugin Specification

## Overview

The **SGR Obsidian Agent** plugin is an AI assistant for Obsidian that works with LLM through an OpenAI-compatible API in agent format. The plugin provides a sidebar chat interface similar to implementations in VS Code and Cursor.

## Core Requirements

### 1. Plugin Architecture

#### 1.1 Project Structure
```
sgr-obsidian-agent/
├── manifest.json          # Plugin metadata
├── package.json          # Dependencies and scripts
├── tsconfig.json         # TypeScript configuration
├── esbuild.config.mjs    # Build configuration
├── src/
│   ├── main.ts           # Plugin entry point
│   ├── constants.ts      # Constants and types
│   ├── components/       # React components
│   │   ├── AgentView.tsx # Main sidebar view
│   │   ├── Chat.tsx      # Chat component
│   │   ├── ChatInput.tsx # Message input field
│   │   ├── ChatMessages.tsx # Message display
│   │   ├── ChatControls.tsx # Chat controls
│   │   ├── ModelSelector.tsx # Model selector
│   │   ├── ChatHistory.tsx # Chat history
│   │   └── ui/           # UI components (buttons, selectors, etc.)
│   ├── settings/         # Plugin settings
│   │   ├── model.ts      # Settings model
│   │   └── SettingsTab.tsx # Settings tab
│   ├── core/             # Core logic
│   │   ├── ChatManager.ts # Chat management
│   │   ├── MessageRepository.ts # Message repository
│   │   └── LLMClient.ts   # LLM API client
│   ├── utils/            # Utilities
│   └── types/            # TypeScript types
└── styles.css            # Plugin styles
```

#### 1.2 Technology Stack
- **TypeScript** - main development language
- **React** - for UI components
- **Obsidian API** - for Obsidian integration
- **esbuild** - for building
- **Tailwind CSS** (optional) - for styling

### 2. Functional Requirements

#### 2.1 Chat Sidebar

**Requirements:**
- Sidebar opens on the right when clicking the chat icon button
- Icon should be available in Obsidian interface (ribbon icon)
- Panel must be registered as a custom view via `registerView()`
- View type: `"sgr-agent-chat-view"`

**Implementation:**
```typescript
// In main.ts
this.registerView(VIEW_TYPE, (leaf: WorkspaceLeaf) => new AgentView(leaf, this));
this.addRibbonIcon("message-square", "Open SGR Agent", () => this.activateView());
```

#### 2.2 Plugin Settings

**Required Settings:**
- `baseUrl` (string) - base URL for OpenAI-compatible API
- `apiKey` (string) - API key for authentication
- `proxy` (string, optional) - proxy server URL

**Additional Settings:**
- `defaultModel` (string) - default model
- `temperature` (number) - model temperature (0-2)
- `maxTokens` (number) - maximum number of tokens
- `chatHistoryFolder` (string) - folder for saving chat history

**Settings Interface:**
```typescript
interface AgentSettings {
  baseUrl: string;
  apiKey: string;
  proxy?: string;
  defaultModel: string;
  temperature: number;
  maxTokens: number;
  chatHistoryFolder: string;
}
```

**Settings UI:**
- Settings tab should be accessible via `addSettingTab()`
- Input fields: baseUrl, apiKey, proxy
- Validation of required fields
- API key encryption (optional)

#### 2.3 File Attachment via @

**Requirements:**
- When typing `@` in the input field, autocomplete should appear
- Autocomplete should show files from vault
- When selecting a file, it should be added to chat context
- Files should be displayed as "pills" in the input field
- Supported formats: `.md`, `.txt` (can be extended)

**Implementation:**
- Use Lexical editor (as in obsidian-copilot) or simple textarea with autocomplete
- Parse mentions using regular expressions: `@\[\[filename\]\]` or `@filename`
- Store list of attached files in component state
- Pass files to context when sending message

**Usage Example:**
```
User types: "Analyze @[[my-note.md]] and @[[another-file.md]]"
Result: two files are added to message context
```

#### 2.4 Chat Modes

**Three Modes:**
1. **Agent** - agent mode with autonomous task execution
2. **Ask** - simple Q&A mode
3. **Plan** - planning mode with step-by-step execution

**Implementation:**
- Mode switcher in UI (buttons or dropdown)
- Different system prompts for each mode
- Different response handling depending on mode

**System Prompts:**

**Agent:**
```
You are an autonomous AI agent. You can use tools to accomplish tasks.
Think step by step and decide which actions to take.
```

**Ask:**
```
You are a helpful assistant. Answer questions directly and concisely.
```

**Plan:**
```
You are a planning assistant. Break down tasks into steps and execute them systematically.
```

#### 2.5 Model Selector

**Requirements:**
- Load model list via request to `/models` endpoint
- Display model list in dropdown/select
- Cache model list
- Update list via button or automatically when baseUrl changes

**Implementation:**
```typescript
async function fetchModels(baseUrl: string, apiKey: string): Promise<Model[]> {
  const response = await fetch(`${baseUrl}/models`, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  });
  const data = await response.json();
  return data.data || [];
}
```

**UI:**
- Dropdown with model search
- Display model name and provider (if available)
- Loading indicator when fetching list

#### 2.6 Chat History

**Requirements:**
- Save chat history to markdown files
- Button to open chat history
- List of previous sessions with date and time
- Ability to load previous session
- Ability to delete session
- Auto-save current chat (optional)

**Save Format:**
- Markdown files in `chatHistoryFolder`
- Frontmatter with metadata:
  ```yaml
  ---
  title: "Chat Title"
  createdAt: "2024-01-01T12:00:00Z"
  lastAccessedAt: "2024-01-01T12:00:00Z"
  model: "gpt-4"
  mode: "agent"
  ---
  ```
- File body contains message history in format:
  ```markdown
  ## User
  Message text

  ## Assistant
  Response text
  ```

**History UI:**
- Popover or modal window with chat list
- Sort by date (newest first)
- Search by chat title
- Buttons: "Load", "Delete", "Open File"

### 3. Technical Details

#### 3.1 LLM API Integration

**OpenAI-compatible Format:**
```typescript
interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}
```

**Response Streaming:**
- Support for Server-Sent Events (SSE) for streaming
- Real-time UI updates as tokens are received

**Error Handling:**
- API key validation
- Network error handling
- API error handling (rate limits, invalid model, etc.)
- User-friendly error messages

#### 3.2 State Management

**Using React Hooks:**
- `useState` for local component state
- `useEffect` for side effects
- `useContext` for global state (optional)

**Settings Storage:**
- Use `loadData()` and `saveData()` from Obsidian API
- Atomic settings updates via `setSettings()`

#### 3.3 File Context

**Handling Attached Files:**
```typescript
interface FileContext {
  path: string;
  content: string;
  metadata?: {
    title?: string;
    tags?: string[];
  };
}
```

**Adding Context to Prompt:**
- Files are added to system message or as separate messages
- Format: `[File: filename.md]\n{content}\n[/File]`

### 4. UI/UX Requirements

#### 4.1 Interface Design
- Minimalist design in Obsidian style
- Adaptability to dark/light theme
- Smooth animations and transitions
- Loading indicators for long operations

#### 4.2 Interface Components

**Sidebar:**
- Header with plugin name
- Mode buttons (Agent, Ask, Plan)
- Model selector
- Chat history button
- Message area (scrollable)
- Input field with @ mention support
- Send button

**Messages:**
- Separation of user and assistant messages
- Markdown rendering for responses
- Code highlighting (if available)
- Copy messages
- Edit own messages

### 5. Comparison with obsidian-copilot

**Similarities:**
- Use of React for UI
- Sidebar as custom view
- Settings system with API keys
- File mention support
- Chat history in markdown files
- Model selector

**Differences:**
- Simplified architecture (without complex chain runners)
- Focus on OpenAI-compatible API
- Three clear modes instead of multiple chain types
- Simpler context system (only files via @)
- No support for projects and complex tools

### 6. Development Stages

#### Stage 1: Basic Structure
- [ ] Create project structure
- [ ] Setup build (esbuild, TypeScript)
- [ ] Basic main.ts with plugin registration
- [ ] Simple sidebar (without functionality)

#### Stage 2: Settings
- [ ] Settings model
- [ ] Settings tab UI
- [ ] Settings save/load
- [ ] Settings validation

#### Stage 3: Basic Chat
- [ ] Chat component
- [ ] Input field and message sending
- [ ] LLM API integration
- [ ] Message display
- [ ] Error handling

#### Stage 4: Extended Functionality
- [ ] File attachment via @
- [ ] Chat modes
- [ ] Model selector
- [ ] Chat history

#### Stage 5: Polish
- [ ] UI/UX improvements
- [ ] Performance optimization
- [ ] Testing
- [ ] Documentation

### 7. Dependencies

**Main Dependencies:**
```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@types/node": "^16.11.6",
    "@types/react": "^18.0.33",
    "@types/react-dom": "^18.0.11",
    "esbuild": "^0.25.0",
    "obsidian": "^1.2.5",
    "typescript": "^5.7.2"
  }
}
```

### 8. Usage Examples

**Basic Usage:**
1. User opens sidebar
2. Selects "Ask" mode
3. Selects model from list
4. Enters question and sends
5. Receives response from LLM

**With File Context:**
1. User types `@[[my-note]]` in input field
2. Selects file from autocomplete
3. File is added to context
4. Sends message with question about file
5. LLM receives file context and responds

**Loading History:**
1. User clicks history button
2. Sees list of previous chats
3. Selects desired chat
4. History loads into current session
5. Can continue conversation

### 9. Future Improvements

**Possible Extensions:**
- Image support in messages
- Voice input
- Export chats to various formats
- Integration with other Obsidian tools
- Custom prompt support
- Theme customization

---

## Notes

- Specification is based on studying `obsidian-copilot` code
- Architecture is simplified for faster development
- Focus on basic functionality with possibility for extension
- All code comments must be in English
- User responses in Russian (unless otherwise specified)
