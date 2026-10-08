import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

import { errorResponse } from './responses.js';
import type { AnyToolDefinition, ToolProvider, ToolResponse } from './ToolDefinition.js';

export interface ServerInfo {
  readonly name: string;
  readonly version: string;
}

const INSTRUCTIONS = [
  'Controls the iOS Simulator on this Mac.',
  'Typical flow: list_devices -> boot_device -> install_app / launch_app -> interact -> verify.',
  'Most tools accept an optional "device" (UDID or name) and default to the only booted simulator.',
  'To be fast, keep the number of calls low: tap by text with ui_tap_element instead of looking up ' +
    'coordinates, pass describeAfter: true to get the resulting screen back from an action, and send ' +
    'flows you can plan ahead as a single ui_sequence.',
  'Read the screen with ui_describe_screen (text, cheap) and keep screenshot for visual checks.',
  'UI coordinates are in points; screenshots are returned in points by default.',
  'After launching an app the screen can be black for a few seconds while it loads: wait with ' +
    'ui_wait_for_element instead of acting or capturing immediately.',
  'ui_type_text only types unaccented Latin text; for anything else use set_clipboard and paste.',
].join('\n');

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
