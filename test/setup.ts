import { vi } from 'vitest';
import { LovelaceCard } from '../src/types';
// Mock ResizeObserver for the JSDOM environment
const ResizeObserverMock = vi.fn(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));
vi.stubGlobal('ResizeObserver', ResizeObserverMock);
// Mock for window.customCards
if (typeof window !== 'undefined') {
  window.customCards = [];
}

// Mock for Home Assistant helpers
interface TestWindow extends Window {
  loadCardHelpers: ReturnType<typeof vi.fn>;
}

const testWindow = window as unknown as TestWindow;
testWindow.loadCardHelpers = vi.fn().mockResolvedValue({
  createCardElement: vi.fn().mockResolvedValue({
    constructor: { getConfigElement: vi.fn().mockResolvedValue(undefined) },
  } as unknown as LovelaceCard),
});
