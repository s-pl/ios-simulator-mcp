import type { Device } from '../domain/Device.js';
import type { Point } from '../domain/geometry.js';
import type { UiAutomationGateway } from '../domain/ports/UiAutomationGateway.js';
import type { HardwareButton, SwipeOptions, UiElement } from '../domain/ui.js';
import type { DeviceResolver } from './DeviceResolver.js';
import type { OnDevice } from './OnDevice.js';

/** Criteria to narrow down the accessibility elements of a screen. */
export interface UiElementFilter {
  /** Drop elements without label, value or identifier (pure layout containers). */
  readonly meaningfulOnly?: boolean;
  /** Keep elements whose label, value or identifier contains this text (case-insensitive). */
  readonly containing?: string;
}

/** Use cases to drive the user interface of a booted simulator. */
export class UiService {
  constructor(
    private readonly ui: UiAutomationGateway,
    private readonly resolver: DeviceResolver,
  ) {}

  async tap(point: Point, durationSeconds?: number, reference?: string): Promise<Device> {
    const device = await this.resolver.resolveBooted(reference);
    await this.ui.tap(device.udid, point.rounded(), durationSeconds);
    return device;
  }

  async swipe(from: Point, to: Point, options: SwipeOptions = {}, reference?: string): Promise<Device> {
    const device = await this.resolver.resolveBooted(reference);
    await this.ui.swipe(device.udid, from.rounded(), to.rounded(), options);
    return device;
  }

  async typeText(text: string, reference?: string): Promise<Device> {
    const device = await this.resolver.resolveBooted(reference);
    await this.ui.typeText(device.udid, text);
    return device;
  }

  async pressButton(button: HardwareButton, reference?: string): Promise<Device> {
    const device = await this.resolver.resolveBooted(reference);
    await this.ui.pressButton(device.udid, button);
    return device;
  }

  async pressKey(keyCode: number, reference?: string): Promise<Device> {
    const device = await this.resolver.resolveBooted(reference);
    await this.ui.pressKey(device.udid, keyCode);
    return device;
  }

  async describeScreen(filter: UiElementFilter = {}, reference?: string): Promise<OnDevice<UiElement[]>> {
    const device = await this.resolver.resolveBooted(reference);
    const elements = await this.ui.describeScreen(device.udid);
    const needle = filter.containing?.trim().toLowerCase();
    const value = elements
      .filter((element) => !filter.meaningfulOnly || searchableText(element).length > 0)
      .filter((element) => !needle || searchableText(element).some((text) => text.toLowerCase().includes(needle)));
    return { device, value };
  }

  async describePoint(point: Point, reference?: string): Promise<OnDevice<UiElement | undefined>> {
    const device = await this.resolver.resolveBooted(reference);
    const value = await this.ui.describePoint(device.udid, point.rounded());
    return { device, value };
  }
}

function searchableText(element: UiElement): string[] {
  return [element.label, element.value, element.identifier].filter(
    (text): text is string => typeof text === 'string' && text.length > 0,
  );
}
