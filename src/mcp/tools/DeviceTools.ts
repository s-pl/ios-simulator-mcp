import { z } from 'zod';

import type { DeviceService } from '../../application/DeviceService.js';
import { json, text } from '../responses.js';
import { deviceParam, requiredDeviceParam } from '../schemas.js';
import { defineTool, Hints, type AnyToolDefinition, type ToolProvider } from '../ToolDefinition.js';

/** Tools to discover simulators and control their lifecycle. */
export class DeviceTools implements ToolProvider {
  constructor(private readonly devices: DeviceService) {}

  tools(): AnyToolDefinition[] {
    return [
      defineTool({
        name: 'list_devices',
        title: 'List simulators',
        description:
          'Lists the available simulators with their name, UDID, runtime and state. ' +
          'Use it to find the device to boot or to target with other tools.',
        inputSchema: {
          bootedOnly: z.boolean().optional().describe('Return only running simulators.'),
          platform: z.string().optional().describe('Filter by platform, e.g. "iOS", "watchOS", "tvOS".'),
        },
        annotations: Hints.readOnly,
        execute: async ({ bootedOnly, platform }) => {
          const devices = await this.devices.list({ bootedOnly, platform });
          return json(devices.map((device) => device.toSnapshot()));
        },
      }),

      defineTool({
        name: 'boot_device',
        title: 'Boot simulator',
        description:
          'Boots a simulator and waits until it is ready to use. Does nothing if it is already running. ' +
          'If the Simulator window cannot be opened the boot still succeeds and a warning is returned.',
        inputSchema: {
          device: requiredDeviceParam,
          showWindow: z
            .boolean()
            .optional()
            .describe('Bring the Simulator app window to the foreground (default: true).'),
        },
        annotations: { ...Hints.mutating, idempotentHint: true },
        execute: async ({ device, showWindow }) => {
          const result = await this.devices.boot(device, showWindow ?? true);
          const outcome = result.alreadyBooted
            ? `${result.device.label} was already booted.`
            : `Booted ${result.device.label}.`;
          return text(result.warning ? `${outcome}\nWarning: ${result.warning}` : outcome);
        },
      }),

      defineTool({
        name: 'shutdown_device',
        title: 'Shut down simulator',
        description: 'Shuts down a simulator, or every running simulator when "all" is true.',
        inputSchema: {
          device: deviceParam,
          all: z.boolean().optional().describe('Shut down every running simulator.'),
        },
        annotations: { ...Hints.mutating, idempotentHint: true },
        execute: async ({ device, all }) => {
          if (all) {
            await this.devices.shutdownAll();
            return text('All simulators were shut down.');
          }
          const target = await this.devices.shutdown(device);
          return text(`Shut down ${target.label}.`);
        },
      }),

      defineTool({
        name: 'erase_device',
        title: 'Erase simulator',
        description:
          'Restores a simulator to factory settings, permanently deleting its apps, data and settings. ' +
          'The simulator must be shut down first.',
        inputSchema: { device: requiredDeviceParam },
        annotations: Hints.destructive,
        execute: async ({ device }) => {
          const target = await this.devices.erase(device);
          return text(`Erased all content and settings of ${target.label}.`);
        },
      }),

      defineTool({
        name: 'open_simulator_app',
        title: 'Open Simulator app',
        description: 'Opens the Simulator app window on the Mac, optionally focused on a device.',
        inputSchema: {
          device: z.string().min(1).optional().describe('Simulator to focus: UDID or exact name.'),
        },
        annotations: { ...Hints.mutating, idempotentHint: true },
        execute: async ({ device }) => {
          await this.devices.openSimulatorApp(device);
          return text('Simulator app opened.');
        },
      }),
    ];
  }
}
