import { describe, expect, it } from 'vitest';

import {
  CommandFailedError,
  CommandTimeoutError,
  ExecutableNotFoundError,
} from '../../src/domain/errors.js';
import { NodeCommandRunner } from '../../src/infrastructure/process/NodeCommandRunner.js';

const node = process.execPath;
const runner = new NodeCommandRunner();

describe('NodeCommandRunner.run', () => {
  it('captures standard output', async () => {
    const result = await runner.run(node, ['-e', 'process.stdout.write("hello")']);
    expect(result.stdout).toBe('hello');
  });

  it('passes arguments verbatim, without shell interpretation', async () => {
    const tricky = 'a "quoted" $HOME; echo && value';
    const result = await runner.run(node, ['-e', 'process.stdout.write(process.argv[1])', tricky]);
    expect(result.stdout).toBe(tricky);
  });

  it('feeds standard input', async () => {
    const result = await runner.run(node, ['-e', 'process.stdin.pipe(process.stdout)'], { stdin: 'piped' });
    expect(result.stdout).toBe('piped');
  });

  it('fails with the error output on a non-zero exit status', async () => {
    const failure = runner.run(node, ['-e', 'console.error("boom"); process.exit(3)']);
    await expect(failure).rejects.toMatchObject({ exitCode: 3, stderr: expect.stringContaining('boom') });
    await expect(failure).rejects.toBeInstanceOf(CommandFailedError);
  });

  it('reports a missing executable', async () => {
    await expect(runner.run('definitely-not-a-real-command-xyz', [])).rejects.toBeInstanceOf(
      ExecutableNotFoundError,
    );
  });

  it('kills a command that exceeds its timeout', async () => {
    await expect(
      runner.run(node, ['-e', 'setTimeout(() => {}, 60000)'], { timeoutMs: 200 }),
    ).rejects.toBeInstanceOf(CommandTimeoutError);
  });
});

describe('NodeCommandRunner.start', () => {
  it('waits for output and stops the process on interrupt', async () => {
    const background = runner.start(node, ['-e', 'console.error("Recording started"); setTimeout(() => {}, 60000)']);
    await background.waitForOutput(/Recording started/, 10_000);
    expect(background.hasExited).toBe(false);
    await background.interrupt(10_000);
    expect(background.hasExited).toBe(true);
  });

  it('rejects the wait when the process exits before producing the output', async () => {
    const background = runner.start(node, ['-e', 'console.error("Invalid device"); process.exit(1)']);
    await expect(background.waitForOutput(/Recording started/, 10_000)).rejects.toMatchObject({
      stderr: expect.stringContaining('Invalid device'),
    });
  });

  it('reports a missing executable when waiting', async () => {
    const background = runner.start('definitely-not-a-real-command-xyz', []);
    await expect(background.waitForOutput(/anything/, 10_000)).rejects.toBeInstanceOf(ExecutableNotFoundError);
  });
});
