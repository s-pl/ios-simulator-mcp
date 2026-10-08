import { z } from 'zod';

import type { MediaService } from '../../application/MediaService.js';
import { IMAGE_FORMATS, mimeTypeOf, RESOLUTIONS, VIDEO_CODECS } from '../../domain/media.js';
import { describeScreenshot } from '../presenters.js';
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
          'Captures the simulator screen and returns the image. By default the image is scaled to ' +
          'one pixel per point, so positions in it are the coordinates ui_tap and ui_swipe expect. ' +
          'Use it to check how things look; to find or tap elements, ui_describe_screen and ' +
          'ui_tap_element are faster. A screen that is black right after launching an app is still loading.',
        inputSchema: {
          format: z.enum(IMAGE_FORMATS).optional().describe('Image format (default: jpeg, which is smaller).'),
          resolution: z
            .enum(RESOLUTIONS)
            .optional()
            .describe('"points" (default): small image whose coordinates match the UI tools. "full": native device pixels.'),
          outputPath: z.string().min(1).optional().describe('Also save the image to this path on the Mac.'),
          device: deviceParam,
        },
        annotations: Hints.readOnly,
        execute: async ({ format, resolution, outputPath, device }) => {
          const { device: target, value } = await this.media.screenshot({ format, resolution, outputPath }, device);
          return image(value.data, mimeTypeOf(value.format), describeScreenshot(target, value));
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
          paths: z.array(z.string().min(1)).min(1).describe('Paths of existing image or video files on the Mac.'),
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
