import { AppService } from './application/AppService.js';
import type { Clock } from './application/Clock.js';
import { DeviceCatalog } from './application/DeviceCatalog.js';
import { DeviceResolver } from './application/DeviceResolver.js';
import { DeviceService } from './application/DeviceService.js';
import { EnvironmentService } from './application/EnvironmentService.js';
import { LogService } from './application/LogService.js';
import { MediaService } from './application/MediaService.js';
import { UiService } from './application/UiService.js';
import type { ServerConfig } from './config.js';
import { SimulatorHost } from './infrastructure/host/SimulatorHost.js';
import { IdbUiAutomationGateway } from './infrastructure/idb/IdbUiAutomationGateway.js';
import type { CommandRunner } from './infrastructure/process/CommandRunner.js';
import { NodeCommandRunner } from './infrastructure/process/NodeCommandRunner.js';
import { SimctlAppGateway } from './infrastructure/simctl/SimctlAppGateway.js';
import { SimctlDeviceGateway } from './infrastructure/simctl/SimctlDeviceGateway.js';
import { SimctlEnvironmentGateway } from './infrastructure/simctl/SimctlEnvironmentGateway.js';
import { SimctlLogGateway } from './infrastructure/simctl/SimctlLogGateway.js';
import { SimctlMediaGateway } from './infrastructure/simctl/SimctlMediaGateway.js';
import { SimulatorMcpServer } from './mcp/SimulatorMcpServer.js';
import { AppTools } from './mcp/tools/AppTools.js';
import { DeviceTools } from './mcp/tools/DeviceTools.js';
import { EnvironmentTools } from './mcp/tools/EnvironmentTools.js';
import { LogTools } from './mcp/tools/LogTools.js';
import { MediaTools } from './mcp/tools/MediaTools.js';
import { UiTools } from './mcp/tools/UiTools.js';

/** Replaceable collaborators, so tests can run the whole application without a Mac. */
export interface ContainerOverrides {
  readonly runner?: CommandRunner;
  readonly platform?: NodeJS.Platform;
  readonly clock?: Clock;
}

/** The assembled application. */
export interface Container {
  readonly server: SimulatorMcpServer;
  /** Releases resources held by the application (e.g. recordings in progress). */
  dispose(): Promise<void>;
}

/**
 * Composition root: the only place that knows which concrete classes
 * implement each port and how the layers are wired together.
 */
export function createContainer(config: ServerConfig, overrides: ContainerOverrides = {}): Container {
  // Infrastructure
  const runner = overrides.runner ?? new NodeCommandRunner();
  const host = new SimulatorHost(runner, { xcrunPath: config.xcrunPath, platform: overrides.platform });
  const deviceGateway = new SimctlDeviceGateway(host);

  // Application
  const catalog = new DeviceCatalog(deviceGateway, { ttlMs: config.deviceCacheTtlMs, clock: overrides.clock });
  const resolver = new DeviceResolver(catalog);
  const deviceService = new DeviceService(deviceGateway, catalog, resolver);
  const appService = new AppService(new SimctlAppGateway(host), resolver);
  const mediaService = new MediaService(new SimctlMediaGateway(host), deviceGateway, resolver, {
    outputDirectory: config.outputDirectory,
  });
  const uiService = new UiService(new IdbUiAutomationGateway(host, config.idbPath), resolver, overrides.clock);
  const environmentService = new EnvironmentService(new SimctlEnvironmentGateway(host), resolver);
  const logService = new LogService(new SimctlLogGateway(host), resolver);

  // Presentation
  const server = new SimulatorMcpServer({ name: config.name, version: config.version }, [
    new DeviceTools(deviceService),
    new AppTools(appService),
    new UiTools(uiService),
    new MediaTools(mediaService),
    new EnvironmentTools(environmentService),
    new LogTools(logService),
  ]);

  return {
    server,
    dispose: async () => {
      await mediaService.dispose();
      await server.close();
    },
  };
}
