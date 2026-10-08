import { z } from 'zod';

import type { MediaService } from '../../application/MediaService.js';
import { IMAGE_FORMATS, mimeTypeOf, VIDEO_CODECS } from '../../domain/media.js';
import { image, text } from '../responses.js';
import { deviceParam } from '../schemas.js';
import { defineTool, Hints, type AnyToolDefinition, type ToolProvider } from '../ToolDefinition.js';

/** Tools to capture the simulator screen and feed its media library. */
export class MediaTools implements ToolProvider {
  constructor(private readonly media: MediaService) {}

  tools(): AnyToolDefinition[] {
    return [
      defineTool({
        name: 'screenshot',
        title: 'Take screenshot',
        description:
          'Captures the simulator screen and returns the image. ' +
          'Note: the image is in pixels, while ui_tap and ui_swipe use points ' +
          '(pixels divided by the device scale, usually 3 on iPhone and 2 on iPad). ' +
          'Use ui_describe_screen to get exact element positions in points.',
        inputSchema: {
          format: z.enum(IMAGE_FORMATS).optional().describe('Image format (default: jpeg, which is smaller).'),
          outputPath: z.string().min(1).optional().describe('Also save the image to this path on the Mac.'),
          device: deviceParam,
        },
        annotations: Hints.readOnly,
        execute: async ({ format, outputPath, device }) => {
          const { device: target, value } = await this.media.screenshot({ format, outputPath }, device);
          const saved = value.savedPath ? ` Saved to ${value.savedPath}.` : '';
          return image(value.data, mimeTypeOf(value.format), `Screenshot of ${target.label}.${saved}`);
        },
      }),

      defineTool({
        name: 'start_recording',
        title: 'Start screen recording',
        description:
          'Starts recording the simulator screen to a video file. ' +
          'The file is only complete after calling stop_recording.',
        inputSchema: {
          outputPath: z
            .string()
            .min(1)
            .optional()
            .describe('Destination .mp4 path on the Mac. Defaults to a timestamped file in the output directory.'),
          codec: z.enum(VIDEO_CODECS).optional().describe('Video codec (default: h264).'),
          device: deviceParam,
        },
        annotations: Hints.mutating,
        execute: async ({ outputPath, codec, device }) => {
          const { device: target, value } = await this.media.startRecording({ outputPath, codec }, device);
          return text(`Recording ${target.label} to ${value}. Call stop_recording to finish.`);
        },
      }),

      defineTool({
        name: 'stop_recording',
        title: 'Stop screen recording',
        description: 'Stops a screen recording and returns the path of the finished video.',
        inputSchema: {
          device: z
            .string()
            .min(1)
            .optional()
            .describe('Simulator being recorded: UDID or exact name. Omit when only one recording is active.'),
        },
        annotations: Hints.mutating,
        execute: async ({ device }) => {
          const { device: target, value } = await this.media.stopRecording(device);
          return text(`Recording of ${target.label} saved to ${value}.`);
        },
      }),

      defineTool({
        name: 'add_media',
        title: 'Add photos or videos',
        description: "Adds photos or videos from the Mac to the simulator's Photos library.",
        inputSchema: {
          paths: z.array(z.string().min(1)).min(1).describe('Paths of the image or video files on the Mac.'),
          device: deviceParam,
        },
        annotations: Hints.mutating,
        execute: async ({ paths, device }) => {
          const target = await this.media.addMedia(paths, device);
          return text(`Added ${paths.length} file(s) to the library of ${target.label}.`);
        },
      }),
    ];
  }
}
