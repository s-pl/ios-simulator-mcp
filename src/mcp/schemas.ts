import { z } from 'zod';

/** Schemas shared by several tools. */

/** Optional target simulator, for tools that default to the booted one. */
export const deviceParam = z
  .string()
  .min(1)
  .optional()
  .describe('Target simulator: UDID or exact name. Omit to use the only booted simulator.');

/** Mandatory target simulator, for tools where guessing would be unsafe. */
export const requiredDeviceParam = z
  .string()
  .min(1)
  .describe('Target simulator: UDID or exact name (see list_devices).');

export const bundleIdParam = z
  .string()
  .min(1)
  .describe('Bundle identifier of the app, e.g. com.apple.mobilesafari.');

/** A screen coordinate in points. */
export const coordinate = (description: string) => z.number().min(0).describe(`${description}, in points.`);
