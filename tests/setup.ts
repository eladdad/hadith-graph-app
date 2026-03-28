import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeAll, vi } from 'vitest';

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  if (!window.PointerEvent) {
    Object.defineProperty(window, 'PointerEvent', {
      writable: true,
      value: MouseEvent,
    });
  }

  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    writable: true,
    value: vi.fn(() => ({
      font: '',
      measureText: (text: string) => ({ width: text.length * 7 }),
    })),
  });

  Object.defineProperty(SVGElement.prototype, 'getBBox', {
    writable: true,
    value: vi.fn(() => ({
      x: 0,
      y: 0,
      width: 24,
      height: 12,
    })),
  });

  Object.defineProperty(SVGSVGElement.prototype, 'getScreenCTM', {
    writable: true,
    value: vi.fn(() => ({
      inverse() {
        return this;
      },
    })),
  });

  Object.defineProperty(SVGSVGElement.prototype, 'createSVGPoint', {
    writable: true,
    value: vi.fn(() => ({
      x: 0,
      y: 0,
      matrixTransform() {
        return { x: this.x, y: this.y };
      },
    })),
  });

  Object.defineProperty(URL, 'createObjectURL', {
    writable: true,
    value: vi.fn(() => 'blob:mock'),
  });

  Object.defineProperty(URL, 'revokeObjectURL', {
    writable: true,
    value: vi.fn(),
  });

  Object.defineProperty(HTMLAnchorElement.prototype, 'click', {
    writable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.clearAllMocks();
});
