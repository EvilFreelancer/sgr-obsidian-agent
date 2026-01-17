import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChatMessage, ToolCall } from "../types";
import { App } from "obsidian";

interface ChatMessagesProps {
  messages: ChatMessage[];
  streamingContent?: string;
  app: App;
  scrollContainerRef?: React.RefObject<HTMLDivElement>;
  onEditMessage?: (messageIndex: number, content: string) => void;
}

export const ChatMessages: React.FC<ChatMessagesProps> = ({
  messages,
  streamingContent,
  app,
  scrollContainerRef,
  onEditMessage,
}) => {
  // Remove JSON from content if it's already displayed in toolCalls
  const removeToolCallJSON = (content: string, toolCalls?: ToolCall[]): string => {
    if (!toolCalls || toolCalls.length === 0) {
      return content;
    }

    let cleanedContent = content;
    for (const toolCall of toolCalls) {
      if (toolCall.rawJson) {
        // Remove the JSON string from content
        cleanedContent = cleanedContent.replace(toolCall.rawJson, '').trim();
      }
    }
    return cleanedContent;
  };
  const displayMessages = messages.filter((msg) => msg.role !== "system");
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isUserScrollingRef = useRef(false);
  const userScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const wasAtBottomRef = useRef(true);
  const hasInitialScrolledRef = useRef(false);
  const previousMessagesLengthRef = useRef(0);
  const scrollThreshold = 100; // Distance from bottom to consider "at bottom"
  
  // Don't show streaming content if last message is assistant
  // During streaming, we show streamingContent separately, but once it's added to messages,
  // we should only show the message, not both
  const lastMessage = displayMessages[displayMessages.length - 1];
  const isLastMessageStreaming = lastMessage && 
    lastMessage.role === "assistant" && 
    streamingContent &&
    lastMessage.content === streamingContent;
  
  const shouldShowStreaming = streamingContent && !isLastMessageStreaming;

  // Check if user is at bottom of scroll container
  const isAtBottom = (container: HTMLElement): boolean => {
    const { scrollTop, scrollHeight, clientHeight } = container;
    return scrollHeight - scrollTop - clientHeight <= scrollThreshold;
  };

  // Scroll to bottom without animation
  const scrollToBottom = (container: HTMLElement) => {
    container.scrollTop = container.scrollHeight;
  };

  // Handle user scroll events
  useEffect(() => {
    const container = scrollContainerRef?.current;
    if (!container) return;

    const handleWheel = () => {
      isUserScrollingRef.current = true;
      wasAtBottomRef.current = isAtBottom(container);
      
      // Clear existing timeout
      if (userScrollTimeoutRef.current) {
        clearTimeout(userScrollTimeoutRef.current);
      }
      
      // Reset flag after user stops scrolling
      userScrollTimeoutRef.current = setTimeout(() => {
        isUserScrollingRef.current = false;
        // Check if user scrolled back to bottom
        wasAtBottomRef.current = isAtBottom(container);
      }, 150);
    };

    const handleMouseDown = (e: MouseEvent) => {
      // Check if clicking on scrollbar
      const rect = container.getBoundingClientRect();
      const scrollbarWidth = container.offsetWidth - container.clientWidth;
      if (e.clientX >= rect.right - scrollbarWidth) {
        isUserScrollingRef.current = true;
        wasAtBottomRef.current = isAtBottom(container);
      }
    };

    const handleMouseUp = () => {
      if (isUserScrollingRef.current) {
        // Check position after user releases scrollbar
        wasAtBottomRef.current = isAtBottom(container);
        // Reset flag after a short delay
        setTimeout(() => {
          isUserScrollingRef.current = false;
        }, 100);
      }
    };

    const handleTouchStart = () => {
      isUserScrollingRef.current = true;
      wasAtBottomRef.current = isAtBottom(container);
    };

    const handleTouchEnd = () => {
      setTimeout(() => {
        isUserScrollingRef.current = false;
        wasAtBottomRef.current = isAtBottom(container);
      }, 150);
    };

    container.addEventListener('wheel', handleWheel, { passive: true });
    container.addEventListener('mousedown', handleMouseDown);
    container.addEventListener('mouseup', handleMouseUp);
    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('mousedown', handleMouseDown);
      container.removeEventListener('mouseup', handleMouseUp);
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchend', handleTouchEnd);
      if (userScrollTimeoutRef.current) {
        clearTimeout(userScrollTimeoutRef.current);
      }
    };
  }, [scrollContainerRef]);

  // Auto-scroll when messages or streaming content changes
  useEffect(() => {
    const container = scrollContainerRef?.current;
    if (!container) return;

    const messagesLength = displayMessages.length;
    const isFirstLoad = !hasInitialScrolledRef.current && messagesLength > 0;
    const messagesChanged = messagesLength !== previousMessagesLengthRef.current;

    // On first load or when chat is loaded, scroll to bottom immediately
    if (isFirstLoad) {
      requestAnimationFrame(() => {
        scrollToBottom(container);
        wasAtBottomRef.current = true;
        hasInitialScrolledRef.current = true;
      });
      previousMessagesLengthRef.current = messagesLength;
      return;
    }

    // If messages changed significantly (new chat loaded), scroll to bottom
    if (messagesChanged && messagesLength > 0) {
      const previousLength = previousMessagesLengthRef.current;
      const lengthDiff = Math.abs(messagesLength - previousLength);
      
      // Check if this looks like a chat load:
      // - Many messages added at once (more than 1)
      // - Or messages changed significantly (more than 50% change)
      // - Or went from 0 to many messages
      const isChatLoad = 
        (messagesLength > previousLength && lengthDiff > 1) ||
        (previousLength > 0 && lengthDiff > previousLength * 0.5) ||
        (previousLength === 0 && messagesLength > 0);
      
      if (isChatLoad) {
        requestAnimationFrame(() => {
          scrollToBottom(container);
          wasAtBottomRef.current = true;
        });
        previousMessagesLengthRef.current = messagesLength;
        return;
      }
    }

    // Update previous length
    previousMessagesLengthRef.current = messagesLength;

    // If user is not manually scrolling and was at bottom, scroll to bottom
    if (!isUserScrollingRef.current && wasAtBottomRef.current) {
      // Use requestAnimationFrame to ensure DOM is updated
      requestAnimationFrame(() => {
        scrollToBottom(container);
      });
    } else if (!isUserScrollingRef.current) {
      // Update wasAtBottomRef based on current position
      wasAtBottomRef.current = isAtBottom(container);
    }
  }, [messages, streamingContent, scrollContainerRef, displayMessages.length]);

  return (
    <div className="sgr-chat-messages" ref={messagesContainerRef}>
      {displayMessages.length === 0 && (
        <div className="sgr-chat-empty">
          <p>Start a conversation by typing a message below.</p>
        </div>
      )}
      {displayMessages.map((message, index) => (
        <div
          key={index}
          className={`sgr-message sgr-message-${message.role}`}
        >
          <div className="sgr-message-content">
            {message.role === "assistant" && message.toolCalls && message.toolCalls.length > 0 ? (
              <div className="sgr-assistant-message-with-tools">
                {message.toolCalls.map((toolCall, toolIndex) => (
                  <ToolCallDisplay
                    key={toolIndex}
                    toolCall={toolCall}
                  />
                ))}
                {message.finalAnswer ? (
                  <div className="sgr-final-answer">
                    <MarkdownContent
                      content={message.finalAnswer}
                      app={app}
                      className="sgr-markdown"
                    />
                  </div>
                ) : (
                  // Show content without JSON that's already in toolCalls
                  <div className="sgr-message-remaining-content">
                    <MarkdownContent
                      content={removeToolCallJSON(message.content, message.toolCalls)}
                      app={app}
                      className="sgr-markdown"
                    />
                  </div>
                )}
              </div>
            ) : (
              <MarkdownContent
                content={message.content}
                app={app}
                className={message.role === "assistant" ? "sgr-markdown" : "sgr-message-text"}
              />
            )}
          </div>
          <div className="sgr-message-actions">
            <CopyButton 
              content={
                message.role === "assistant" && message.finalAnswer 
                  ? message.finalAnswer 
                  : message.content
              } 
            />
            {message.role === "user" && onEditMessage && (
              <EditButton
                onClick={() => onEditMessage(index, message.content)}
              />
            )}
          </div>
        </div>
      ))}
      {shouldShowStreaming && (
        <div className="sgr-message sgr-message-assistant sgr-message-streaming">
          <div className="sgr-message-content">
            <MarkdownContent
              content={streamingContent}
              app={app}
              className="sgr-markdown"
            />
          </div>
          <CopyButton content={streamingContent} />
        </div>
      )}
    </div>
  );
};

// Component for rendering markdown content with file mentions support
interface MarkdownContentProps {
  content: string;
  app: App;
  className?: string;
}

const MarkdownContent: React.FC<MarkdownContentProps> = ({ content, app, className }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Preprocess content: replace file mentions and file blocks with placeholders
  // Use HTML entities to avoid markdown parsing issues
  const preprocessContent = (text: string): string => {
    // Replace <br> tags with newlines first
    let processed = text.replace(/<br\s*\/?>/gi, '\n');
    
    // Remove file context blocks [File: ...] and replace with placeholder
    // Pattern: [File: path]\ncontent\n[/File]
    processed = processed.replace(/\[File:\s*([^\]]+)\][\s\S]*?\[\/File\]/g, (match, filePath) => {
      const fileName = filePath.split('/').pop() || filePath;
      // Use HTML entities to avoid markdown parsing
      return `\u0001FILE_BLOCK\u0002${filePath}\u0003FILE_BLOCK\u0001`;
    });

    // Replace @[[filename]] mentions with placeholders
    processed = processed.replace(/@\[\[([^\]]+)\]\]/g, (match, filePath) => {
      // Use control characters that won't be parsed by markdown
      return `\u0001FILE_MENTION\u0002${filePath}\u0003FILE_MENTION\u0001`;
    });

    return processed;
  };

  // Post-process rendered content to handle placeholders and @ mentions that weren't caught by components
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    
    // Find all text nodes and process placeholders and @ mentions
    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT,
      null
    );

    const textNodes: Text[] = [];
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent) {
        // Check if text contains placeholders or @ mention pattern
        const text = node.textContent;
        if (
          /\u0001FILE_(BLOCK|MENTION)\u0002/.test(text) ||
          /@\[\[[^\]]+\]\]/.test(text)
        ) {
          textNodes.push(node as Text);
        }
      }
    }

    // Process text nodes with placeholders or @ mentions
    textNodes.forEach((textNode) => {
      const text = textNode.textContent || '';
      const parts: (string | HTMLElement)[] = [];
      let lastIndex = 0;

      // Process placeholders first (control characters)
      const fileBlockRegex = /\u0001FILE_BLOCK\u0002([^\u0003]+)\u0003FILE_BLOCK\u0001/g;
      const fileMentionRegex = /\u0001FILE_MENTION\u0002([^\u0003]+)\u0003FILE_MENTION\u0001/g;
      const placeholderMatches: Array<{ index: number; length: number; filePath: string }> = [];
      let match;

      while ((match = fileBlockRegex.exec(text)) !== null) {
        placeholderMatches.push({
          index: match.index,
          length: match[0].length,
          filePath: match[1],
        });
      }

      while ((match = fileMentionRegex.exec(text)) !== null) {
        placeholderMatches.push({
          index: match.index,
          length: match[0].length,
          filePath: match[1],
        });
      }

      // Also check for @ mentions that weren't replaced
      const mentionRegex = /@\[\[([^\]]+)\]\]/g;
      while ((match = mentionRegex.exec(text)) !== null) {
        placeholderMatches.push({
          index: match.index,
          length: match[0].length,
          filePath: match[1],
        });
      }

      // Sort by index
      placeholderMatches.sort((a, b) => a.index - b.index);

      // Process matches
      placeholderMatches.forEach((matchInfo) => {
        // Add text before match
        if (matchInfo.index > lastIndex) {
          const beforeText = text.substring(lastIndex, matchInfo.index);
          if (beforeText) {
            parts.push(beforeText);
          }
        }
        // Create file mention element
        const filePath = matchInfo.filePath;
        const fileName = filePath.split('/').pop() || filePath;
        const mentionSpan = document.createElement('span');
        mentionSpan.className = 'sgr-file-mention';
        mentionSpan.setAttribute('data-file-path', filePath);
        mentionSpan.textContent = `@${fileName}`;
        
        // Add click handler
        mentionSpan.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          let normalizedPath = filePath;
          if (!normalizedPath.endsWith('.md') && !normalizedPath.includes('.')) {
            normalizedPath = normalizedPath + '.md';
          }
          try {
            app.workspace.openLinkText(normalizedPath, '', true);
          } catch (error) {
            console.error('Failed to open file:', normalizedPath, error);
          }
        });
        
        parts.push(mentionSpan);
        lastIndex = matchInfo.index + matchInfo.length;
      });

      // Add remaining text
      if (lastIndex < text.length) {
        parts.push(text.substring(lastIndex));
      }

      // Replace text node with processed content
      if (parts.length > 1 || (parts.length === 1 && parts[0] instanceof HTMLElement)) {
        const fragment = document.createDocumentFragment();
        parts.forEach((part) => {
          if (typeof part === 'string') {
            fragment.appendChild(document.createTextNode(part));
          } else {
            fragment.appendChild(part);
          }
        });
        textNode.parentNode?.replaceChild(fragment, textNode);
      }
    });
  }, [content, app]);

  // Process text to replace placeholders with clickable file mentions
  const processTextNode = (node: any, keyPrefix: string = ''): React.ReactNode => {
    if (typeof node === 'string') {
      return processTextWithPlaceholders(node, keyPrefix);
    }

    if (Array.isArray(node)) {
      return node.map((child, index) => (
        <React.Fragment key={`${keyPrefix}-${index}`}>
          {processTextNode(child, `${keyPrefix}-${index}`)}
        </React.Fragment>
      ));
    }

    if (React.isValidElement(node)) {
      // If it's a React element, process its children
      const props = node.props as { children?: React.ReactNode };
      if (props && props.children) {
        return React.cloneElement(node, {
          ...props,
          children: processTextNode(props.children, keyPrefix),
        } as any);
      }
    }

    return node;
  };

  // Process text with placeholders and replace with file mentions
  const processTextWithPlaceholders = (text: string, keyPrefix: string): React.ReactNode => {
    if (!text) return text;
    
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let key = 0;

    // Use control characters to match placeholders
    // Format: \u0001FILE_MENTION\u0002{filePath}\u0003FILE_MENTION\u0001
    const fileBlockRegex = /\u0001FILE_BLOCK\u0002([^\u0003]+)\u0003FILE_BLOCK\u0001/g;
    const fileMentionRegex = /\u0001FILE_MENTION\u0002([^\u0003]+)\u0003FILE_MENTION\u0001/g;
    const textToProcess = text;
    const matches: Array<{ index: number; length: number; filePath: string }> = [];
    let match;

    // Collect all file block matches
    while ((match = fileBlockRegex.exec(textToProcess)) !== null) {
      matches.push({
        index: match.index,
        length: match[0].length,
        filePath: match[1],
      });
    }

    // Collect all file mention matches
    while ((match = fileMentionRegex.exec(textToProcess)) !== null) {
      matches.push({
        index: match.index,
        length: match[0].length,
        filePath: match[1],
      });
    }

    // If no matches, check for @ mentions that weren't replaced (fallback)
    if (matches.length === 0) {
      // Check if there are @ mentions that weren't replaced (fallback)
      if (/@\[\[[^\]]+\]\]/.test(text)) {
        // Process @ mentions directly
        const mentionRegex = /@\[\[([^\]]+)\]\]/g;
        const mentionMatches: Array<{ index: number; length: number; filePath: string }> = [];
        while ((match = mentionRegex.exec(text)) !== null) {
          mentionMatches.push({
            index: match.index,
            length: match[0].length,
            filePath: match[1],
          });
        }
        
        if (mentionMatches.length > 0) {
          let lastIdx = 0;
          mentionMatches.forEach((matchInfo) => {
            if (matchInfo.index > lastIdx) {
              parts.push(text.substring(lastIdx, matchInfo.index));
            }
            const fileName = matchInfo.filePath.split('/').pop() || matchInfo.filePath;
            parts.push(
              <FileMention
                key={`${keyPrefix}-mention-${key++}`}
                filePath={matchInfo.filePath}
                fileName={fileName}
                app={app}
              />
            );
            lastIdx = matchInfo.index + matchInfo.length;
          });
          if (lastIdx < text.length) {
            parts.push(text.substring(lastIdx));
          }
          return <>{parts}</>;
        }
      }
      return text;
    }

    // Sort matches by index
    matches.sort((a, b) => a.index - b.index);

    // Process matches in order
    for (const matchInfo of matches) {
      // Add text before match
      if (matchInfo.index > lastIndex) {
        const beforeText = textToProcess.substring(lastIndex, matchInfo.index);
        if (beforeText) {
          parts.push(beforeText);
          key += beforeText.length;
        }
      }
      // Add file mention
      const fileName = matchInfo.filePath.split('/').pop() || matchInfo.filePath;
      parts.push(
        <FileMention
          key={`${keyPrefix}-file-${key}`}
          filePath={matchInfo.filePath}
          fileName={fileName}
          app={app}
        />
      );
      lastIndex = matchInfo.index + matchInfo.length;
      key++;
    }

    // Add remaining text
    if (lastIndex < textToProcess.length) {
      parts.push(textToProcess.substring(lastIndex));
    }

    return parts.length === 1 && typeof parts[0] === 'string' ? parts[0] : <>{parts}</>;
  };

  // Custom components for react-markdown to process text nodes
  // Use text component to catch all text nodes including @ mentions
  const components: any = {
    // Process text nodes directly
    text: ({ children, ...props }: any) => {
      if (typeof children === 'string') {
        return processTextWithPlaceholders(children, 'text');
      }
      return children;
    },
    p: ({ children, ...props }: any) => {
      return <p {...props}>{processTextNode(children, 'p')}</p>;
    },
    li: ({ children, ...props }: any) => {
      return <li {...props}>{processTextNode(children, 'li')}</li>;
    },
    h1: ({ children, ...props }: any) => {
      return <h1 {...props}>{processTextNode(children, 'h1')}</h1>;
    },
    h2: ({ children, ...props }: any) => {
      return <h2 {...props}>{processTextNode(children, 'h2')}</h2>;
    },
    h3: ({ children, ...props }: any) => {
      return <h3 {...props}>{processTextNode(children, 'h3')}</h3>;
    },
    h4: ({ children, ...props }: any) => {
      return <h4 {...props}>{processTextNode(children, 'h4')}</h4>;
    },
    h5: ({ children, ...props }: any) => {
      return <h5 {...props}>{processTextNode(children, 'h5')}</h5>;
    },
    h6: ({ children, ...props }: any) => {
      return <h6 {...props}>{processTextNode(children, 'h6')}</h6>;
    },
    blockquote: ({ children, ...props }: any) => {
      return <blockquote {...props}>{processTextNode(children, 'blockquote')}</blockquote>;
    },
    td: ({ children, ...props }: any) => {
      return <td {...props}>{processTextNode(children, 'td')}</td>;
    },
    th: ({ children, ...props }: any) => {
      return <th {...props}>{processTextNode(children, 'th')}</th>;
    },
    strong: ({ children, ...props }: any) => {
      return <strong {...props}>{processTextNode(children, 'strong')}</strong>;
    },
    em: ({ children, ...props }: any) => {
      return <em {...props}>{processTextNode(children, 'em')}</em>;
    },
    span: ({ children, ...props }: any) => {
      return <span {...props}>{processTextNode(children, 'span')}</span>;
    },
    // Handle code blocks - don't process @ mentions inside code
    code: ({ children, ...props }: any) => {
      // Don't process file mentions in code blocks
      return <code {...props}>{children}</code>;
    },
    pre: ({ children, ...props }: any) => {
      // Don't process file mentions in pre blocks
      return <pre {...props}>{children}</pre>;
    },
    // Handle links - check if it's a file mention
    a: ({ href, children, ...props }: any) => {
      // If href looks like @[[file]], treat it as file mention
      if (href && href.startsWith('@[[') && href.endsWith(']]')) {
        const filePath = href.slice(3, -2);
        const fileName = filePath.split('/').pop() || filePath;
        return (
          <FileMention
            filePath={filePath}
            fileName={fileName}
            app={app}
          />
        );
      }
      // Otherwise, process children for file mentions
      return <a href={href} {...props}>{processTextNode(children, 'a')}</a>;
    },
  };

  const processedContent = preprocessContent(content);

  return (
    <div ref={containerRef} className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {processedContent}
      </ReactMarkdown>
    </div>
  );
};

// Component for clickable file mentions
interface FileMentionProps {
  filePath: string;
  fileName: string;
  app: App;
}

const FileMention: React.FC<FileMentionProps> = ({ filePath, fileName, app }) => {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Normalize file path - add .md extension if not present
    let normalizedPath = filePath;
    if (!normalizedPath.endsWith('.md') && !normalizedPath.includes('.')) {
      normalizedPath = normalizedPath + '.md';
    }

    try {
      app.workspace.openLinkText(normalizedPath, '', true);
    } catch (error) {
      console.error('Failed to open file:', normalizedPath, error);
    }
  };

  return (
    <span
      className="sgr-file-mention"
      onClick={handleClick}
    >
      @{fileName}
    </span>
  );
};

// Component for editing user message
interface EditButtonProps {
  onClick: () => void;
}

const EditButton: React.FC<EditButtonProps> = ({ onClick }) => {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  };

  return (
    <button
      className="sgr-edit-button"
      onClick={handleClick}
      title="Edit"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
      </svg>
    </button>
  );
};

// Component for displaying tool calls in collapsed format
interface ToolCallDisplayProps {
  toolCall: ToolCall;
}

const ToolCallDisplay: React.FC<ToolCallDisplayProps> = ({ toolCall }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const formatDuration = (ms?: number): string => {
    if (!ms) return '...';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const formatToolName = (name: string): string => {
    // Convert snake_case to Title Case
    return name
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <div className="sgr-tool-call">
      <button
        className="sgr-tool-call-header"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="sgr-tool-call-name">{formatToolName(toolCall.toolName)}</span>
        <span className="sgr-tool-call-duration">{formatDuration(toolCall.duration)}</span>
        <span className="sgr-tool-call-toggle">{isExpanded ? '▼' : '▶'}</span>
      </button>
      {isExpanded && toolCall.rawJson && (
        <div className="sgr-tool-call-content">
          <pre className="sgr-tool-call-json">
            {JSON.stringify(JSON.parse(toolCall.rawJson), null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};

// Component for copying message content to clipboard
interface CopyButtonProps {
  content: string;
}

const CopyButton: React.FC<CopyButtonProps> = ({ content }) => {
  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      await navigator.clipboard.writeText(content);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = content;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
      } catch (err) {
        console.error('Fallback copy failed:', err);
      }
      document.body.removeChild(textArea);
    }
  };

  return (
    <button
      className="sgr-copy-button"
      onClick={handleCopy}
      title="Copy"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
    </button>
  );
};
