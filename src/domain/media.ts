export const IMAGE_FORMATS = ['png', 'jpeg'] as const;
export type ImageFormat = (typeof IMAGE_FORMATS)[number];

export const VIDEO_CODECS = ['h264', 'hevc'] as const;
export type VideoCodec = (typeof VIDEO_CODECS)[number];

/**
 * Size of a screenshot.
 * - `points`: one image pixel per screen point, so positions in the image are
 *   the coordinates the UI tools expect. Much smaller, the default.
 * - `full`: the native pixels of the device.
 */
export const RESOLUTIONS = ['points', 'full'] as const;
export type Resolution = (typeof RESOLUTIONS)[number];

/** How a capture should be produced. */
export interface CaptureOptions {
  /** Keep the image at this host path. */
  readonly outputPath?: string;
  /** Shrink the image by this factor (the device scale turns pixels into points). */
  readonly downscaleBy?: number;
}

/** Raw result of capturing the screen. */
export interface CapturedImage {
  readonly data: Uint8Array;
  readonly format: ImageFormat;
  /** Where the image was written, when the caller asked to keep it on disk. */
  readonly savedPath: string | undefined;
  /** Whether the requested downscaling was actually applied. */
  readonly downscaled: boolean;
}

/** A captured image of the simulator screen, with what is needed to read coordinates off it. */
export interface Screenshot extends CapturedImage {
  /** Unit of the image: `points` when image positions equal UI coordinates. */
  readonly coordinateSpace: 'points' | 'pixels';
  /** Pixels per point of the device screen, when known. */
  readonly deviceScale: number | undefined;
}

/** MIME type matching an {@link ImageFormat}. */
export function mimeTypeOf(format: ImageFormat): string {
  return format === 'png' ? 'image/png' : 'image/jpeg';
}

/** Handle to a screen recording in progress. */
export interface RecordingSession {
  /** File the video is being written to. */
  readonly outputPath: string;
  /** Finishes the recording and waits until the video file is finalised. */
  stop(): Promise<void>;
}
