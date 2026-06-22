# Multichain Official Token Lists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the swap selector and in-app wallet "View Assets" show full official token lists per chain (PancakeSwap-extended on BSC, Camelot on Arbitrum, local on KalyChain), with a reliable offline fallback so selectors are never silently empty.

**Architecture:** One source of truth per chain via `useTokenLists(chainId)` → `tokenListService` → backend proxy (`/api/token-lists/[listId]`) → bundled per-chain array as fallback. KalyChain stays on its local list. Camelot's bare-array list is normalized to the Uniswap token-list shape so it passes schema validation. The in-app wallet panel is fed curated per-chain subsets.

**Tech Stack:** Next.js 15 / React 19 / TypeScript, vitest, thirdweb in-app wallet, Hyperlane (bridge, untouched).

## Global Constraints

- Indentation: **tabs**, language **TypeScript**, **single quotes** in TS/JS (per repo style).
- **Claude never runs `git add`/`commit`/`push`.** Each task ends with a verification checkpoint; the user reviews and commits.
- Frontend tests: `vitest`. Run a single file with `npx vitest run <path>`. Typecheck with `npx tsc --noEmit`.
- Frontend dev server is already wrapped with portless (`npm run dev` → `https://kalyswap.localhost`). Backend dev: `cd backend && npm install && npm run dev` → `https://api.kalyswap.localhost`.
- Do **not** touch the bridge token source (`config/bridge/*`) — bridging requires Hyperlane warp-routes.
- Do **not** delete the hardcoded per-chain arrays (`KALYCHAIN_TOKENS`/`BSC_TOKENS`/`ARBITRUM_TOKENS`) — they become the offline fallback.

---

## Out of scope (documented, not silently dropped)

- **DEX routing / Arbitrum "No liquidity".** Verified that `BaseDexService.getQuote` (`services/dex/BaseDexService.ts:128-137`) already accepts arbitrary tokens (comment: *"Removed token validation"*) and `getSwapRoute` (line 348) decides purely from on-chain `factory.getPair(...)`; `config.tokens` is used only for debug labels + locating the WETH hop. **On-chain probe (2026-06-22) proved Camelot V2 is healthy:** `factory.getPair(WETH,USDC)` → `0x54b26faf…` (pair exists), and `router.getAmountsOut(0.001 WETH→USDC)` returned `1.722532 USDC` (valid quote). So the Arbitrum "No liquidity" was a downstream symptom of the empty token list (backend off), **not** a routing bug — this plan should resolve it. **Residual (separate, optional):** `RPC_URLS_ALL[42161]` has a single public RPC (`arb1.arbitrum.io/rpc`, no fallback); add a backup Arbitrum RPC to avoid intermittent rate-limit failures surfacing as "No liquidity." Tracked as a follow-up, not in this plan.
- The "Change" token-list switcher UI (currently a GitHub link) — leave as-is.
- User-imported custom tokens by address — separate feature.

---

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `backend/src/pages/api/token-lists/[listId].ts` | Modify | Add `camelot-arbitrum` source; normalize bare-array lists to `{name,version,tokens}` |
| `backend/src/pages/api/token-lists/index.ts` | Modify | List `camelot-arbitrum` in the URL map + `availableLists` |
| `frontend/src/config/tokenLists.ts` | Modify | Add Camelot URL; point chain 42161 at it |
| `frontend/src/services/tokenListService.ts` | Modify | `normalizeToTokenList()` pure helper; call before validation |
| `frontend/src/hooks/useTokenLists.tsx` | Modify | BSC/Arbitrum offline fallback to bundled arrays; remove BUSD hack |
| `frontend/src/components/wallet/ConnectWallet.tsx` | Modify | Feed `supportedTokens` for BSC + Arbitrum (curated subsets) |
| `frontend/src/services/__tests__/tokenListService.test.ts` | Create | Unit tests for `normalizeToTokenList` |
| `frontend/src/config/__tests__/tokenLists.test.ts` | Create | Assert per-chain list-id wiring |

---

## Task 1: Normalize bare-array token lists (frontend service)

Camelot's `arbitrum-one.json` is a bare array, not a `{name,version,tokens}` object, so `validateTokenList` rejects it. Add a pure normalizer and call it before validation.

**Files:**
- Modify: `frontend/src/services/tokenListService.ts`
- Test: `frontend/src/services/__tests__/tokenListService.test.ts`

**Interfaces:**
- Produces: `export function normalizeToTokenList(raw: unknown): TokenList | null` — wraps a bare token array into a `TokenList`; passes a valid object through; returns `null` for unusable input.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/services/__tests__/tokenListService.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { normalizeToTokenList } from '@/services/tokenListService';

const TOKEN = { chainId: 42161, address: '0xabc', symbol: 'X', name: 'X Token', decimals: 18 };

describe('normalizeToTokenList', () => {
	it('wraps a bare array into a TokenList', () => {
		const result = normalizeToTokenList([TOKEN]);
		expect(result).not.toBeNull();
		expect(Array.isArray(result!.tokens)).toBe(true);
		expect(result!.tokens).toHaveLength(1);
		expect(result!.version).toEqual({ major: 1, minor: 0, patch: 0 });
		expect(typeof result!.name).toBe('string');
	});

	it('passes a valid token-list object through unchanged', () => {
		const obj = { name: 'L', version: { major: 2, minor: 1, patch: 0 }, tokens: [TOKEN] } as any;
		expect(normalizeToTokenList(obj)).toBe(obj);
	});

	it('returns null for unusable input', () => {
		expect(normalizeToTokenList(null)).toBeNull();
		expect(normalizeToTokenList({ foo: 'bar' })).toBeNull();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/services/__tests__/tokenListService.test.ts`
Expected: FAIL — `normalizeToTokenList is not a function` / not exported.

- [ ] **Step 3: Add the normalizer and call it in `fetchTokenList`**

In `frontend/src/services/tokenListService.ts`, add this exported function near the top (after the `TokenList` interface, before the class):

```ts
/**
 * Normalize an upstream token list into the Uniswap TokenList shape.
 * Some official sources (e.g. Camelot's arbitrum-one.json) publish a bare
 * array of tokens rather than a wrapped { name, version, tokens } object.
 */
export function normalizeToTokenList(raw: unknown): TokenList | null {
	if (Array.isArray(raw)) {
		return {
			name: 'Imported List',
			version: { major: 1, minor: 0, patch: 0 },
			timestamp: new Date(0).toISOString(),
			logoURI: '',
			keywords: [],
			tokens: raw as Token[],
		};
	}
	if (raw && typeof raw === 'object' && Array.isArray((raw as TokenList).tokens)) {
		return raw as TokenList;
	}
	return null;
}
```

Then in `fetchTokenList`, normalize the fetched value before validating. Change the block that currently reads:

```ts
			const tokenList = await fetchJSON<TokenList>(apiUrl, {
				timeout: this.REQUEST_TIMEOUT,
				retries: this.MAX_RETRIES,
				headers: {
					'Accept': 'application/json',
					'User-Agent': 'KalySwap/1.0'
				}
			});

			// Validate token list schema
			if (this.validateTokenList(tokenList)) {
```

to:

```ts
			const raw = await fetchJSON<unknown>(apiUrl, {
				timeout: this.REQUEST_TIMEOUT,
				retries: this.MAX_RETRIES,
				headers: {
					'Accept': 'application/json',
					'User-Agent': 'KalySwap/1.0'
				}
			});

			const tokenList = normalizeToTokenList(raw);

			// Validate token list schema
			if (tokenList && this.validateTokenList(tokenList)) {
```

(The `else`/`catch` branches already return `null`; leave them.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/services/__tests__/tokenListService.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck checkpoint**

Run: `cd frontend && npx tsc --noEmit`
Expected: exit 0. Stop for user review/commit.

---

## Task 2: Point Arbitrum at Camelot (frontend config)

**Files:**
- Modify: `frontend/src/config/tokenLists.ts`
- Test: `frontend/src/config/__tests__/tokenLists.test.ts`

**Interfaces:**
- Consumes: `TOKEN_LIST_CONFIGS` (existing `Record<number, TokenListConfig[]>`).

- [ ] **Step 1: Write the failing test**

Create `frontend/src/config/__tests__/tokenLists.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { TOKEN_LIST_CONFIGS, TOKEN_LIST_URLS } from '@/config/tokenLists';

describe('token list wiring', () => {
	it('BSC (56) uses PancakeSwap extended', () => {
		const urls = TOKEN_LIST_CONFIGS[56].filter(c => c.enabled).map(c => c.url);
		expect(urls).toContain(TOKEN_LIST_URLS.PANCAKESWAP_EXTENDED);
	});

	it('Arbitrum (42161) uses Camelot, not Uniswap', () => {
		const urls = TOKEN_LIST_CONFIGS[42161].filter(c => c.enabled).map(c => c.url);
		expect(urls).toContain('/api/token-lists/camelot-arbitrum');
		expect(urls).not.toContain(TOKEN_LIST_URLS.UNISWAP_DEFAULT);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/config/__tests__/tokenLists.test.ts`
Expected: FAIL — Arbitrum still points at `uniswap-default`.

- [ ] **Step 3: Update the config**

In `frontend/src/config/tokenLists.ts`, add the Camelot URL to `TOKEN_LIST_URLS`:

```ts
	// External token lists (via backend proxy)
	PANCAKESWAP_EXTENDED: '/api/token-lists/pancakeswap-extended',
	UNISWAP_DEFAULT: '/api/token-lists/uniswap-default',
	CAMELOT_ARBITRUM: '/api/token-lists/camelot-arbitrum',
```

Replace the Arbitrum block in `TOKEN_LIST_CONFIGS`:

```ts
	// Arbitrum (42161) - Use official Camelot token list
	42161: [
		{
			name: 'Camelot Arbitrum',
			url: TOKEN_LIST_URLS.CAMELOT_ARBITRUM,
			priority: 100,
			enabled: true
		}
	]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/config/__tests__/tokenLists.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck checkpoint**

Run: `cd frontend && npx tsc --noEmit`
Expected: exit 0. Stop for user review/commit.

---

## Task 3: Add Camelot source to backend proxy + accept bare arrays

The backend proxy fetches the upstream JSON and currently rejects anything without a `.tokens` array (`[listId].ts:103`). Add the Camelot source and wrap bare arrays so the API contract always returns a `{name,version,tokens}` object.

**Files:**
- Modify: `backend/src/pages/api/token-lists/[listId].ts`
- Modify: `backend/src/pages/api/token-lists/index.ts`

**Interfaces:**
- Produces: `GET /api/token-lists/camelot-arbitrum` → a token-list object with `tokens: Token[]` (300 Arbitrum tokens).

- [ ] **Step 1: Add the Camelot URL (both files)**

In **both** `[listId].ts` and `index.ts`, add to the `TOKEN_LIST_URLS` map:

```ts
	'kalyswap-default': 'https://raw.githubusercontent.com/KalyCoinProject/tokenlists/refs/heads/main/kalyswap.tokenlist.json',
	'pancakeswap-extended': 'https://tokens.pancakeswap.finance/pancakeswap-extended.json',
	'camelot-arbitrum': 'https://raw.githubusercontent.com/CamelotLabs/default-token-list/main/src/tokens/arbitrum-one.json',
```

In `index.ts`, add `'/api/token-lists/camelot-arbitrum'` to the `availableLists` example array near line 63-65.

- [ ] **Step 2: Wrap bare-array responses before validation**

In `[listId].ts`, replace:

```ts
		const tokenList = await response.json();

		// Validate basic structure
		if (!tokenList || !tokenList.tokens || !Array.isArray(tokenList.tokens)) {
			throw new Error('Invalid token list format');
		}
```

with:

```ts
		const fetched = await response.json();

		// Some official lists (e.g. Camelot) publish a bare array of tokens
		// instead of a wrapped { name, version, tokens } object. Normalize so
		// this endpoint always returns the Uniswap token-list shape.
		const tokenList = Array.isArray(fetched)
			? { name: listId, version: { major: 1, minor: 0, patch: 0 }, timestamp: new Date(0).toISOString(), tokens: fetched }
			: fetched;

		// Validate basic structure
		if (!tokenList || !tokenList.tokens || !Array.isArray(tokenList.tokens)) {
			throw new Error('Invalid token list format');
		}
```

- [ ] **Step 3: Run the backend and verify the endpoint**

Run:
```bash
cd backend && npm install && npm run dev   # first run installs deps
```
In another shell, once it reports ready:
```bash
curl -s https://api.kalyswap.localhost/api/token-lists/camelot-arbitrum \
 | python3 -c "import sys,json; d=json.load(sys.stdin); print('tokens:', len(d['tokens']), '| chains:', sorted(set(t['chainId'] for t in d['tokens'])))"
```
Expected: `tokens: 300 | chains: [42161]` (count may drift slightly as Camelot updates).

- [ ] **Step 4: Verify existing lists still work**

Run:
```bash
curl -s https://api.kalyswap.localhost/api/token-lists/pancakeswap-extended | python3 -c "import sys,json;print('bsc tokens:',len(json.load(sys.stdin)['tokens']))"
```
Expected: `bsc tokens: 943` (approx). Stop for user review/commit.

---

## Task 4: Offline fallback for BSC/Arbitrum + remove BUSD hack

When the remote list is empty or the fetch fails (e.g. backend down), fall back to the bundled per-chain array instead of an empty selector. Remove the ad-hoc BUSD insertion — the BSC fallback array already includes BUSD.

**Files:**
- Modify: `frontend/src/hooks/useTokenLists.tsx`

**Interfaces:**
- Consumes: `BSC_TOKENS`, `ARBITRUM_TOKENS` from `@/config/dex/tokens/*`; `tokenListService.getTokensForChain`.

- [ ] **Step 1: Add the bundled-array imports**

In `frontend/src/hooks/useTokenLists.tsx`, after the existing token imports (line 14-15), add:

```ts
import { BSC_TOKENS } from '@/config/dex/tokens/bsc';
import { ARBITRUM_TOKENS } from '@/config/dex/tokens/arbitrum';
```

- [ ] **Step 2: Add a bundled-fallback helper**

Above the `useTokenLists` hook (after the interfaces, ~line 44), add:

```ts
/**
 * Bundled per-chain token arrays used as an offline fallback when the remote
 * official list is unreachable or returns nothing. Keeps selectors populated.
 */
function getBundledTokens(chainId: number): Token[] {
	if (chainId === 56) return BSC_TOKENS.filter(t => t.chainId === 56);
	if (chainId === 42161) return ARBITRUM_TOKENS.filter(t => t.chainId === 42161);
	return [];
}
```

- [ ] **Step 3: Use the fallback and delete the BUSD hack**

Replace the `else` branch in `fetchTokens` (currently lines 281-300, the block starting `// For other chains, fetch from external sources`) with:

```ts
			} else {
				// For other chains, fetch the official remote list first.
				tokenListTokens = await tokenListService.getTokensForChain(chainId);

				// If the remote list is unreachable/empty (e.g. backend down),
				// fall back to the bundled curated array so the selector is
				// never silently empty.
				if (!tokenListTokens || tokenListTokens.length === 0) {
					const bundled = getBundledTokens(chainId);
					if (bundled.length > 0) {
						logger.warn(`Remote token list empty for chain ${chainId}; using ${bundled.length} bundled fallback tokens`);
						tokenListTokens = bundled;
					}
				}
			}
```

(This deletes the `if (chainId === 56) { ...BUSD... }` block — BUSD is in `BSC_TOKENS`.)

- [ ] **Step 4: Make the catch-branch fallback use bundled arrays too**

In the `catch (err)` block, replace the non-KalyChain fallback (currently `fallbackTokens = await tokenListService.getTokensForChain(chainId);`, ~line 325) with:

```ts
				} else {
					fallbackTokens = getBundledTokens(chainId);
					logger.warn(`Using ${fallbackTokens.length} bundled fallback tokens for chain ${chainId}`);
				}
```

- [ ] **Step 5: Typecheck + manual verify (backend OFF, to exercise fallback)**

Run: `cd frontend && npx tsc --noEmit` → exit 0.
With the backend **stopped**, open `https://kalyswap.localhost/swaps`, switch to BSC, open "Select From Token".
Expected: the selector shows the bundled BSC tokens (incl. BNB, WBNB, USDT, USDC, BUSD, DAI…) instead of just BNB+BUSD. Console shows the "bundled fallback" warning. Stop for user review/commit.

---

## Task 5: Feed in-app wallet "View Assets" per-chain tokens

`ConnectWallet.tsx` only supplies KalyChain tokens to thirdweb's `supportedTokens`, so BSC/Arbitrum assets show only auto-detected dust. Supply curated subsets for all three chains.

**Files:**
- Modify: `frontend/src/components/wallet/ConnectWallet.tsx`

- [ ] **Step 1: Import the bundled arrays**

After line 11 (`import { KALYCHAIN_TOKENS } ...`), add:

```ts
import { BSC_TOKENS } from '@/config/dex/tokens/bsc'
import { ARBITRUM_TOKENS } from '@/config/dex/tokens/arbitrum'
```

- [ ] **Step 2: Build supportedTokens for all three chains**

Replace the `supportedTokens` definition (lines 20-29) with:

```ts
// Build supported tokens map for Thirdweb's wallet detail panel "Assets" view.
// thirdweb's supportedTokens is a static Record<chainId, Token[]>; we feed a
// curated per-chain subset (the bundled arrays) — not the full 943-token
// remote lists, which would bloat the panel.
const toThirdwebTokens = (tokens: typeof KALYCHAIN_TOKENS, chainId: number) =>
	tokens
		.filter(t => t.chainId === chainId && !t.isNative)
		.map(t => ({ address: t.address, name: t.name, symbol: t.symbol, icon: t.logoURI || undefined }))

const supportedTokens: Record<number, Array<{ address: string; name: string; symbol: string; icon?: string }>> = {
	[CHAIN_IDS.KALYCHAIN]: toThirdwebTokens(KALYCHAIN_TOKENS, CHAIN_IDS.KALYCHAIN),
	[CHAIN_IDS.BSC]: toThirdwebTokens(BSC_TOKENS, CHAIN_IDS.BSC),
	[CHAIN_IDS.ARBITRUM]: toThirdwebTokens(ARBITRUM_TOKENS, CHAIN_IDS.ARBITRUM),
}
```

- [ ] **Step 3: Typecheck + manual verify**

Run: `cd frontend && npx tsc --noEmit` → exit 0.
With wallet connected on BSC, open the in-app wallet → "View Assets".
Expected: major BSC tokens (WBNB, USDT, USDC, BUSD, DAI, CAKE…) appear, not just BNB/WBNB/BUSD. Stop for user review/commit.

---

## Task 6: Full integration verification (backend running)

- [ ] **Step 1: Start both servers**

```bash
cd backend && npm run dev    # api.kalyswap.localhost
cd frontend && npm run dev   # kalyswap.localhost
```

- [ ] **Step 2: Verify each surface**

Open `https://kalyswap.localhost/swaps` and confirm:
- BSC: "Select From Token" lists hundreds of tokens including **DAI**, USDC, USDT, ETH, CAKE.
- Arbitrum: lists Camelot tokens including **GRAIL, ARB, DAI, USDC, USDC.e, WETH**.
- KalyChain: unchanged (12 curated tokens).
- In-app wallet "View Assets" on each chain shows that chain's majors.
- Stop the backend, reload, switch to BSC: selector still populated from the bundled fallback (no empty list), console shows the fallback warning.

- [ ] **Step 3: Run the full frontend test suite**

Run: `cd frontend && npm test`
Expected: all pass (includes the two new test files). Stop for user review/commit.

---

## Self-review notes

- **Spec coverage:** Arbitrum→Camelot (Tasks 2-3), BSC extended kept (Task 2 test asserts it), KalyChain unchanged (no task touches its path), bare-array normalization (Tasks 1, 3), offline fallback + BUSD-hack removal (Task 4), in-app assets all chains (Task 5), bridge untouched (no task). Routing reconciliation intentionally out-of-scope with rationale (see top).
- **No placeholders:** every code step shows full code; commands have expected output.
- **Type consistency:** `normalizeToTokenList` returns `TokenList | null`, used in `fetchTokenList`; `getBundledTokens(chainId)` returns `Token[]`, used in both branches of `useTokenLists`.
