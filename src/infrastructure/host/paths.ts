import { access } from 'node:fs/promises';
import path from 'node:path';

import { PathNotFoundError } from '../../domain/errors.js';

/**
 * Absolute form of a path given by a client.
 * @throws PathNotFoundError when nothing exists there, which reads far better
 *   than the low-level failure of whichever tool would have received it.
 */
export async function existingPath(candidate: string): Promise<string> {
  const resolved = path.resolve(candidate);
  try {
    await access(resolved);
  } catch {
    throw new PathNotFoundError(candidate);
  }
  return resolved;
}
