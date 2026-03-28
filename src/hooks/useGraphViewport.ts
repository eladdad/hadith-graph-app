import {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 2.8;

interface PanState {
  startClientX: number;
  startClientY: number;
  startScrollLeft: number;
  startScrollTop: number;
}

interface ViewportState {
  zoom: number;
  scrollLeft: number;
  scrollTop: number;
}

interface UseGraphViewportParams {
  graphWidth: number;
  graphHeight: number;
}

interface UseGraphViewportResult {
  zoom: number;
  isPanning: boolean;
  svgRef: RefObject<SVGSVGElement | null>;
  graphScrollRef: RefObject<HTMLDivElement | null>;
  clientPointToSvg: (clientX: number, clientY: number) => { x: number; y: number } | null;
  handleGraphPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  handleGraphContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void;
}

export function useGraphViewport({
  graphWidth,
  graphHeight,
}: UseGraphViewportParams): UseGraphViewportResult {
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const graphScrollRef = useRef<HTMLDivElement>(null);
  const panStateRef = useRef<PanState | null>(null);
  const viewportRef = useRef<ViewportState>({ zoom: 1, scrollLeft: 0, scrollTop: 0 });
  const pendingZoomViewportRef = useRef<ViewportState | null>(null);

  useEffect(() => {
    if (!isPanning) {
      return undefined;
    }

    const handlePointerMove = (event: PointerEvent): void => {
      const panState = panStateRef.current;
      const scrollContainer = graphScrollRef.current;
      if (!panState || !scrollContainer) {
        return;
      }

      const deltaX = event.clientX - panState.startClientX;
      const deltaY = event.clientY - panState.startClientY;

      scrollContainer.scrollLeft = panState.startScrollLeft - deltaX;
      scrollContainer.scrollTop = panState.startScrollTop - deltaY;
      viewportRef.current = {
        zoom: viewportRef.current.zoom,
        scrollLeft: scrollContainer.scrollLeft,
        scrollTop: scrollContainer.scrollTop,
      };
    };

    const finishPan = (): void => {
      panStateRef.current = null;
      setIsPanning(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', finishPan);
    window.addEventListener('pointercancel', finishPan);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', finishPan);
      window.removeEventListener('pointercancel', finishPan);
    };
  }, [isPanning]);

  useLayoutEffect(() => {
    const scrollContainer = graphScrollRef.current;
    if (!scrollContainer) {
      return;
    }

    const pendingViewport = pendingZoomViewportRef.current;
    if (pendingViewport && Math.abs(pendingViewport.zoom - zoom) < 0.0001) {
      scrollContainer.scrollLeft = pendingViewport.scrollLeft;
      scrollContainer.scrollTop = pendingViewport.scrollTop;
      viewportRef.current = pendingViewport;
      pendingZoomViewportRef.current = null;
      return;
    }

    viewportRef.current = {
      zoom,
      scrollLeft: scrollContainer.scrollLeft,
      scrollTop: scrollContainer.scrollTop,
    };
  }, [graphHeight, graphWidth, zoom]);

  const clientPointToSvg = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
    const svg = svgRef.current;
    if (!svg) {
      return null;
    }

    const ctm = svg.getScreenCTM();
    if (!ctm) {
      return null;
    }

    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const transformed = point.matrixTransform(ctm.inverse());
    return { x: transformed.x, y: transformed.y };
  }, []);

  const handleGraphPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 1 && event.button !== 2) {
      return;
    }

    const scrollContainer = graphScrollRef.current;
    if (!scrollContainer) {
      return;
    }

    panStateRef.current = {
      startClientX: event.clientX,
      startClientY: event.clientY,
      startScrollLeft: scrollContainer.scrollLeft,
      startScrollTop: scrollContainer.scrollTop,
    };

    setIsPanning(true);
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handleGraphWheel = useCallback((event: WheelEvent): void => {
    const scrollContainer = graphScrollRef.current;
    if (!scrollContainer) {
      return;
    }

    const deltaMultiplier = event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? 16
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? scrollContainer.clientHeight
        : 1;

    if (!event.ctrlKey) {
      event.preventDefault();
      event.stopPropagation();
      scrollContainer.scrollLeft += event.deltaX * deltaMultiplier;
      scrollContainer.scrollTop += event.deltaY * deltaMultiplier;
      viewportRef.current = {
        zoom: viewportRef.current.zoom,
        scrollLeft: scrollContainer.scrollLeft,
        scrollTop: scrollContainer.scrollTop,
      };
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const rect = scrollContainer.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const currentViewport = pendingZoomViewportRef.current ?? viewportRef.current;
    const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, currentViewport.zoom * Math.exp(-event.deltaY * 0.0015)));
    if (Math.abs(nextZoom - currentViewport.zoom) < 0.0001) {
      return;
    }

    const graphX = (currentViewport.scrollLeft + pointerX) / currentViewport.zoom;
    const graphY = (currentViewport.scrollTop + pointerY) / currentViewport.zoom;
    const nextViewport: ViewportState = {
      zoom: nextZoom,
      scrollLeft: graphX * nextZoom - pointerX,
      scrollTop: graphY * nextZoom - pointerY,
    };

    pendingZoomViewportRef.current = nextViewport;
    viewportRef.current = nextViewport;
    setZoom(nextZoom);
  }, []);

  useEffect(() => {
    const scrollContainer = graphScrollRef.current;
    if (!scrollContainer) {
      return undefined;
    }

    scrollContainer.addEventListener('wheel', handleGraphWheel, { passive: false });

    return () => {
      scrollContainer.removeEventListener('wheel', handleGraphWheel);
    };
  }, [handleGraphWheel]);

  const handleGraphContextMenu = useCallback((event: ReactMouseEvent<HTMLDivElement>): void => {
    event.preventDefault();
  }, []);

  return {
    zoom,
    isPanning,
    svgRef,
    graphScrollRef,
    clientPointToSvg,
    handleGraphPointerDown,
    handleGraphContextMenu,
  };
}
