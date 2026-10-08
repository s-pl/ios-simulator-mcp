import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { CompanionConnection } from '../../src/infrastructure/companion/CompanionConnection.js';
import { idbNode, LOGIN_SCREEN } from '../support/elements.js';
import { UDID } from '../support/FakeCommandRunner.js';
import { FakeCompanionServer } from '../support/FakeCompanionServer.js';
import { Harness } from '../support/Harness.js';

/** A companion that never accepts connections, as when it is not installed. */
const unreachable = (): CompanionConnection => ({
  waitUntilReady: async () => {
    throw new Error('Failed to connect before the deadline');
  },
  sendHidEvents: async () => undefined,
  accessibilityInfo: async () => '[]',
  close: () => undefined,
});

let harness: Harness;

afterEach(async () => {
  await harness.stop();
});

describe('UI backend: companion', () => {
  const server = new FakeCompanionServer();

  beforeAll(async () => {
    await server.start();
  });

  afterAll(() => {
    server.stop();
  });

  async function start(): Promise<Harness> {
    server.hidCalls.length = 0;
    server.failure = undefined;
    server.screenJson = JSON.stringify(LOGIN_SCREEN);
    harness = await Harness.start({
      config: { uiBackend: 'companion' },
      companion: { companionPort: async () => server.port },
    });
    return harness;
  }

  it('finds and taps an element over the persistent connection, without the idb command line', async () => {
    await start();
    const result = await harness.ok('ui_tap_element', { label: 'Sign in' });
    expect(result.text).toContain('Button "Sign in" id=login.submit @(195,725) 350x50');
    expect(server.events).toMatchObject([
      { press: { action: { touch: { point: { x: 195, y: 725 } } }, direction: 'DOWN' } },
      { press: { action: { touch: { point: { x: 195, y: 725 } } }, direction: 'UP' } },
    ]);
    expect(harness.runner.matching('idb ')).toEqual([]);
    expect(harness.runner.matching('idb_companion')).toEqual([
      `idb_companion --udid ${UDID.iphone15} --grpc-port ${server.port}`,
    ]);
  });

  it('runs a whole sequence through a single companion', async () => {
    await start();
    await harness.ok('ui_sequence', {
      steps: [
        { action: 'tap_element', label: 'Email' },
        { action: 'type_text', text: 'a@b.co' },
        { action: 'press_button', button: 'HOME' },
        { action: 'swipe', fromX: 10, fromY: 500, toX: 10, toY: 100 },
      ],
    });
    expect(harness.runner.matching('idb_companion')).toHaveLength(1);
    expect(server.hidCalls).toHaveLength(4);
  });

  it('describes the screen in the same compact format', async () => {
    await start();
    const result = await harness.ok('ui_describe_screen');
    expect(result.text).toContain('TextField "Email" id=login.email @(195,300) 350x40');
  });

  it('explains a windowless simulator the same way as the command line backend', async () => {
    await start();
    server.failure = 'No translation object returned for simulator.';
    const result = await harness.call('ui_describe_screen');
    expect(result.text).toMatch(/^\[COMMAND_FAILED\]/);
    expect(result.text).toContain('idb_companion accessibility_info');
  });

  it('reports that the backend is unavailable instead of falling back when it was chosen explicitly', async () => {
    harness = await Harness.start({
      config: { uiBackend: 'companion' },
      companion: { companionConnector: unreachable, companionPort: async () => 1 },
    });
    const result = await harness.call('ui_tap', { x: 1, y: 1 });
    expect(result.text).toMatch(/^\[UI_BACKEND_UNAVAILABLE\] The idb_companion UI backend is not available/);
    expect(harness.runner.matching('idb ')).toEqual([]);
  });
});

describe('UI backend: auto', () => {
  it('falls back to the idb command line when the companion cannot be started, and says so once', async () => {
    harness = await Harness.start({
      config: { uiBackend: 'auto' },
      companion: { companionConnector: unreachable, companionPort: async () => 1 },
    });
    harness.runner.on('idb ui describe-all', JSON.stringify([idbNode('Button', 'OK', [0, 0, 100, 40])]));

    await harness.ok('ui_tap', { x: 10, y: 20 });
    await harness.ok('ui_tap_element', { label: 'OK' });

    expect(harness.runner.matching('idb ui tap')).toHaveLength(2);
    expect(harness.runner.matching('idb_companion')).toHaveLength(1);
    expect(harness.logs).toHaveLength(1);
    expect(harness.logs[0]).toContain('Falling back to the idb command line');
  });

  it('uses the companion when it is available', async () => {
    const server = await new FakeCompanionServer().start();
    try {
      harness = await Harness.start({
        config: { uiBackend: 'auto' },
        companion: { companionPort: async () => server.port },
      });
      await harness.ok('ui_press_button', { button: 'HOME' });
      expect(server.hidCalls).toHaveLength(1);
      expect(harness.runner.matching('idb ui')).toEqual([]);
      expect(harness.logs).toEqual([]);
    } finally {
      server.stop();
    }
  });
});

describe('UI backend: cli', () => {
  it('never starts a companion', async () => {
    harness = await Harness.start({ config: { uiBackend: 'cli' } });
    await harness.ok('ui_press_button', { button: 'HOME' });
    expect(harness.runner.matching('idb_companion')).toEqual([]);
    expect(harness.runner.matching('idb ui button')).toHaveLength(1);
  });
});
