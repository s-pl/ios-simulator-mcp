import { z } from 'zod';

import type { AppService } from '../../application/AppService.js';
import { APP_CONTAINER_KINDS } from '../../domain/InstalledApp.js';
import { formatApps } from '../presenters.js';
import { text } from '../responses.js';
import { bundleIdParam, deviceParam } from '../schemas.js';
import { defineTool, Hints, type AnyToolDefinition, type ToolProvider } from '../ToolDefinition.js';

/** Tools to install, run and inspect apps in a booted simulator. */
export class AppTools implements ToolProvider {
  constructor(private readonly apps: AppService) {}

  tools(): AnyToolDefinition[] {
    return [
      defineTool({
        name: 'install_app',
        title: 'Install app',
        description:
          'Installs an app built for the simulator from a .app bundle (or .ipa) on the Mac. ' +
          'Reinstalling replaces the binary and keeps the app data.',
        inputSchema: {
          appPath: z.string().min(1).describe('Absolute path of an existing .app bundle on the Mac.'),
          device: deviceParam,
        },
        annotations: Hints.mutating,
        execute: async ({ appPath, device }) => {
          const target = await this.apps.install(appPath, device);
          return text(`Installed ${appPath} on ${target.label}.`);
        },
      }),

      defineTool({
        name: 'uninstall_app',
        title: 'Uninstall app',
        description: 'Uninstalls an app, permanently deleting its data. Fails if the app is not installed.',
        inputSchema: { bundleId: bundleIdParam, device: deviceParam },
        annotations: Hints.destructive,
        execute: async ({ bundleId, device }) => {
          const target = await this.apps.uninstall(bundleId, device);
          return text(`Uninstalled ${bundleId} from ${target.label}.`);
        },
      }),

      defineTool({
        name: 'launch_app',
        title: 'Launch app',
        description:
          'Launches an installed app and returns its process id. The screen can stay black for a few ' +
          'seconds while the app loads: use ui_wait_for_element rather than acting immediately.',
        inputSchema: {
          bundleId: bundleIdParam,
          arguments: z.array(z.string()).optional().describe('Command line arguments passed to the app.'),
          terminateRunning: z
            .boolean()
            .optional()
            .describe('Terminate a running instance first so the app starts fresh.'),
          device: deviceParam,
        },
        annotations: Hints.mutating,
        execute: async ({ bundleId, arguments: args, terminateRunning, device }) => {
          const { device: target, value } = await this.apps.launch(
            bundleId,
            { arguments: args, terminateRunning },
            device,
          );
          const pid = value.pid === undefined ? '' : ` (pid ${value.pid})`;
          return text(`Launched ${bundleId}${pid} on ${target.label}.`);
        },
      }),

      defineTool({
        name: 'terminate_app',
        title: 'Terminate app',
        description: 'Terminates a running app.',
        inputSchema: { bundleId: bundleIdParam, device: deviceParam },
        annotations: Hints.mutating,
        execute: async ({ bundleId, device }) => {
          const target = await this.apps.terminate(bundleId, device);
          return text(`Terminated ${bundleId} on ${target.label}.`);
        },
      }),

      defineTool({
        name: 'list_apps',
        title: 'List installed apps',
        description:
          'Lists the apps installed in a simulator, one per line: bundle id, name and version. ' +
          'Use get_app_container when you need the path of an app on the Mac.',
        inputSchema: {
          type: z
            .enum(['User', 'System'])
            .optional()
            .describe('"User" for apps you installed, "System" for built-in apps. Omit for both.'),
          device: deviceParam,
        },
        annotations: Hints.readOnly,
        execute: async ({ type, device }) => {
          const { device: target, value } = await this.apps.list(type, device);
          return text(formatApps(target, value));
        },
      }),

      defineTool({
        name: 'open_url',
        title: 'Open URL',
        description:
          'Opens a URL in the simulator: a web page in Safari, or a deep link / universal link ' +
          'handled by an installed app (e.g. myapp://profile/42).',
        inputSchema: {
          url: z.string().min(1).describe('URL to open. It must include its scheme, e.g. https:// or myapp://.'),
          device: deviceParam,
        },
        annotations: Hints.mutating,
        execute: async ({ url, device }) => {
          const target = await this.apps.openUrl(url, device);
          return text(`Opened ${url} on ${target.label}.`);
        },
      }),

      defineTool({
        name: 'get_app_container',
        title: 'Get app container path',
        description:
          'Returns the path on the Mac of a container of an installed app, so its files ' +
          '(documents, databases, preferences) can be inspected directly.',
        inputSchema: {
          bundleId: bundleIdParam,
          kind: z
            .enum(APP_CONTAINER_KINDS)
            .optional()
            .describe('"app" for the bundle, "data" for the sandbox (default), "groups" for app groups.'),
          device: deviceParam,
        },
        annotations: Hints.readOnly,
        execute: async ({ bundleId, kind, device }) => {
          const { value } = await this.apps.getContainerPath(bundleId, kind, device);
          return text(value);
        },
      }),
    ];
  }
}
