import path from 'node:path';

import type { Device } from '../domain/Device.js';
import {
  AmbiguousDeviceError,
  NoActiveRecordingError,
  RecordingAlreadyActiveError,
} from '../domain/errors.js';
import type { ImageFormat, RecordingSession, Screenshot, VideoCodec } from '../domain/media.js';
import type { MediaGateway } from '../domain/ports/MediaGateway.js';
import type { OnDevice } from './OnDevice.js';
import type { DeviceResolver } from './DeviceResolver.js';

export interface MediaServiceOptions {
  /** Directory where recordings are written when the client gives no path. */
  readonly outputDirectory: string;
  /** Clock used to name output files; injectable for testing. */
  readonly now?: () => Date;
}

export interface ScreenshotRequest {
  readonly format?: ImageFormat;
  /** Keep a copy of the image at this host path. */
  readonly outputPath?: string;
}

export interface RecordingRequest {
  /** Destination video file. Defaults to a timestamped file in the output directory. */
  readonly outputPath?: string;
  readonly codec?: VideoCodec;
}

interface ActiveRecording {
  readonly device: Device;
  readonly session: RecordingSession;
}

/**
 * Use cases around screen capture.
 *
 * The service owns the recordings in progress (at most one per device), which
 * makes it stateful: call {@link dispose} before the process exits so no
 * recording is left unfinished.
 */
export class MediaService {
  private readonly recordings = new Map<string, ActiveRecording>();
  private readonly outputDirectory: string;
  private readonly now: () => Date;

  constructor(
    private readonly media: MediaGateway,
    private readonly resolver: DeviceResolver,
    options: MediaServiceOptions,
  ) {
    this.outputDirectory = options.outputDirectory;
    this.now = options.now ?? (() => new Date());
  }

  async screenshot(request: ScreenshotRequest = {}, reference?: string): Promise<OnDevice<Screenshot>> {
    const device = await this.resolver.resolveBooted(reference);
    const value = await this.media.captureScreenshot(device.udid, request.format ?? 'jpeg', request.outputPath);
    return { device, value };
  }

  /** Starts recording the screen of a device and returns the destination file. */
  async startRecording(request: RecordingRequest = {}, reference?: string): Promise<OnDevice<string>> {
    const device = await this.resolver.resolveBooted(reference);
    const active = this.recordings.get(device.udid);
    if (active) {
      throw new RecordingAlreadyActiveError(device.label, active.session.outputPath);
    }

    const outputPath = request.outputPath ?? this.defaultRecordingPath(device);
    const session = await this.media.startRecording(device.udid, outputPath, request.codec ?? 'h264');
    this.recordings.set(device.udid, { device, session });
    return { device, value: session.outputPath };
  }

  /**
   * Stops a recording and returns the finished video file.
   * Without a reference, the only recording in progress is stopped.
   */
  async stopRecording(reference?: string): Promise<OnDevice<string>> {
    const active = reference?.trim() ? await this.recordingOf(reference) : this.onlyRecording();
    this.recordings.delete(active.device.udid);
    await active.session.stop();
    return { device: active.device, value: active.session.outputPath };
  }

  async addMedia(paths: readonly string[], reference?: string): Promise<Device> {
    const device = await this.resolver.resolveBooted(reference);
    await this.media.addMedia(device.udid, paths);
    return device;
  }

  /** Finishes every recording in progress. Failures are ignored: this runs on shutdown. */
  async dispose(): Promise<void> {
    const active = [...this.recordings.values()];
    this.recordings.clear();
    await Promise.allSettled(active.map(({ session }) => session.stop()));
  }

  private async recordingOf(reference: string): Promise<ActiveRecording> {
    const device = await this.resolver.resolve(reference);
    const active = this.recordings.get(device.udid);
    if (!active) {
      throw new NoActiveRecordingError(device.label);
    }
    return active;
  }

  private onlyRecording(): ActiveRecording {
    const [first, ...rest] = this.recordings.values();
    if (!first) {
      throw new NoActiveRecordingError();
    }
    if (rest.length > 0) {
      throw new AmbiguousDeviceError(
        'Several recordings are active.',
        [first, ...rest].map(({ device }) => device.label),
      );
    }
    return first;
  }

  private defaultRecordingPath(device: Device): string {
    const timestamp = this.now().toISOString().replaceAll(/[:.]/g, '-');
    const safeName = device.name.replaceAll(/[^A-Za-z0-9_-]+/g, '_');
    return path.join(this.outputDirectory, `recording-${safeName}-${timestamp}.mp4`);
  }
}
