import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

Object.defineProperty(SVGElement.prototype, 'getBBox', {
  writable: true,
  value: () => ({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  }),
});

Object.defineProperty(SVGSVGElement.prototype, 'getScreenCTM', {
  writable: true,
  value: () => ({
    inverse: () => ({
      a: 1,
      b: 0,
      c: 0,
      d: 1,
      e: 0,
      f: 0,
    }),
  }),
});

Object.defineProperty(SVGSVGElement.prototype, 'createSVGPoint', {
  writable: true,
  value: () => ({
    x: 0,
    y: 0,
    matrixTransform(matrix: { e?: number; f?: number }) {
      return {
        x: this.x + (matrix.e ?? 0),
        y: this.y + (matrix.f ?? 0),
      };
    },
  }),
});
