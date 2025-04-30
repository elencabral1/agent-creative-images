import {
  env,
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
// Could import any other source file/function here
import worker from "../src/server";
import { executions, tools } from "../src/tools";
import { processToolCalls } from "../src/utils";
import { generateId, tool } from "ai";
import type { DataStreamWriter, Message } from "ai";

declare module "cloudflare:test" {
  // Controls the type of `import("cloudflare:test").env`
  interface ProvidedEnv extends Env {}
}

describe("Chat worker", () => {
  it("responds with Not found", async () => {
    const request = new Request("http://example.com");
    // Create an empty context to pass to `worker.fetch()`
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    // Wait for all `Promise`s passed to `ctx.waitUntil()` to settle before running test assertions
    await waitOnExecutionContext(ctx);
    expect(await response.text()).toBe("Not found");
    expect(response.status).toBe(404);
  });
});

describe("getCreativeImages tool", () => {
  let mockMessages: Message[];

  beforeEach(() => {
    mockMessages = [];
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should not expose execute directly", () => {
    expect((tools.getCreativeImages as any).execute).toBeUndefined();
    expect(executions.getCreativeImages).toBeDefined();
  });

  it("should call the execution method with the correct prompt", async () => {
    const prompt = "Campanha para tênis de corrida ecológico";
    const expectedUrl = "https://example.com/generated-image.png";

    const originalExecute = executions.getCreativeImages;
    executions.getCreativeImages = vi.fn().mockResolvedValue(expectedUrl);

    try {
      const result = await executions.getCreativeImages({ prompt });
      expect(result).toBe(expectedUrl);
      expect(executions.getCreativeImages).toHaveBeenCalledWith({ prompt });
    } finally {
      executions.getCreativeImages = originalExecute;
    }
  });

  it("should process tool call when user confirms", async () => {
    const prompt = "Imagem para app de produtividade para jovens";
    const expectedUrl = "https://example.com/creative.png";

    const spy = vi.fn();

    const mockExecutions = {
      getCreativeImages: vi.fn().mockResolvedValue(expectedUrl),
    };

    const mockDataStream: DataStreamWriter = {
      write: spy,
      writeData: vi.fn(),
      writeMessageAnnotation: vi.fn(),
      writeSource: vi.fn(),
      merge: vi.fn(),
      onError: undefined,
    };

    const messages: Message[] = [
      {
        id: generateId(),
        role: "user",
        content: prompt,
        createdAt: new Date(),
      },
      {
        id: generateId(),
        role: "assistant",
        content: "",
        createdAt: new Date(),
        parts: [
          {
            type: "tool-invocation",
            toolInvocation: {
              toolCallId: generateId(),
              toolName: "getCreativeImages",
              args: { prompt },
              state: "result",
              result: "yes",
            },
          },
        ],
      },
    ];

    await processToolCalls({
      tools,
      dataStream: mockDataStream,
      messages,
      executions: mockExecutions,
    });

    expect(mockExecutions.getCreativeImages).toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "tool_result",
      })
    );
  });

  it("should skip execution when user rejects", async () => {
    const prompt = "Imagem para aplicativo de meditação";
    const spy = vi.fn();

    const mockExecutions = {
      getCreativeImages: vi.fn(),
    };

    const mockDataStream: DataStreamWriter = {
      write: spy,
      writeData: vi.fn(),
      writeMessageAnnotation: vi.fn(),
      writeSource: vi.fn(),
      merge: vi.fn(),
      onError: undefined,
    };

    const messages: Message[] = [
      {
        id: generateId(),
        role: "user",
        content: prompt,
        createdAt: new Date(),
      },
      {
        id: generateId(),
        role: "assistant",
        content: "",
        createdAt: new Date(),
        parts: [
          {
            type: "tool-invocation",
            toolInvocation: {
              toolCallId: generateId(),
              toolName: "getCreativeImages",
              args: { prompt },
              state: "result",
              result: "no",
            },
          },
        ],
      },
    ];

    await processToolCalls({
      tools,
      dataStream: mockDataStream,
      messages,
      executions: mockExecutions,
    });

    expect(mockExecutions.getCreativeImages).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "tool_result",
      })
    );
  });
});