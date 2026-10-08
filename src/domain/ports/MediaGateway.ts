import type { ImageFormat, RecordingSession, Screenshot, VideoCodec } from '../media.js';

/** Capture of the simulator screen and management of its media library. */
export interface MediaGateway {
  /**
   * Captures the screen.
   * @param outputPath When given, the image is also kept at that host path.
   */
  captureScreenshot(udid: string, format: ImageFormat, outputPath?: string): Promise<Screenshot>;

  /** Starts recording the screen; resolves once frames are being captured. */
  startRecording(udid: string, outputPath: string, codec: VideoCodec): Promise<RecordingSession>;

  /** Adds photos or videos from the host to the device's library. */
  addMedia(udid: string, paths: readonly string[]): Promise<void>;
}
