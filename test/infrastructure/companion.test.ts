import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  CommandFailedError,
  ExecutableNotFoundError,
  UiBackendUnavailableError,
  UnexpectedOutputError,
  UnsupportedTextError,
} from '../../src/domain/errors.js';
import { Point } from '../../src/domain/geometry.js';
import type { UiAutomationGateway } from '../../src/domain/ports/UiAutomationGateway.js';
import type { CompanionConnection } from '../../src/infrastructure/companion/CompanionConnection.js';
import { CompanionPool } from '../../src/infrastructure/companion/CompanionPool.js';
import { CompanionUiAutomationGateway } from '../../src/infrastructure/companion/CompanionUiAutomationGateway.js';
import { FallbackUiAutomationGateway } from '../../src/infrastructure/companion/FallbackUiAutomationGateway.js';
import { KEY_LEFT_SHIFT, keyStrokeFor } from '../../src/infrastructure/companion/keyboard.js';
import { ProtoWriter, readString } from '../../src/infrastructure/companion/protobuf.js';
import { SimulatorHost } from '../../src/infrastructure/host/SimulatorHost.js';
import { idbNode } from '../support/elements.js';
import { FakeCommandRunner } from '../support/FakeCommandRunner.js';
import { FakeCompanionServer } from '../support/FakeCompanionServer.js';
import { FakeUiGateway } from '../support/fakes.js';

const U = 'UDID-1';

describe('protobuf', () => {
  it('reads back a string field among other fields', () => {
    const message = Buffer.concat([
      new ProtoWriter().varint(1, 300).double(2, 1.5).finish(),
      // field 3, length-delimited, "héllo"
      Buffer.from([0x1a, 0x06]),
      Buffer.from('héllo', 'utf8'),
    ]);
    expect(readString(message, 3)).toBe('héllo');
    expect(readString(message, 9)).toBe('');
  });

  it('reads an empty message', () => {
    expect(readString(Buffer.alloc(0), 1)).toBe('');
  });

  it('omits default values but keeps empty nested messages', () => {
    expect(new ProtoWriter().varint(1, 0).double(2, 0).finish()).toHaveLength(0);
    expect([...new ProtoWriter().message(4, new ProtoWriter()).finish()]).toEqual([0x22, 0x00]);
  });

  it('encodes multi-byte varints', () => {
    expect([...new ProtoWriter().varint(1, 300).finish()]).toEqual([0x08, 0xac, 0x02]);
  });

  it('refuses values a varint cannot hold', () => {
    expect(() => new ProtoWriter().varint(1, -1)).toThrow();
    expect(() => new ProtoWriter().varint(1, 1.5)).toThrow();
  });

  it('fails on a truncated message instead of reading garbage', () => {
    expect(() => readString(Buffer.from([0x0a, 0x05, 0x41]), 2)).not.toThrow();
    expect(() => readString(Buffer.from([0x0a]), 1)).toThrow('Truncated');
  });
});

describe('keyboard', () => {
  it.each([
    ['a', 4, false],
    ['z', 29, false],
    ['A', 4, true],
    ['1', 30, false],
    ['0', 39, false],
    ['!', 30, true],
    ['@', 31, true],
    [' ', 44, false],
    ['-', 45, false],
    ['_', 45, true],
    ['.', 55, false],
    ['?', 56, true],
    ['"', 52, true],
    ['\\', 49, false],
  ])('maps %j to key %i (shift: %s)', (character, keyCode, shift) => {
    expect(keyStrokeFor(character)).toEqual({ keyCode, shift });
  });

  it('covers every printable ASCII character', () => {
    for (let code = 0x20; code <= 0x7e; code += 1) {
      expect(keyStrokeFor(String.fromCharCode(code)), `character ${String.fromCharCode(code)}`).toBeDefined();
    }
  });

  it.each(['ñ', 'á', '👍', '\n', ''])('has no stroke for %j', (character) => {
    expect(keyStrokeFor(character)).toBeUndefined();
  });
});

describe('companion gateway against a real gRPC server', () => {
  const server = new FakeCompanionServer();
  let runner: FakeCommandRunner;
  let pool: CompanionPool;
  let gateway: CompanionUiAutomationGateway;

  beforeAll(async () => {
    await server.start();
  });

  afterAll(() => {
    server.stop();
  });

  beforeEach(() => {
    server.hidCalls.length = 0;
    server.accessibilityRequests.length = 0;
    server.failure = undefined;
    server.screenJson = '[]';
    runner = new FakeCommandRunner();
    pool = new CompanionPool(new SimulatorHost(runner, { platform: 'darwin' }), {
      freePort: async () => server.port,
      startupTimeoutMs: 5000,
    });
    gateway = new CompanionUiAutomationGateway(pool);
  });

  afterEach(async () => {
    await pool.dispose();
  });

  it('starts the companion for the device on the chosen port', async () => {
    await gateway.pressButton(U, 'HOME');
    expect(runner.commandLines).toEqual([`idb_companion --udid ${U} --grpc-port ${server.port}`]);
  });

  it('taps with a press down and a press up at the point', async () => {
    await gateway.tap(U, new Point(195, 725));
    expect(server.hidCalls).toHaveLength(1);
    expect(server.events).toMatchObject([
      { press: { action: { touch: { point: { x: 195, y: 725 } } }, direction: 'DOWN' } },
      { press: { action: { touch: { point: { x: 195, y: 725 } } }, direction: 'UP' } },
    ]);
  });

  it('holds a long press with a delay between down and up', async () => {
    await gateway.tap(U, new Point(10, 20), 1.5);
    expect(server.events).toMatchObject([
      { press: { direction: 'DOWN' } },
      { delay: { duration: 1.5 } },
      { press: { direction: 'UP' } },
    ]);
  });

  it('encodes a point on an axis, whose zero coordinate is omitted on the wire', async () => {
    await gateway.tap(U, new Point(0, 40));
    expect(server.events[0]).toMatchObject({ press: { action: { touch: { point: { x: 0, y: 40 } } } } });
  });

  it('swipes with the defaults of the idb command line', async () => {
    await gateway.swipe(U, new Point(200, 600), new Point(200, 300));
    expect(server.events).toMatchObject([
      { swipe: { start: { x: 200, y: 600 }, end: { x: 200, y: 300 }, delta: 10, duration: 0.5 } },
    ]);
  });

  it('swipes with explicit tuning', async () => {
    await gateway.swipe(U, new Point(1, 2), new Point(3, 4), { durationSeconds: 0.25, stepSize: 5 });
    expect(server.events).toMatchObject([{ swipe: { delta: 5, duration: 0.25 } }]);
  });

  it.each([
    ['APPLE_PAY', 'APPLE_PAY'],
    ['HOME', 'HOME'],
    ['LOCK', 'LOCK'],
    ['SIDE_BUTTON', 'SIDE_BUTTON'],
    ['SIRI', 'SIRI'],
  ] as const)('presses the %s button', async (button, decoded) => {
    await gateway.pressButton(U, button);
    expect(server.events).toMatchObject([
      { press: { action: { button: { button: decoded } }, direction: 'DOWN' } },
      { press: { action: { button: { button: decoded } }, direction: 'UP' } },
    ]);
  });

  it('presses a key by its code', async () => {
    await gateway.pressKey(U, 40);
    expect(server.events).toMatchObject([
      { press: { action: { key: { keycode: 40 } }, direction: 'DOWN' } },
      { press: { action: { key: { keycode: 40 } }, direction: 'UP' } },
    ]);
  });

  it('types text as key presses, holding Shift where needed, in a single request', async () => {
    await gateway.typeText(U, 'Hi!');
    const keys = server.events.map((event) => {
      const press = event['press'] as { action: { key: { keycode: number } }; direction: string };
      return `${press.direction} ${press.action.key.keycode}`;
    });
    expect(server.hidCalls).toHaveLength(1);
    expect(keys).toEqual([
      `DOWN ${KEY_LEFT_SHIFT}`,
      'DOWN 11',
      'UP 11',
      `UP ${KEY_LEFT_SHIFT}`,
      'DOWN 12',
      'UP 12',
      `DOWN ${KEY_LEFT_SHIFT}`,
      'DOWN 30',
      'UP 30',
      `UP ${KEY_LEFT_SHIFT}`,
    ]);
  });

  it('refuses text the keyboard cannot type without sending anything', async () => {
    await expect(gateway.typeText(U, 'año')).rejects.toBeInstanceOf(UnsupportedTextError);
    expect(server.hidCalls).toEqual([]);
  });

  it('reads the whole screen', async () => {
    server.screenJson = JSON.stringify([
      idbNode('Application', null, [0, 0, 390, 844]),
      idbNode('Button', 'Añadir', [20, 700, 350, 50], { identifier: 'add' }),
    ]);
    const elements = await gateway.describeScreen(U);
    expect(elements).toHaveLength(2);
    expect(elements[1]).toMatchObject({ type: 'Button', label: 'Añadir', identifier: 'add' });
    expect(server.accessibilityRequests).toMatchObject([{ point: null, format: 'LEGACY' }]);
  });

  it('reads the element at a point', async () => {
    server.screenJson = JSON.stringify(idbNode('Cell', 'Row', [0, 100, 390, 44]));
    expect(await gateway.describePoint(U, new Point(5, 120))).toMatchObject({ type: 'Cell', label: 'Row' });
    expect(server.accessibilityRequests).toMatchObject([{ point: { x: 5, y: 120 } }]);
  });

  it('returns nothing when no element is at the point', async () => {
    server.screenJson = '';
    expect(await gateway.describePoint(U, new Point(1, 1))).toBeUndefined();
    server.screenJson = 'null';
    expect(await gateway.describePoint(U, new Point(1, 1))).toBeUndefined();
  });

  it.each(['not json', '{"an":"object"}'])('rejects the unexpected screen %j', async (json) => {
    server.screenJson = json;
    await expect(gateway.describeScreen(U)).rejects.toBeInstanceOf(UnexpectedOutputError);
  });

  it('reports a failing request like a failing command, with the reason given by the companion', async () => {
    server.failure = 'No translation object returned for simulator.';
    const reading = gateway.describeScreen(U);
    await expect(reading).rejects.toBeInstanceOf(CommandFailedError);
    await expect(reading).rejects.toMatchObject({
      commandLine: 'idb_companion accessibility_info',
      stderr: 'No translation object returned for simulator.',
    });
    await expect(gateway.tap(U, new Point(1, 1))).rejects.toMatchObject({ commandLine: 'idb_companion hid' });
  });

  it('keeps one companion and one connection per device across calls', async () => {
    await gateway.pressButton(U, 'HOME');
    await gateway.tap(U, new Point(1, 1));
    await gateway.describeScreen(U);
    expect(runner.calls).toHaveLength(1);

    await gateway.pressButton('UDID-2', 'HOME');
    expect(runner.calls).toHaveLength(2);
  });

  it('starts a single companion for calls made at the same time', async () => {
    await Promise.all([gateway.pressButton(U, 'HOME'), gateway.pressButton(U, 'LOCK'), gateway.describeScreen(U)]);
    expect(runner.calls).toHaveLength(1);
  });

  it('starts a new companion after the previous one exits', async () => {
    await gateway.pressButton(U, 'HOME');
    const [companion] = runner.background;
    if (companion) {
      companion.hasExited = true;
    }
    await gateway.pressButton(U, 'HOME');
    expect(runner.calls).toHaveLength(2);
  });

  it('stops its companions when disposed', async () => {
    await gateway.pressButton(U, 'HOME');
    await pool.dispose();
    expect(runner.background[0]?.hasExited).toBe(true);
  });
});

describe('CompanionPool when the companion cannot be used', () => {
  const unreachable = (): CompanionConnection => ({
    waitUntilReady: async () => {
      throw new Error('Failed to connect before the deadline');
    },
    sendHidEvents: async () => undefined,
    accessibilityInfo: async () => '[]',
    close: () => undefined,
  });

  it('reports the backend as unavailable when the companion never becomes ready', async () => {
    const runner = new FakeCommandRunner();
    const pool = new CompanionPool(new SimulatorHost(runner, { platform: 'darwin' }), {
      connect: unreachable,
      freePort: async () => 1,
    });
    const failure = pool.connectionFor(U);
    await expect(failure).rejects.toBeInstanceOf(UiBackendUnavailableError);
    await expect(failure).rejects.toThrow('Failed to connect before the deadline');
    expect(runner.background[0]?.hasExited).toBe(true);
  });

  it('tries again on the next call instead of remembering the failure', async () => {
    const runner = new FakeCommandRunner();
    let attempts = 0;
    const pool = new CompanionPool(new SimulatorHost(runner, { platform: 'darwin' }), {
      connect: () => {
        attempts += 1;
        return unreachable();
      },
      freePort: async () => 1,
    });
    await pool.connectionFor(U).catch(() => undefined);
    await pool.connectionFor(U).catch(() => undefined);
    expect(attempts).toBe(2);
  });

  it('is unavailable off macOS', async () => {
    const pool = new CompanionPool(new SimulatorHost(new FakeCommandRunner(), { platform: 'win32' }));
    await expect(pool.connectionFor(U)).rejects.toBeInstanceOf(UiBackendUnavailableError);
  });
});

describe('FallbackUiAutomationGateway', () => {
  /** A gateway whose every operation fails with the given error. */
  function failing(error: Error): UiAutomationGateway {
    const fail = async (): Promise<never> => {
      throw error;
    };
    return {
      tap: fail,
      swipe: fail,
      typeText: fail,
      pressButton: fail,
      pressKey: fail,
      describeScreen: fail,
      describePoint: fail,
    };
  }

  it('uses the preferred gateway while it works', async () => {
    const preferred = new FakeUiGateway();
    const fallback = new FakeUiGateway();
    const gateway = new FallbackUiAutomationGateway(preferred, fallback);
    await gateway.tap(U, new Point(1, 2));
    await gateway.pressButton(U, 'HOME');
    expect(preferred.calls).toEqual(['tap 1,2', 'button HOME']);
    expect(fallback.calls).toEqual([]);
  });

  it.each([
    new UiBackendUnavailableError('idb_companion', 'not installed'),
    new ExecutableNotFoundError('idb_companion'),
  ])('switches for good after "%s"', async (error) => {
    const fallback = new FakeUiGateway();
    const reasons: string[] = [];
    const gateway = new FallbackUiAutomationGateway(failing(error), fallback, (reason) => reasons.push(reason));

    await gateway.tap(U, new Point(1, 2));
    await gateway.swipe(U, new Point(1, 2), new Point(3, 4));
    await gateway.typeText(U, 'hi');
    await gateway.pressKey(U, 40);
    await gateway.describeScreen(U);
    await gateway.describePoint(U, new Point(1, 2));

    expect(fallback.calls).toEqual(['tap 1,2', 'swipe 1,2 3,4', 'type hi', 'key 40', 'describePoint 1,2']);
    expect(reasons).toEqual([error.message]);
  });

  it('does not hide an ordinary failure of the preferred gateway', async () => {
    const fallback = new FakeUiGateway();
    const gateway = new FallbackUiAutomationGateway(
      failing(new CommandFailedError('idb_companion hid', 13, 'boom')),
      fallback,
    );
    await expect(gateway.tap(U, new Point(1, 2))).rejects.toThrow('boom');
    expect(fallback.calls).toEqual([]);
  });

  it('reports the failure of the fallback too', async () => {
    const gateway = new FallbackUiAutomationGateway(
      failing(new UiBackendUnavailableError('idb_companion', 'not installed')),
      failing(new ExecutableNotFoundError('idb')),
    );
    await expect(gateway.tap(U, new Point(1, 2))).rejects.toBeInstanceOf(ExecutableNotFoundError);
  });
});
