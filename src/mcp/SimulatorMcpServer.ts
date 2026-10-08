import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

import { errorResponse } from './responses.js';
import type { AnyToolDefinition, ToolProvider, ToolResponse } from './ToolDefinition.js';

export interface ServerInfo {
  readonly name: string;
  readonly version: string;
}

const INSTRUCTIONS =
  'Controls the iOS Simulator on this Mac. Typical flow: list_devices -> boot_device -> ' +
  'install_app / launch_app -> ui_describe_screen to find elements -> ui_tap / ui_type_text -> ' +
  'screenshot to verify. Most tools accept an optional "device" (UDID or name) and default to ' +
  'the only booted simulator. UI coordinates are always in points, not screenshot pixels.';

/**
 * The MCP face of the application: publishes tool definitions through the MCP
 * protocol and turns any failure into an error response the model can read.
 *
 * The server is assembled from {@link ToolProvider}s and is independent of the
 * transport, which is supplied on {@link connect}.
 */
export class SimulatorMcpServer {
  private readonly server: McpServer;
  private readonly registered = new Set<string>();

  constructor(info: ServerInfo, providers: readonly ToolProvider[]) {
    this.server = new McpServer(info, { instructions: INSTRUCTIONS });
    for (const provider of providers) {
      for (const tool of provider.tools()) {
        this.register(tool);
      }
    }
  }

  /** Names of the tools the server exposes. */
  get toolNames(): string[] {
    return [...this.registered];
  }

  /** Starts serving requests over the given transport. */
  async connect(transport: Transport): Promise<void> {
    await this.server.connect(transport);
  }

  async close(): Promise<void> {
    await this.server.close();
  }

  private register(tool: AnyToolDefinition): void {
    if (this.registered.has(tool.name)) {
      throw new Error(`Duplicate tool name: ${tool.name}`);
    }
    this.registered.add(tool.name);

    this.server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: { title: tool.title, ...tool.annotations },
      },
      async (input: Record<string, unknown>): Promise<ToolResponse> => {
        try {
          return await tool.execute(input);
        } catch (error) {
          return errorResponse(error);
        }
      },
    );
  }
}
