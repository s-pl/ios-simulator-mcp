import type { CallToolResult, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type { z } from 'zod';

/** What a tool returns to the client. */
export type ToolResponse = CallToolResult;

/**
 * Declarative description of an MCP tool: its contract (name, documentation,
 * input schema, behavioural hints) plus the function that executes it.
 *
 * Definitions know nothing about the MCP server they will be registered in,
 * which keeps them trivially testable.
 */
export interface ToolDefinition<Shape extends z.ZodRawShape = z.ZodRawShape> {
  /** Unique snake_case identifier clients call the tool by. */
  readonly name: string;
  /** Short human readable name. */
  readonly title: string;
  /** Guidance for the model: what the tool does and when to use it. */
  readonly description: string;
  /** Zod schema of each input parameter. */
  readonly inputSchema: Shape;
  readonly annotations?: ToolAnnotations;
  /** Runs the tool with already validated input. May throw; errors are presented by the server. */
  execute(input: z.objectOutputType<Shape, z.ZodTypeAny>): Promise<ToolResponse>;
}

/** A tool definition whose input type has been erased, for heterogeneous collections. */
export type AnyToolDefinition = ToolDefinition<any>;

/** Identity helper that infers the input type of `execute` from `inputSchema`. */
export function defineTool<Shape extends z.ZodRawShape>(definition: ToolDefinition<Shape>): AnyToolDefinition {
  return definition;
}

/** A cohesive group of tools, typically backed by one application service. */
export interface ToolProvider {
  tools(): AnyToolDefinition[];
}

/** Annotation presets describing how a tool affects the simulator. */
export const Hints = {
  /** Only reads state. */
  readOnly: { readOnlyHint: true, openWorldHint: false },
  /** Changes state in a way that is easy to undo or repeat. */
  mutating: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  /** Deletes data that cannot be recovered. */
  destructive: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
} as const satisfies Record<string, ToolAnnotations>;
