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
import type { UiAutomationGateway } from './domain/ports/UiAutomationGateway.js';
import type { CompanionConnector } from './infrastructure/companion/CompanionConnection.js';
import { CompanionPool } from './infrastructure/companion/CompanionPool.js';
import { CompanionUiAutomationGateway } from './infrastructure/companion/CompanionUiAutomationGateway.js';
import { FallbackUiAutomationGateway } from './infrastructure/companion/FallbackUiAutomationGateway.js';
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
  /** How to reach an idb companion, and on which port to start one. */
  readonly companionConnector?: CompanionConnector;
  readonly companionPort?: () => Promise<number>;
  /** Receives diagnostics that are not part of any tool response. */
  readonly log?: (message: string) => void;
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
  const environmentGateway = new SimctlEnvironmentGateway(host);
  const companions = new CompanionPool(host, {
    companionPath: config.companionPath,
    connect: overrides.companionConnector,
    freePort: overrides.companionPort,
  });
  const uiGateway = createUiGateway(config, host, companions, overrides.log ?? (() => undefined));
  const uiService = new UiService(uiGateway, environmentGateway, resolver, overrides.clock);
  const environmentService = new EnvironmentService(environmentGateway, resolver);
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
      await companions.dispose();
      await server.close();
    },
  };
}

/** Picks the adapter that drives the user interface, according to the configuration. */
function createUiGateway(
  config: ServerConfig,
  host: SimulatorHost,
  companions: CompanionPool,
  log: (message: string) => void,
): UiAutomationGateway {
  const cli = new IdbUiAutomationGateway(host, config.idbPath);
  const companion = new CompanionUiAutomationGateway(companions);
  switch (config.uiBackend) {
    case 'cli':
      return cli;
    case 'companion':
      return companion;
    case 'auto':
      return new FallbackUiAutomationGateway(companion, cli, (reason) =>
        log(`Falling back to the idb command line for UI automation. ${reason}`),
      );
  }
}
