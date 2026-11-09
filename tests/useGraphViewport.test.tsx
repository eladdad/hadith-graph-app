import { act, fireEvent, render, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useGraphViewport } from '../src/hooks/useGraphViewport';

function container(width = 1000, height = 600): HTMLDivElement {
  const node = document.createElement('div');
  Object.defineProperties(node, {
    clientWidth: { value: width },
    clientHeight: { value: height },
  });
  node.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width, height, right: width, bottom: height, toJSON: () => ({}) });
  return node;
}

describe('useGraphViewport navigation', () => {
  it('fits a corpus wider than the old zoom limit and uses the current graph dimensions', () => {
    const { result, rerender } = renderHook((size) => useGraphViewport(size), {
      initialProps: { graphWidth: 119000, graphHeight: 3680 },
    });
    const scroll = container();
    result.current.graphScrollRef.current = scroll;
    scroll.scrollLeft = 4000;
    scroll.scrollTop = 700;

    act(() => result.current.fitGraph());
    expect(result.current.zoom).toBeCloseTo(952 / 119000);
    expect(scroll.scrollLeft).toBe(0);
    expect(scroll.scrollTop).toBe(0);

    rerender({ graphWidth: 800, graphHeight: 400 });
    act(() => result.current.fitGraph());
    expect(result.current.zoom).toBe(1);
  });

  it('centers a newly focused narrator at a requested zoom and can move again without changing zoom', () => {
    const { result } = renderHook(() => useGraphViewport({ graphWidth: 10000, graphHeight: 5000 }));
    const scroll = container();
    result.current.graphScrollRef.current = scroll;

    act(() => result.current.centerOnNode({ x: 4000, y: 1600 }, 0.75));
    expect(result.current.zoom).toBe(0.75);
    expect(scroll.scrollLeft).toBe(2500);
    expect(scroll.scrollTop).toBe(900);

    act(() => result.current.centerOnNode({ x: 2000, y: 1000 }));
    expect(result.current.zoom).toBe(0.75);
    expect(scroll.scrollLeft).toBe(1000);
    expect(scroll.scrollTop).toBe(450);
    act(() => result.current.centerOnNode({ x: 20, y: 20 }));
    expect(scroll.scrollLeft).toBe(0);
    expect(scroll.scrollTop).toBe(0);
  });

  it('keeps wheel zoom anchored on the pointed graph position after centering', () => {
    let viewport!: ReturnType<typeof useGraphViewport>;
    function Harness() {
      viewport = useGraphViewport({ graphWidth: 10000, graphHeight: 5000 });
      return <div ref={(node) => {
        viewport.graphScrollRef.current = node;
        if (node) {
          Object.defineProperties(node, {
            clientWidth: { value: 1000 },
            clientHeight: { value: 600 },
          });
          node.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 1000, height: 600, right: 1000, bottom: 600, toJSON: () => ({}) });
        }
      }} />;
    }
    render(<Harness />);
    const scroll = viewport.graphScrollRef.current!;
    act(() => viewport.centerOnNode({ x: 3000, y: 1400 }, 0.5));
    const anchorX = (scroll.scrollLeft + 200) / viewport.zoom;
    const anchorY = (scroll.scrollTop + 150) / viewport.zoom;
    fireEvent.wheel(scroll, { ctrlKey: true, deltaY: -Math.log(2) / 0.0015, clientX: 200, clientY: 150 });
    expect(viewport.zoom).toBeCloseTo(1);
    expect((scroll.scrollLeft + 200) / viewport.zoom).toBeCloseTo(anchorX);
    expect((scroll.scrollTop + 150) / viewport.zoom).toBeCloseTo(anchorY);
  });
});
