import React, { useState, useRef, useEffect } from "react";
import { FileContext, Model } from "../types";
import { Button } from "./ui/Button";
import { CustomSelect } from "./ui/CustomSelect";
import { ChatMode, CHAT_MODES } from "../constants";
import { LLMClient, NetworkError, LLMAPIError } from "../core/LLMClient";
import { App, TFile } from "obsidian";

interface ChatInputProps {
  onSend: (message: string, files: FileContext[]) => void;
  onStop?: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  placeholder?: string;
  app: App;
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  baseUrl: string;
  apiKey: string;
  proxy?: string;
  selectedModel: string;
  onModelChange: (model: string) => void;
  onSaveChat: () => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSend,
  onStop,
  disabled = false,
  isLoading = false,
  placeholder = "Type a message...",
  app,
  mode,
  onModeChange,
  baseUrl,
  apiKey,
  proxy,
  selectedModel,
  onModelChange,
  onSaveChat,
}) => {
  const [input, setInput] = useState("");
  const [fileContexts, setFileContexts] = useState<FileContext[]>([]);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteFiles, setAutocompleteFiles] = useState<TFile[]>([]);
  const [autocompleteIndex, setAutocompleteIndex] = useState(-1);
  const [models, setModels] = useState<Model[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const autocompleteRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch models on mount
  useEffect(() => {
    const fetchModels = async () => {
      if (!baseUrl || !apiKey) {
        return;
      }

      setModelsLoading(true);
      try {
        const client = new LLMClient(baseUrl, apiKey, proxy);
        const fetchedModels = await client.fetchModels();
        setModels(fetchedModels);
        
        if (fetchedModels.length > 0 && !selectedModel) {
          onModelChange(fetchedModels[0].id);
        }
      } catch (err) {
        console.error("Failed to fetch models:", err);
      } finally {
        setModelsLoading(false);
      }
    };

    fetchModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrl, apiKey, proxy]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        autocompleteRef.current &&
        !autocompleteRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowAutocomplete(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Initialize textarea height on mount
  useEffect(() => {
    if (inputRef.current) {
      const lineHeight = 20; // Approximate line height
      inputRef.current.style.height = `${lineHeight * 5}px`;
    }
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;

    const resizeTextarea = () => {
      textarea.style.height = "auto";
      // Calculate max height based on container or use default
      const container = containerRef.current;
      let maxHeight = 400; // Default max height
      
      if (container) {
        const containerRect = container.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        // Use 50% of viewport or container height, whichever is smaller
        maxHeight = Math.min(viewportHeight * 0.5, containerRect.height * 2);
      }
      
      const lineHeight = 20; // Approximate line height
      const minHeight = lineHeight * 5; // 5 lines minimum
      const newHeight = Math.max(minHeight, Math.min(textarea.scrollHeight, maxHeight));
      textarea.style.height = `${newHeight}px`;
    };

    resizeTextarea();
  }, [input]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInput(value);

    // Auto-resize
    const textarea = e.target;
    textarea.style.height = "auto";
    
    const container = containerRef.current;
    let maxHeight = 400; // Default max height
    
    if (container) {
      const containerRect = container.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      maxHeight = Math.min(viewportHeight * 0.5, containerRect.height * 2);
    }
    
    const lineHeight = 20; // Approximate line height
    const minHeight = lineHeight * 5; // 5 lines minimum
    const newHeight = Math.max(minHeight, Math.min(textarea.scrollHeight, maxHeight));
    textarea.style.height = `${newHeight}px`;

    // Check for @ mention
    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = value.substring(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");

    if (lastAtIndex !== -1) {
      const query = textBeforeCursor.substring(lastAtIndex + 1).trim();
      if (query.length === 0 || !query.includes(" ")) {
        searchFiles(query);
        setShowAutocomplete(true);
      } else {
        setShowAutocomplete(false);
      }
    } else {
      setShowAutocomplete(false);
    }
  };

  const searchFiles = (query: string) => {
    const files = app.vault.getMarkdownFiles();
    const filtered = files.filter((file) =>
      file.basename.toLowerCase().includes(query.toLowerCase())
    );
    setAutocompleteFiles(filtered.slice(0, 10));
    setAutocompleteIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showAutocomplete && autocompleteFiles.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setAutocompleteIndex((prev) =>
          prev < autocompleteFiles.length - 1 ? prev + 1 : prev
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setAutocompleteIndex((prev) => (prev > 0 ? prev - 1 : -1));
      } else if (e.key === "Enter" && autocompleteIndex >= 0) {
        e.preventDefault();
        selectFile(autocompleteFiles[autocompleteIndex]);
      } else if (e.key === "Escape") {
        setShowAutocomplete(false);
      }
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const selectFile = async (file: TFile) => {
    try {
      const content = await app.vault.read(file);
      const fileContext: FileContext = {
        path: file.path,
        content,
        metadata: {
          title: file.basename,
        },
      };

      if (!fileContexts.some((fc) => fc.path === file.path)) {
        setFileContexts([...fileContexts, fileContext]);
      }

      // Remove @ mention from input
      const cursorPos = inputRef.current?.selectionStart || 0;
      const textBeforeCursor = input.substring(0, cursorPos);
      const lastAtIndex = textBeforeCursor.lastIndexOf("@");
      if (lastAtIndex !== -1) {
        const newInput =
          input.substring(0, lastAtIndex) +
          `@[[${file.basename}]]` +
          input.substring(cursorPos);
        setInput(newInput);
      }

      setShowAutocomplete(false);
    } catch (error) {
      console.error("Failed to read file:", error);
    }
  };

  const removeFile = (path: string) => {
    setFileContexts(fileContexts.filter((fc) => fc.path !== path));
  };

  const handleSend = () => {
    if (input.trim() && !disabled) {
      onSend(input.trim(), fileContexts);
      setInput("");
      setFileContexts([]);
      // Reset textarea height to initial size (5 lines)
      if (inputRef.current) {
        const lineHeight = 20; // Approximate line height
        inputRef.current.style.height = `${lineHeight * 5}px`;
      }
    }
  };

  // Icons for modes
  const modeIcons = {
    [CHAT_MODES.AGENT]: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
        <path d="M7 0C3.13 0 0 3.13 0 7c0 1.74.72 3.31 1.88 4.44L0 14l2.56-1.88C3.69 13.28 5.26 14 7 14c3.87 0 7-3.13 7-7S10.87 0 7 0zm0 1.5c3.03 0 5.5 2.47 5.5 5.5S10.03 12.5 7 12.5 1.5 10.03 1.5 7 3.97 1.5 7 1.5zm-2 2.5c0-.28.22-.5.5-.5h3c.28 0 .5.22.5.5s-.22.5-.5.5h-3c-.28 0-.5-.22-.5-.5zm0 2c0-.28.22-.5.5-.5h4c.28 0 .5.22.5.5s-.22.5-.5.5h-4c-.28 0-.5-.22-.5-.5zm-1-1c0-.28.22-.5.5-.5h6c.28 0 .5.22.5.5s-.22.5-.5.5h-6c-.28 0-.5-.22-.5-.5z" />
      </svg>
    ),
    [CHAT_MODES.ASK]: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
        <path d="M7 0C3.13 0 0 3.13 0 7c0 1.74.72 3.31 1.88 4.44L0 14l2.56-1.88C3.69 13.28 5.26 14 7 14c3.87 0 7-3.13 7-7S10.87 0 7 0zm0 1.5c3.03 0 5.5 2.47 5.5 5.5S10.03 12.5 7 12.5 1.5 10.03 1.5 7 3.97 1.5 7 1.5zm-1.5 2.5c0-.28.22-.5.5-.5h2c.28 0 .5.22.5.5s-.22.5-.5.5h-2c-.28 0-.5-.22-.5-.5zm0 2c0-.28.22-.5.5-.5h3c.28 0 .5.22.5.5s-.22.5-.5.5h-3c-.28 0-.5-.22-.5-.5zm-1-1c0-.28.22-.5.5-.5h5c.28 0 .5.22.5.5s-.22.5-.5.5h-5c-.28 0-.5-.22-.5-.5z" />
      </svg>
    ),
    [CHAT_MODES.PLAN]: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
        <path d="M1 2h12v1H1V2zm0 3h12v1H1V5zm0 3h8v1H1V8zm0 3h8v1H1v-1z" />
      </svg>
    ),
  };

  const modeOptions = [
    { value: CHAT_MODES.AGENT, label: "Agent", icon: modeIcons[CHAT_MODES.AGENT] },
    { value: CHAT_MODES.ASK, label: "Ask", icon: modeIcons[CHAT_MODES.ASK] },
    { value: CHAT_MODES.PLAN, label: "Plan", icon: modeIcons[CHAT_MODES.PLAN] },
  ];

  const modelOptions = models.map((model) => ({
    value: model.id,
    label: model.name || model.id,
  }));

  return (
    <div className="sgr-chat-input-container" ref={containerRef}>
      {fileContexts.length > 0 && (
        <div className="sgr-file-pills">
          {fileContexts.map((fc) => (
            <div key={fc.path} className="sgr-file-pill">
              <span>{fc.metadata?.title || fc.path}</span>
              <button
                type="button"
                onClick={() => removeFile(fc.path)}
                className="sgr-file-pill-remove"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <textarea
        ref={inputRef}
        className="sgr-chat-input"
        value={input}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={5}
      />
      <div className="sgr-chat-input-bottom">
        <Button
          variant="ghost"
          size="sm"
          onClick={onSaveChat}
          className="sgr-chat-action-button"
        >
          Save
        </Button>
        <div className="sgr-chat-input-selectors">
          <CustomSelect
            options={modeOptions}
            value={mode}
            onChange={(value) => onModeChange(value as ChatMode)}
            className="sgr-mode-select"
          />
          <CustomSelect
            options={modelOptions.length > 0 ? modelOptions : [{ value: selectedModel || "", label: selectedModel || "No models" }]}
            value={selectedModel}
            onChange={onModelChange}
            disabled={modelsLoading || modelOptions.length === 0}
            className="sgr-model-select"
          />
          <Button
            onClick={isLoading ? (onStop || (() => {})) : handleSend}
            disabled={isLoading ? false : (disabled || !input.trim())}
            variant="primary"
            className="sgr-play-stop-button sgr-play-button-round"
          >
            {isLoading ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <rect x="4" y="2" width="2" height="12" />
                <rect x="10" y="2" width="2" height="12" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M3 2v12l10-6z" />
              </svg>
            )}
          </Button>
        </div>
      </div>
      {showAutocomplete && autocompleteFiles.length > 0 && (
        <div ref={autocompleteRef} className="sgr-autocomplete">
          {autocompleteFiles.map((file, index) => (
            <div
              key={file.path}
              className={`sgr-autocomplete-item ${
                index === autocompleteIndex ? "sgr-autocomplete-item-active" : ""
              }`}
              onClick={() => selectFile(file)}
            >
              {file.basename}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
