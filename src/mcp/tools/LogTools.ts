import { z } from 'zod';

import type { LogService } from '../../application/LogService.js';
import { text } from '../responses.js';
import { deviceParam } from '../schemas.js';
import { defineTool, Hints, type AnyToolDefinition, type ToolProvider } from '../ToolDefinition.js';

/** Tools to read what the simulator and its apps have logged. */
export class LogTools implements ToolProvider {
  constructor(private readonly logs: LogService) {}

  tools(): AnyToolDefinition[] {
    return [
      defineTool({
        name: 'get_logs',
        title: 'Read recent logs',
        description:
          'Reads recent entries of the simulator system log (os_log, NSLog, print output captured ' +
          'by the system). Filter by process to see only your app; unfiltered logs are very noisy.',
        inputSchema: {
          processName: z
            .string()
            .min(1)
            .optional()
            .describe('Only entries from this process, usually the app executable name (e.g. "MyApp").'),
          messageContains: z.string().min(1).optional().describe('Only entries whose message contains this text.'),
          predicate: z
            .string()
            .min(1)
            .optional()
            .describe('Advanced: NSPredicate in "log show" syntax, e.g. subsystem == "com.example.app".'),
          minutes: z.number().int().min(1).max(60).optional().describe('How far back to look (default: 1).'),
          maxLines: z
            .number()
            .int()
            .min(1)
            .max(2000)
            .optional()
            .describe('Maximum number of most recent lines to return (default: 200).'),
          device: deviceParam,
        },
        annotations: Hints.readOnly,
        execute: async ({ device, ...request }) => {
          const { device: target, value } = await this.logs.readRecent(request, device);
          if (value.lines.length === 0) {
            return text(`No log entries matched on ${target.label}.`);
          }
          const header = value.omitted > 0 ? `(${value.omitted} older line(s) omitted)\n` : '';
          return text(header + value.lines.join('\n'));
        },
      }),
    ];
  }
}
