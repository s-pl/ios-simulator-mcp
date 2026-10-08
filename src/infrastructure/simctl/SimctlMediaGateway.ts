import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { SimulatorError } from '../../domain/errors.js';
import type {
  CaptureOptions,
  CapturedImage,
  ImageFormat,
  RecordingSession,
  VideoCodec,
} from '../../domain/media.js';
import type { MediaGateway } from '../../domain/ports/MediaGateway.js';
import { existingPath } from '../host/paths.js';
import type { SimulatorHost } from '../host/SimulatorHost.js';
import type { BackgroundProcess } from '../process/CommandRunner.js';

/**
 * Time `recordVideo` is given to report that it is capturing frames. It
 * normally answers within a second, but can take far longer on a busy machine.
 */
const RECORDING_START_TIMEOUT_MS = 60_000;
/** Time `recordVideo` is given to finalise the video file after SIGINT. */
const RECORDING_STOP_TIMEOUT_MS = 30_000;

/**
 * {@link MediaGateway} implemented with `xcrun simctl`, plus the `sips` image
 * tool that ships with macOS for resizing.
 */
export class SimctlMediaGateway implements MediaGateway {
  constructor(private readonly host: SimulatorHost) {}

  async captureScreenshot(udid: string, format: ImageFormat, options: CaptureOptions = {}): Promise<CapturedImage> {
    if (options.outputPath) {
      const savedPath = path.resolve(options.outputPath);
      await mkdir(path.dirname(savedPath), { recursive: true });
      const downscaled = await this.capture(udid, format, savedPath, options.downscaleBy);
      return { data: await readFile(savedPath), format, savedPath, downscaled };
    }

    const directory = await mkdtemp(path.join(os.tmpdir(), 'ios-simulator-mcp-'));
    try {
      const file = path.join(directory, `screenshot.${format}`);
      const downscaled = await this.capture(udid, format, file, options.downscaleBy);
      return { data: await readFile(file), format, savedPath: undefined, downscaled };
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
    const files = await Promise.all(paths.map(existingPath));
    await this.host.simctl(['addmedia', udid, ...files]);
  }

  /** Writes a screenshot to `file` and reports whether it could be downscaled. */
  private async capture(
    udid: string,
    format: ImageFormat,
    file: string,
    downscaleBy: number | undefined,
  ): Promise<boolean> {
    await this.host.simctl(['io', udid, 'screenshot', `--type=${format}`, file]);
    return downscaleBy !== undefined && downscaleBy > 1 ? this.downscale(file, downscaleBy) : false;
  }

  /**
   * Shrinks an image in place. Resizing is an optimisation: if `sips` is
   * unavailable or misbehaves, the original capture is kept and `false` is
   * returned so the caller knows the image is still in native pixels.
   */
  private async downscale(file: string, factor: number): Promise<boolean> {
    try {
      const { stdout } = await this.host.run('sips', ['-g', 'pixelWidth', file]);
      const width = parsePixelWidth(stdout);
      if (width === undefined) {
        return false;
      }
      await this.host.run('sips', ['--resampleWidth', String(Math.round(width / factor)), file]);
      return true;
    } catch (error) {
      if (error instanceof SimulatorError) {
        return false;
      }
      throw error;
    }
  }
}

/** Reads the width from the output of `sips -g pixelWidth`. */
export function parsePixelWidth(output: string): number | undefined {
  const match = /pixelWidth:\s*(\d+)/.exec(output);
  return match?.[1] ? Number(match[1]) : undefined;
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
