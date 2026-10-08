export const IMAGE_FORMATS = ['png', 'jpeg'] as const;
export type ImageFormat = (typeof IMAGE_FORMATS)[number];

export const VIDEO_CODECS = ['h264', 'hevc'] as const;
export type VideoCodec = (typeof VIDEO_CODECS)[number];

/** A captured image of the simulator screen. */
export interface Screenshot {
  readonly data: Uint8Array;
  readonly format: ImageFormat;
  /** Where the image was written, when the caller asked to keep it on disk. */
  readonly savedPath: string | undefined;
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
