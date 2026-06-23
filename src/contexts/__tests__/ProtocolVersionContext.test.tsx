// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import {
	ProtocolVersionProvider,
	useProtocolVersion,
	type ProtocolVersion,
} from '../ProtocolVersionContext';

const STORAGE_KEY = 'kalyswap_protocol_version';

/**
 * Test harness: exposes the context value through the DOM and a ref so tests
 * can both read state and invoke setProtocolVersion with options.
 */
let lastCtx: ReturnType<typeof useProtocolVersion> | null = null;

function Probe() {
	const ctx = useProtocolVersion();
	lastCtx = ctx;
	return (
		<div>
			<span data-testid="version">{ctx.protocolVersion}</span>
			<span data-testid="isV3">{String(ctx.isV3)}</span>
			<span data-testid="isV3Supported">{String(ctx.isV3Supported)}</span>
		</div>
	);
}

function renderProvider() {
	return render(
		<ProtocolVersionProvider>
			<Probe />
		</ProtocolVersionProvider>,
	);
}

async function waitForV3Support() {
	await waitFor(() => {
		expect(screen.getByTestId('isV3Supported').textContent).toBe('true');
	});
}

function setVersion(version: ProtocolVersion, options?: { persist?: boolean }) {
	act(() => {
		lastCtx!.setProtocolVersion(version, options);
	});
}

describe('ProtocolVersionContext persistence', () => {
	beforeEach(() => {
		localStorage.clear();
		lastCtx = null;
		vi.restoreAllMocks();
	});

	it('defaults to v2 with nothing stored', async () => {
		renderProvider();
		await waitForV3Support();
		expect(screen.getByTestId('version').textContent).toBe('v2');
		expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
	});

	it('persists an explicit user switch to v3 (toggle should survive reload)', async () => {
		renderProvider();
		await waitForV3Support();

		setVersion('v3');

		expect(screen.getByTestId('version').textContent).toBe('v3');
		expect(localStorage.getItem(STORAGE_KEY)).toBe('v3');
	});

	it('does NOT persist a migrate-style switch (persist: false) but still flips in memory', async () => {
		// Simulate a user whose real saved preference is v2.
		localStorage.setItem(STORAGE_KEY, 'v2');
		renderProvider();
		await waitForV3Support();
		expect(screen.getByTestId('version').textContent).toBe('v2');

		// Migrate page flips to v3 for the post-migration redirect, but must not
		// lock the user into v3 forever.
		setVersion('v3', { persist: false });

		// In-memory state flips so the redirect lands on the V3 positions view...
		expect(screen.getByTestId('version').textContent).toBe('v3');
		expect(screen.getByTestId('isV3').textContent).toBe('true');
		// ...but the saved preference is untouched, so next load reverts to v2.
		expect(localStorage.getItem(STORAGE_KEY)).toBe('v2');
	});

	it('reverts to the saved v2 preference on a fresh mount after a non-persisted switch', async () => {
		localStorage.setItem(STORAGE_KEY, 'v2');
		const { unmount } = renderProvider();
		await waitForV3Support();
		setVersion('v3', { persist: false });
		expect(screen.getByTestId('version').textContent).toBe('v3');
		unmount();

		// Fresh mount reads localStorage, which was never overwritten.
		renderProvider();
		await waitForV3Support();
		expect(screen.getByTestId('version').textContent).toBe('v2');
	});
});
