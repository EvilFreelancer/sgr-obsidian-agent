import React from "react";
import { ChatMode, CHAT_MODES } from "../constants";
import { Button } from "./ui/Button";

interface ChatControlsProps {
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  onNewChat: () => void;
  onSaveChat: () => void;
  onLoadHistory: () => void;
}

export const ChatControls: React.FC<ChatControlsProps> = ({
  mode,
  onModeChange,
  onNewChat,
  onSaveChat,
  onLoadHistory,
}) => {
  return (
    <div className="sgr-chat-controls">
      <div className="sgr-mode-selector">
        <Button
          variant={mode === CHAT_MODES.AGENT ? "primary" : "secondary"}
          size="sm"
          onClick={() => onModeChange(CHAT_MODES.AGENT)}
        >
          Agent
        </Button>
        <Button
          variant={mode === CHAT_MODES.ASK ? "primary" : "secondary"}
          size="sm"
          onClick={() => onModeChange(CHAT_MODES.ASK)}
        >
          Ask
        </Button>
        <Button
          variant={mode === CHAT_MODES.PLAN ? "primary" : "secondary"}
          size="sm"
          onClick={() => onModeChange(CHAT_MODES.PLAN)}
        >
          Plan
        </Button>
      </div>
      <div className="sgr-chat-actions">
        <Button variant="ghost" size="sm" onClick={onNewChat}>
          New Chat
        </Button>
        <Button variant="ghost" size="sm" onClick={onSaveChat}>
          Save
        </Button>
        <Button variant="ghost" size="sm" onClick={onLoadHistory}>
          History
        </Button>
      </div>
    </div>
  );
};
