import { SimulatorError } from '../domain/errors.js';
import type { ToolResponse } from './ToolDefinition.js';

/** A plain text response. */
export function text(message: string): ToolResponse {
  return { content: [{ type: 'text', text: message }] };
}

/** A response carrying structured data, rendered as indented JSON. */
export function json(value: unknown): ToolResponse {
  return text(JSON.stringify(value, null, 2));
}

/** A response carrying an image, optionally preceded by a caption. */
export function image(data: Uint8Array, mimeType: string, caption?: string): ToolResponse {
  return {
    content: [
      ...(caption ? [{ type: 'text' as const, text: caption }] : []),
      { type: 'image', data: Buffer.from(data).toString('base64'), mimeType },
    ],
  };
}

/**
 * Presents a failure as a tool error the model can read and act upon.
 * Domain errors are shown with their code; anything else is unexpected.
 */
export function errorResponse(error: unknown): ToolResponse {
  const message =
    error instanceof SimulatorError
      ? `[${error.code}] ${error.message}`
      : `[UNEXPECTED_ERROR] ${error instanceof Error ? error.message : String(error)}`;
  return { isError: true, content: [{ type: 'text', text: message }] };
}
