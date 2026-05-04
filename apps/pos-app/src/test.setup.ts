import "@testing-library/jest-dom/vitest";

globalThis.ResizeObserver = class ResizeObserver {
	callback: ResizeObserverCallback;
	constructor(callback: ResizeObserverCallback) {
		this.callback = callback;
	}
	disconnect() {}
	observe() {}
	unobserve() {}
};
