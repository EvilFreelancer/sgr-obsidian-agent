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
  initialValue?: string;
  onInitialValueSet?: () => void;
  onCancelEdit?: () => void;
  tavilyApiKey?: string;
  enableWebSearch?: boolean;
  onWebSearchToggle?: (enabled: boolean) => void;
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
  initialValue,
  onInitialValueSet,
  onCancelEdit,
  tavilyApiKey,
  enableWebSearch = false,
  onWebSearchToggle,
}) => {
  const [fileContexts, setFileContexts] = useState<FileContext[]>([]);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteFiles, setAutocompleteFiles] = useState<TFile[]>([]);
  const [autocompleteIndex, setAutocompleteIndex] = useState(-1);
  const [models, setModels] = useState<Model[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [hasContent, setHasContent] = useState(false);
  const inputRef = useRef<HTMLDivElement>(null);
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

  // Parse @[[filename]] and create file labels
  const parseFileMentions = async (text: string): Promise<void> => {
    if (!inputRef.current) return;

    // Clear existing content
    inputRef.current.textContent = "";
    const newFileContexts: FileContext[] = [];

    // Parse @[[filename]] mentions
    const mentionRegex = /@\[\[([^\]]+)\]\]/g;
    let lastIndex = 0;
    let match;
    const fragment = document.createDocumentFragment();

    while ((match = mentionRegex.exec(text)) !== null) {
      // Add text before mention
      if (match.index > lastIndex) {
        const textBefore = text.substring(lastIndex, match.index);
        if (textBefore) {
          fragment.appendChild(document.createTextNode(textBefore));
        }
      }

      // Create file label
      const filePath = match[1];
      const fileName = filePath.split("/").pop() || filePath;
      // Remove .md extension if present for comparison
      const fileNameWithoutExt = fileName.replace(/\.md$/, '');
      
      // Try to find file in vault
      try {
        const files = app.vault.getMarkdownFiles();
        // Try multiple matching strategies:
        // 1. Exact path match
        // 2. Exact basename match
        // 3. Basename without extension match
        // 4. Partial path match (filePath contains in f.path or vice versa)
        let file = files.find(f => f.path === filePath || f.basename === fileName);
        
        if (!file) {
          // Try matching by basename without extension
          file = files.find(f => {
            const fBasenameWithoutExt = f.basename.replace(/\.md$/, '');
            return fBasenameWithoutExt === fileNameWithoutExt;
          });
        }
        
        if (!file) {
          // Try partial path match - check if filePath is part of f.path or f.path is part of filePath
          file = files.find(f => {
            const fPathLower = f.path.toLowerCase();
            const filePathLower = filePath.toLowerCase();
            return fPathLower.includes(filePathLower) || filePathLower.includes(fPathLower);
          });
        }
        
        if (!file) {
          // Try matching by filename (basename) ignoring case
          file = files.find(f => f.basename.toLowerCase() === fileName.toLowerCase());
        }
        
        if (file) {
          const content = await app.vault.read(file);
          const fileContext: FileContext = {
            path: file.path,
            content,
            metadata: {
              title: file.basename,
            },
          };
          newFileContexts.push(fileContext);

          // Create label element
          const label = document.createElement("span");
          label.className = "sgr-file-label-inline";
          label.setAttribute("data-file-path", file.path);
          label.setAttribute("contenteditable", "false");
          label.innerHTML = `<span>${file.basename}</span><button type="button" class="sgr-file-label-remove" data-file-path="${file.path}">×</button>`;
          fragment.appendChild(label);

          // Add space after label
          fragment.appendChild(document.createTextNode(" "));
        } else {
          // File not found, just add text
          fragment.appendChild(document.createTextNode(match[0]));
        }
      } catch (error) {
        console.error("Failed to read file:", filePath, error);
        // File not found or error, just add text
        fragment.appendChild(document.createTextNode(match[0]));
      }

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
    }

    // If no mentions found, just add the text
    if (lastIndex === 0) {
      fragment.appendChild(document.createTextNode(text));
    }

    inputRef.current.appendChild(fragment);
    setFileContexts(newFileContexts);
    setHasContent(text.trim().length > 0);
  };

  // Handle initial value from parent (for editing messages)
  useEffect(() => {
    if (initialValue !== undefined && inputRef.current) {
      // Parse file mentions and create labels
      parseFileMentions(initialValue).then(() => {
        if (onInitialValueSet) {
          onInitialValueSet();
        }
        // Focus input when value is set
        inputRef.current?.focus();
        // Move cursor to end
        const range = document.createRange();
        const selection = window.getSelection();
        if (inputRef.current && selection) {
          range.selectNodeContents(inputRef.current);
          range.collapse(false);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialValue, onInitialValueSet, app]);

  const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
    if (!inputRef.current) return;

    // Update hasContent state
    const text = getTextContent();
    setHasContent(text.trim().length > 0);

    // Check for @ mention
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const textNode = range.startContainer;
    if (textNode.nodeType !== Node.TEXT_NODE) return;

    const textBeforeCursor = textNode.textContent?.substring(0, range.startOffset) || "";
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
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
    } else if (e.key === "Escape" && onCancelEdit) {
      // Cancel edit mode when ESC is pressed
      e.preventDefault();
      if (inputRef.current) {
        inputRef.current.textContent = "";
        setFileContexts([]);
        setHasContent(false);
      }
      onCancelEdit();
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    } else if (e.key === "Backspace" && inputRef.current) {
      // Handle backspace to remove file labels
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const node = range.startContainer;
        
        // Check if cursor is right after a file label
        if (node.nodeType === Node.TEXT_NODE && range.startOffset === 0) {
          const prevSibling = node.previousSibling;
          if (prevSibling && prevSibling.nodeType === Node.ELEMENT_NODE) {
            const element = prevSibling as HTMLElement;
            if (element.classList.contains("sgr-file-label-inline")) {
              e.preventDefault();
              const filePath = element.getAttribute("data-file-path");
              if (filePath) {
                removeFile(filePath);
                element.remove();
              }
            }
          }
        }
      }
    }
  };

  const selectFile = async (file: TFile) => {
    if (!inputRef.current) return;

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

      // Remove @ mention and insert file label
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;

      const range = selection.getRangeAt(0);
      const textNode = range.startContainer;
      if (textNode.nodeType !== Node.TEXT_NODE) return;

      const textBeforeCursor = textNode.textContent?.substring(0, range.startOffset) || "";
      const lastAtIndex = textBeforeCursor.lastIndexOf("@");

      if (lastAtIndex !== -1) {
        // Delete @ and text after it
        const deleteRange = document.createRange();
        deleteRange.setStart(textNode, lastAtIndex);
        deleteRange.setEnd(range.startContainer, range.startOffset);
        deleteRange.deleteContents();

        // Create file label element
        const label = document.createElement("span");
        label.className = "sgr-file-label-inline";
        label.setAttribute("data-file-path", file.path);
        label.setAttribute("contenteditable", "false");
        label.innerHTML = `<span>${file.basename}</span><button type="button" class="sgr-file-label-remove" data-file-path="${file.path}">×</button>`;

        // Insert label
        const insertRange = document.createRange();
        insertRange.setStart(textNode, lastAtIndex);
        insertRange.collapse(true);
        insertRange.insertNode(label);

        // Add space after label
        const space = document.createTextNode(" ");
        label.after(space);

        // Move cursor after space
        const newRange = document.createRange();
        newRange.setStartAfter(space);
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);
      }

      setShowAutocomplete(false);
    } catch (error) {
      console.error("Failed to read file:", error);
    }
  };

  const removeFile = (path: string) => {
    setFileContexts(fileContexts.filter((fc) => fc.path !== path));
    
    // Remove file label from input
    if (inputRef.current) {
      const label = inputRef.current.querySelector(`.sgr-file-label-inline[data-file-path="${path}"]`);
      if (label) {
        // Remove space after label if exists
        const nextSibling = label.nextSibling;
        if (nextSibling && nextSibling.nodeType === Node.TEXT_NODE && nextSibling.textContent === " ") {
          nextSibling.remove();
        }
        label.remove();
        // Update hasContent
        const text = getTextContent();
        setHasContent(text.trim().length > 0);
      }
    }
  };

  // Handle click on remove button in file label
  useEffect(() => {
    if (!inputRef.current) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains("sgr-file-label-remove")) {
        e.preventDefault();
        e.stopPropagation();
        const filePath = target.getAttribute("data-file-path");
        if (filePath) {
          removeFile(filePath);
        }
      }
    };

    inputRef.current.addEventListener("click", handleClick);
    return () => {
      inputRef.current?.removeEventListener("click", handleClick);
    };
  }, [fileContexts]);

  const getTextContent = (): string => {
    if (!inputRef.current) return "";
    
    // Extract text content, replacing file labels with @[[filename]]
    // Don't include text inside file labels to avoid duplication
    let text = "";
    
    // Simple approach: iterate through child nodes
    const processNode = (node: Node): void => {
      if (node.nodeType === Node.TEXT_NODE) {
        // Check if this text node is inside a file label
        let parent = node.parentElement;
        let isInsideLabel = false;
        while (parent && parent !== inputRef.current) {
          if (parent.classList.contains("sgr-file-label-inline")) {
            isInsideLabel = true;
            break;
          }
          parent = parent.parentElement;
        }
        if (!isInsideLabel) {
          text += node.textContent;
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as HTMLElement;
        if (element.classList.contains("sgr-file-label-inline")) {
          // Replace label with @[[filename]]
          const filePath = element.getAttribute("data-file-path");
          const fileName = filePath?.split("/").pop() || filePath || "";
          text += `@[[${fileName}]]`;
        } else if (!element.classList.contains("sgr-file-label-remove")) {
          // Process children of other elements
          for (let i = 0; i < element.childNodes.length; i++) {
            processNode(element.childNodes[i]);
          }
        }
      }
    };

    for (let i = 0; i < inputRef.current.childNodes.length; i++) {
      processNode(inputRef.current.childNodes[i]);
    }

    return text.trim();
  };

  const handleSend = () => {
    if (!inputRef.current) return;
    
    const text = getTextContent();
    if (text && !disabled) {
      onSend(text, fileContexts);
      // Clear input
      inputRef.current.textContent = "";
      setFileContexts([]);
      setHasContent(false);
    }
  };

  // Icons for modes
  const modeIcons = {
    [CHAT_MODES.AGENT]: "🤖",
    [CHAT_MODES.ASK]: "💬",
    [CHAT_MODES.PLAN]: "📋",
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
      <div
        ref={inputRef}
        className="sgr-chat-input sgr-chat-input-contenteditable"
        contentEditable={!disabled}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        data-placeholder={placeholder}
        suppressContentEditableWarning={true}
      />
      <div className="sgr-chat-input-bottom">
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
          {tavilyApiKey && onWebSearchToggle && (
            <button
              type="button"
              className={`sgr-web-search-toggle ${enableWebSearch ? "sgr-web-search-enabled" : "sgr-web-search-disabled"}`}
              onClick={() => onWebSearchToggle(!enableWebSearch)}
              title={enableWebSearch ? "Disable web search" : "Enable web search"}
              disabled={disabled}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" fill="none" />
                <circle cx="8" cy="8" r="2" fill="currentColor" />
                <path d="M8 2 L8 0 M8 16 L8 14 M2 8 L0 8 M16 8 L14 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M11.31 4.69 L12.73 3.27 M3.27 12.73 L4.69 11.31 M11.31 11.31 L12.73 12.73 M3.27 3.27 L4.69 4.69" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
        <Button
          onClick={isLoading ? (onStop || (() => {})) : handleSend}
          disabled={isLoading ? false : (disabled || !hasContent)}
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
