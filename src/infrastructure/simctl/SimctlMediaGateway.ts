import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { ImageFormat, RecordingSession, Screenshot, VideoCodec } from '../../domain/media.js';
import type { MediaGateway } from '../../domain/ports/MediaGateway.js';
import type { BackgroundProcess } from '../process/CommandRunner.js';
import type { SimulatorHost } from '../host/SimulatorHost.js';

/** Time `recordVideo` is given to report that it is capturing frames. */
const RECORDING_START_TIMEOUT_MS = 15_000;
/** Time `recordVideo` is given to finalise the video file after SIGINT. */
const RECORDING_STOP_TIMEOUT_MS = 30_000;

/** {@link MediaGateway} implemented with `xcrun simctl`. */
export class SimctlMediaGateway implements MediaGateway {
  constructor(private readonly host: SimulatorHost) {}

  async captureScreenshot(udid: string, format: ImageFormat, outputPath?: string): Promise<Screenshot> {
    if (outputPath) {
      const savedPath = path.resolve(outputPath);
      await mkdir(path.dirname(savedPath), { recursive: true });
      await this.host.simctl(['io', udid, 'screenshot', `--type=${format}`, savedPath]);
      return { data: await readFile(savedPath), format, savedPath };
    }

    const directory = await mkdtemp(path.join(os.tmpdir(), 'ios-simulator-mcp-'));
    try {
      const file = path.join(directory, `screenshot.${format}`);
      await this.host.simctl(['io', udid, 'screenshot', `--type=${format}`, file]);
      return { data: await readFile(file), format, savedPath: undefined };
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  async startRecording(udid: string, outputPath: string, codec: VideoCodec): Promise<RecordingSession> {
    const resolvedPath = path.resolve(outputPath);
    await mkdir(path.dirname(resolvedPath), { recursive: true });

    const recorder = this.host.startSimctl([
      'io',
      udid,
      'recordVideo',
      `--codec=${codec}`,
      '--force',
      resolvedPath,
    ]);
    try {
      await recorder.waitForOutput(/Recording started/i, RECORDING_START_TIMEOUT_MS);
    } catch (error) {
      await recorder.interrupt(RECORDING_STOP_TIMEOUT_MS).catch(() => undefined);
      throw error;
    }
    return new SimctlRecordingSession(resolvedPath, recorder);
  }

  async addMedia(udid: string, paths: readonly string[]): Promise<void> {
    await this.host.simctl(['addmedia', udid, ...paths.map((file) => path.resolve(file))]);
  }
}

/** A running `simctl io recordVideo` process. */
class SimctlRecordingSession implements RecordingSession {
  constructor(
    readonly outputPath: string,
    private readonly recorder: BackgroundProcess,
  ) {}

  /** `recordVideo` writes the file trailer when interrupted, so wait for it to exit. */
  async stop(): Promise<void> {
    await this.recorder.interrupt(RECORDING_STOP_TIMEOUT_MS);
  }
}
