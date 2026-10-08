import type { CaptureOptions, CapturedImage, ImageFormat, RecordingSession, VideoCodec } from '../media.js';

/** Capture of the simulator screen and management of its media library. */
export interface MediaGateway {
  /** Captures the screen. */
  captureScreenshot(udid: string, format: ImageFormat, options?: CaptureOptions): Promise<CapturedImage>;

  /** Starts recording the screen; resolves once frames are being captured. */
  startRecording(udid: string, outputPath: string, codec: VideoCodec): Promise<RecordingSession>;

  /**
   * Adds photos or videos from the host to the device's library.
   * @throws PathNotFoundError when one of the files does not exist.
   */
  addMedia(udid: string, paths: readonly string[]): Promise<void>;
}
