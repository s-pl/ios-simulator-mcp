import { z } from 'zod';

import type { EnvironmentService } from '../../application/EnvironmentService.js';
import {
  APPEARANCES,
  BATTERY_STATES,
  CELLULAR_MODES,
  DATA_NETWORKS,
  PERMISSION_ACTIONS,
  PRIVACY_SERVICES,
  WIFI_MODES,
} from '../../domain/environment.js';
import { InvalidArgumentError } from '../../domain/errors.js';
import { text } from '../responses.js';
import { bundleIdParam, deviceParam } from '../schemas.js';
import { defineTool, Hints, type AnyToolDefinition, type ToolProvider } from '../ToolDefinition.js';

/** Tools to simulate the conditions an app runs under. */
export class EnvironmentTools implements ToolProvider {
  constructor(private readonly environment: EnvironmentService) {}

  tools(): AnyToolDefinition[] {
    return [
      defineTool({
        name: 'set_appearance',
        title: 'Set light or dark mode',
        description: 'Switches the simulator between light and dark appearance.',
        inputSchema: {
          appearance: z.enum(APPEARANCES).describe('Appearance to apply.'),
          device: deviceParam,
        },
        annotations: { ...Hints.mutating, idempotentHint: true },
        execute: async ({ appearance, device }) => {
          const target = await this.environment.setAppearance(appearance, device);
          return text(`${target.label} now uses the ${appearance} appearance.`);
        },
      }),

      defineTool({
        name: 'set_location',
        title: 'Simulate location',
        description:
          'Simulates a GPS location, or stops simulating one when "clear" is true.',
        inputSchema: {
          latitude: z.number().min(-90).max(90).optional().describe('Latitude in decimal degrees.'),
          longitude: z.number().min(-180).max(180).optional().describe('Longitude in decimal degrees.'),
          clear: z.boolean().optional().describe('Stop simulating a location instead of setting one.'),
          device: deviceParam,
        },
        annotations: { ...Hints.mutating, idempotentHint: true },
        execute: async ({ latitude, longitude, clear, device }) => {
          if (clear) {
            const target = await this.environment.clearLocation(device);
            return text(`Location simulation cleared on ${target.label}.`);
          }
          if (latitude === undefined || longitude === undefined) {
            throw new InvalidArgumentError('Provide both latitude and longitude, or clear: true.');
          }
          const target = await this.environment.setLocation({ latitude, longitude }, device);
          return text(`Location of ${target.label} set to ${latitude}, ${longitude}.`);
        },
      }),

      defineTool({
        name: 'set_status_bar',
        title: 'Override status bar',
        description:
          'Overrides what the status bar shows (clock, network, battery), which is useful for clean ' +
          'screenshots. Pass "clear": true to restore the real values.',
        inputSchema: {
          time: z.string().optional().describe('Clock text, e.g. "9:41".'),
          dataNetwork: z.enum(DATA_NETWORKS).optional().describe('Data network indicator.'),
          wifiMode: z.enum(WIFI_MODES).optional(),
          wifiBars: z.number().int().min(0).max(3).optional().describe('Wi-Fi signal strength, 0-3.'),
          cellularMode: z.enum(CELLULAR_MODES).optional(),
          cellularBars: z.number().int().min(0).max(4).optional().describe('Cellular signal strength, 0-4.'),
          operatorName: z.string().optional().describe('Carrier name.'),
          batteryState: z.enum(BATTERY_STATES).optional(),
          batteryLevel: z.number().int().min(0).max(100).optional().describe('Battery percentage, 0-100.'),
          clear: z.boolean().optional().describe('Remove every override instead of setting values.'),
          device: deviceParam,
        },
        annotations: { ...Hints.mutating, idempotentHint: true },
        execute: async ({ clear, device, ...overrides }) => {
          if (clear) {
            const target = await this.environment.clearStatusBar(device);
            return text(`Status bar overrides cleared on ${target.label}.`);
          }
          const target = await this.environment.overrideStatusBar(overrides, device);
          return text(`Status bar overridden on ${target.label}.`);
        },
      }),

      defineTool({
        name: 'set_permission',
        title: 'Change privacy permission',
        description:
          'Grants, revokes or resets a privacy permission (photos, location, contacts, microphone…) ' +
          'so permission dialogs do not need to be answered by hand. ' +
          'Changing a permission may terminate the affected app.',
        inputSchema: {
          action: z.enum(PERMISSION_ACTIONS).describe('"reset" returns the permission to "not asked yet".'),
          service: z.enum(PRIVACY_SERVICES).describe('Permission to change; "all" applies to every service.'),
          bundleId: bundleIdParam
            .optional()
            .describe('App the change applies to. Required for grant and revoke; omit on reset to affect all apps.'),
          device: deviceParam,
        },
        annotations: Hints.mutating,
        execute: async ({ action, service, bundleId, device }) => {
          const target = await this.environment.changePermission({ action, service, bundleId }, device);
          const scope = bundleId ? ` for ${bundleId}` : '';
          return text(`Permission "${service}" ${PAST_TENSE[action]}${scope} on ${target.label}.`);
        },
      }),

      defineTool({
        name: 'send_push_notification',
        title: 'Send push notification',
        description:
          'Delivers a simulated remote push notification to an app. The payload is a standard APNs ' +
          'payload, e.g. {"aps": {"alert": {"title": "Hi", "body": "Hello"}, "badge": 1}}.',
        inputSchema: {
          bundleId: bundleIdParam,
          payload: z
            .object({ aps: z.record(z.unknown()).describe('The APNs "aps" dictionary.') })
            .passthrough()
            .describe('APNs payload; custom keys are allowed next to "aps".'),
          device: deviceParam,
        },
        annotations: Hints.mutating,
        execute: async ({ bundleId, payload, device }) => {
          const target = await this.environment.sendPushNotification(bundleId, payload, device);
          return text(`Push notification sent to ${bundleId} on ${target.label}.`);
        },
      }),
    ];
  }
}

const PAST_TENSE = { grant: 'granted', revoke: 'revoked', reset: 'reset' } as const;
