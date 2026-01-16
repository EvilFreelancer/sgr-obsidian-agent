import React, { useState, useRef, useEffect } from "react";
import { FileContext, Model } from "../types";
import { Button } from "./ui/Button";
import { Select } from "./ui/Select";
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

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInput(value);

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
    }
  };

  const modeOptions = [
    { value: CHAT_MODES.AGENT, label: "Agent" },
    { value: CHAT_MODES.ASK, label: "Ask" },
    { value: CHAT_MODES.PLAN, label: "Plan" },
  ];

  const modelOptions = models.map((model) => ({
    value: model.id,
    label: model.name || model.id,
  }));

  return (
    <div className="sgr-chat-input-container">
      <div className="sgr-chat-input-selectors">
        <Select
          options={modeOptions}
          value={mode}
          onChange={(e) => onModeChange(e.target.value as ChatMode)}
          className="sgr-mode-select"
        />
        <Select
          options={modelOptions.length > 0 ? modelOptions : [{ value: selectedModel || "", label: selectedModel || "No models" }]}
          value={selectedModel}
          onChange={(e) => onModelChange(e.target.value)}
          disabled={modelsLoading || modelOptions.length === 0}
          className="sgr-model-select"
        />
      </div>
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
      <div className="sgr-chat-input-wrapper">
        <textarea
          ref={inputRef}
          className="sgr-chat-input"
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
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
