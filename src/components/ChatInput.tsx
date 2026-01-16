import React, { useState, useRef, useEffect } from "react";
import { FileContext } from "../types";
import { Button } from "./ui/Button";
import { App, TFile } from "obsidian";

interface ChatInputProps {
  onSend: (message: string, files: FileContext[]) => void;
  disabled?: boolean;
  placeholder?: string;
  app: App;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSend,
  disabled = false,
  placeholder = "Type a message...",
  app,
}) => {
  const [input, setInput] = useState("");
  const [fileContexts, setFileContexts] = useState<FileContext[]>([]);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteFiles, setAutocompleteFiles] = useState<TFile[]>([]);
  const [autocompleteIndex, setAutocompleteIndex] = useState(-1);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const autocompleteRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="sgr-chat-input-container">
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
          onClick={handleSend}
          disabled={disabled || !input.trim()}
          variant="primary"
        >
          Send
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
