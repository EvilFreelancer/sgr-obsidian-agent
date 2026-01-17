import {
  SGRAgent,
  AgentConfig,
  StreamingCallback,
} from "sgr-agent-core";
// Import tools directly to avoid including CreateReportTool which uses fs/path
import { ReasoningTool } from "sgr-agent-core/dist/tools/reasoning-tool";
import { FinalAnswerTool } from "sgr-agent-core/dist/tools/final-answer-tool";
import { GeneratePlanTool } from "sgr-agent-core/dist/tools/generate-plan-tool";
import { AdaptPlanTool } from "sgr-agent-core/dist/tools/adapt-plan-tool";
import { WebSearchTool } from "sgr-agent-core/dist/tools/web-search-tool";
import { ExtractPageContentTool } from "sgr-agent-core/dist/tools/extract-page-content-tool";
import OpenAI from "openai";
import { ChatMessage, FileContext } from "../types";
import { ChatMode, CHAT_MODES } from "../constants";

export class AgentManager {
  private openaiClient: OpenAI | null = null;
  private agentConfig: AgentConfig | null = null;
  private currentAgent: SGRAgent | null = null;
  private streamingCallback: StreamingCallback | null = null;

  constructor(
    baseUrl: string,
    apiKey: string,
    proxy?: string,
    model?: string,
    temperature?: number,
    maxTokens?: number,
    tavilyApiKey?: string,
    enableWebSearch: boolean = false
  ) {
    this.updateConfig(baseUrl, apiKey, proxy, model, temperature, maxTokens, tavilyApiKey, enableWebSearch);
  }

  updateConfig(
    baseUrl: string,
    apiKey: string,
    proxy?: string,
    model?: string,
    temperature?: number,
    maxTokens?: number,
    tavilyApiKey?: string,
    enableWebSearch: boolean = false
  ): void {
    if (!baseUrl || !apiKey) {
      this.openaiClient = null;
      this.agentConfig = null;
      return;
    }

    const llmConfig: AgentConfig["llm"] = {
      apiKey,
      model: model || "gpt-4o-mini",
      baseURL: baseUrl,
      proxy,
      temperature: temperature ?? 0.7,
      maxTokens: maxTokens ?? 2000,
    };

    this.agentConfig = {
      llm: llmConfig,
      execution: {
        maxIterations: 5,
        maxClarifications: 3,
        enableStreaming: true,
      },
      search: enableWebSearch && tavilyApiKey
        ? {
            tavilyApiKey,
            tavilyApiBaseUrl: "https://api.tavily.com",
            maxResults: 10,
            contentLimit: 3500,
          }
        : undefined,
    };

    // Create OpenAI client directly with dangerouslyAllowBrowser option
    // This is required for Obsidian (Electron) environment
    // If proxy is specified, use it as baseURL (proxy should forward to baseUrl)
    const clientBaseURL = proxy || baseUrl;
    this.openaiClient = new OpenAI({
      apiKey: apiKey,
      baseURL: clientBaseURL,
      dangerouslyAllowBrowser: true,
    });
  }

  setStreamingCallback(callback: StreamingCallback | null): void {
    this.streamingCallback = callback;
  }

  private getToolsForMode(mode: ChatMode, enableWebSearch: boolean, tavilyApiKey?: string): any[] {
    const tools: any[] = [new ReasoningTool()];

    if (mode === CHAT_MODES.ASK) {
      // Ask mode: reasoning + final
      tools.push(new FinalAnswerTool());
    } else if (mode === CHAT_MODES.PLAN) {
      // Plan mode: reasoning + planning + adapt + final
      tools.push(new GeneratePlanTool());
      tools.push(new AdaptPlanTool());
      tools.push(new FinalAnswerTool());
    } else if (mode === CHAT_MODES.AGENT) {
      // Agent mode: all tools
      tools.push(new GeneratePlanTool());
      tools.push(new AdaptPlanTool());
      tools.push(new FinalAnswerTool());
      
      // Add web search tools only if enabled and API key is set
      if (enableWebSearch && tavilyApiKey) {
        tools.push(new WebSearchTool());
        tools.push(new ExtractPageContentTool());
      }
    }

    return tools;
  }

  async executeAgent(
    userMessage: string,
    mode: ChatMode,
    fileContexts: FileContext[],
    enableWebSearch: boolean = false,
    tavilyApiKey?: string
  ): Promise<AsyncIterable<string>> {
    if (!this.openaiClient || !this.agentConfig) {
      throw new Error("Agent not initialized. Please check your settings.");
    }

    // Update config with current web search settings
    if (this.agentConfig.search) {
      this.agentConfig.search = enableWebSearch && tavilyApiKey
        ? {
            tavilyApiKey,
            tavilyApiBaseUrl: "https://api.tavily.com",
            maxResults: 10,
            contentLimit: 3500,
          }
        : undefined;
    } else if (enableWebSearch && tavilyApiKey) {
      this.agentConfig.search = {
        tavilyApiKey,
        tavilyApiBaseUrl: "https://api.tavily.com",
        maxResults: 10,
        contentLimit: 3500,
      };
    }

    // Build message with file contexts
    let messageContent = userMessage;
    if (fileContexts.length > 0) {
      const fileContextsText = fileContexts
        .map(fc => `[File: ${fc.path}]\n${fc.content}\n[/File]`)
        .join('\n\n');
      messageContent = `${fileContextsText}\n\n${userMessage}`;
    }

    // Get tools for mode
    const tools = this.getToolsForMode(mode, enableWebSearch, tavilyApiKey);

    // Create agent
    const taskMessages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "user", content: messageContent },
    ];

    // Set up streaming callback to collect chunks
    const chunks: string[] = [];
    const streamFinished = { value: false };
    const streamError = { value: null as Error | null };

    const originalCallback = this.streamingCallback;
    const chunkCollector: StreamingCallback = {
      onChunk: (chunk: string) => {
        chunks.push(chunk);
        if (originalCallback?.onChunk) {
          originalCallback.onChunk(chunk);
        }
      },
      onToolCall: (toolCallId: string, toolName: string, toolArguments: string) => {
        if (originalCallback?.onToolCall) {
          originalCallback.onToolCall(toolCallId, toolName, toolArguments);
        }
      },
      onFinish: (finalContent: string) => {
        streamFinished.value = true;
        if (originalCallback?.onFinish) {
          originalCallback.onFinish(finalContent);
        }
      },
    };

    this.currentAgent = new SGRAgent(
      taskMessages,
      this.openaiClient,
      this.agentConfig,
      tools,
      undefined, // name
      undefined, // logger
      chunkCollector
    );

    // Execute agent and stream results
    return this.streamAgentExecution(chunks, streamFinished, streamError);
  }

  private async *streamAgentExecution(
    chunks: string[],
    streamFinished: { value: boolean },
    streamError: { value: Error | null }
  ): AsyncIterable<string> {
    if (!this.currentAgent) {
      throw new Error("Agent not initialized");
    }

    // Timeout for agent execution (5 minutes)
    const EXECUTION_TIMEOUT = 5 * 60 * 1000; // 5 minutes in milliseconds
    const startTime = Date.now();

    // Execute agent in background
    const executionPromise = this.currentAgent.execute().catch((error: Error) => {
      streamError.value = error;
      streamFinished.value = true;
    });

    // Stream chunks as they arrive
    while (!streamFinished.value && !streamError.value) {
      // Check for timeout
      const elapsed = Date.now() - startTime;
      if (elapsed > EXECUTION_TIMEOUT) {
        streamError.value = new Error(
          "Agent execution timeout: The agent took too long to complete. " +
          "This may indicate an infinite loop. Please try rephrasing your request or using a different mode."
        );
        streamFinished.value = true;
        break;
      }

      if (chunks.length > 0) {
        const chunk = chunks.shift()!;
        yield chunk;
      } else {
        // Wait a bit before checking again
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }

    // Yield remaining chunks
    while (chunks.length > 0) {
      yield chunks.shift()!;
    }

    // Wait for execution to complete (with timeout)
    try {
      await Promise.race([
        executionPromise,
        new Promise<void>((_, reject) => {
          setTimeout(() => {
            reject(new Error("Execution promise timeout"));
          }, 1000); // Give 1 second for promise to resolve after stream finished
        }),
      ]);
    } catch (error) {
      // Ignore timeout errors if stream already finished
      if (!streamFinished.value && !streamError.value) {
        streamError.value = error instanceof Error ? error : new Error(String(error));
      }
    }

    if (streamError.value) {
      throw streamError.value;
    }
  }

  stop(): void {
    // Agent execution cannot be stopped directly, but we can clear the callback
    this.streamingCallback = null;
    this.currentAgent = null;
  }
}
