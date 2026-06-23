# Design: Multichain Official Token Lists

**Date:** 2026-06-22
**Repo:** `KalySwapv3/frontend` (+ one backend proxy change in `KalySwapv3/backend`)
**Status:** Awaiting review

## Problem

Token selectors on the swap page, the in-app wallet "View Assets" panel, and (indirectly) the
quote/routing layer show far too few tokens for BSC and Arbitrum (e.g. DAI missing on BSC, only
ETH on Arbitrum). Past attempts leaned toward hardcoding per-chain token arrays, which is the wrong
direction — official, maintained token lists exist and should be the source of truth.

### What is actually true (verified live, 2026-06-22)

A remote token-list system **already exists** and works:

- `frontend/src/services/tokenListService.ts` fetches `/api/token-lists/[listId]`, validates the
  Uniswap token-list schema, caches 30 min, dedupes by priority.
- `backend/src/pages/api/token-lists/[listId].ts` proxies the upstream JSON (avoids CORS).
- `frontend/src/config/tokenLists.ts` maps each chain to a list id.
- `frontend/src/hooks/useTokenLists.tsx` is the swap UI's source of truth.

Verified upstream coverage:

| Chain | List id (current) | Tokens | DAI/USDC/USDT? |
|------|-------------------|--------|----------------|
| BSC 56 | `pancakeswap-extended` → `tokens.pancakeswap.finance/pancakeswap-extended.json` | **943** | ✅ |
| Arbitrum 42161 | `uniswap-default` → `tokens.uniswap.org` | 200 | ✅ but **wrong DEX** (generic Uniswap, not Camelot) |
| KalyChain 3888 | local hardcoded array | 12 | ✅ |

**The near-empty selectors observed locally are mostly environmental:** BSC/Arbitrum lists come from
the backend proxy, and the local backend was not running. KalyChain works locally because its list is
bundled. Production serves the BSC list correctly (943 tokens, confirmed).

### Genuine code gaps (the real work)

1. **Arbitrum points at the wrong list.** Generic Uniswap (200), not Camelot. Camelot is the actual
   DEX on Arbitrum (router `0xc873fEcbd354f5A56E00E710B90EF4201db2448d`).
2. **In-app wallet "View Assets"** (`ConnectWallet.tsx`) only feeds `supportedTokens` for KalyChain
   (built from `KALYCHAIN_TOKENS`). BSC/Arbitrum show only thirdweb's auto-detected dust.
3. **DEX routing uses separate hardcoded lists** (`BSC_TOKENS` / `ARBITRUM_TOKENS` inside
   `PANCAKESWAP_CONFIG` / `UNISWAP_V2_CONFIG`). The UI can show 943 tokens while the router "knows"
   15 — a likely cause of Arbitrum "No liquidity / Failed".
4. **No fallback when the proxy is unreachable** → selectors collapse to empty silently (the exact
   local failure mode).

## Decisions (approved)

- **Arbitrum → Camelot.** Source: `CamelotLabs/default-token-list` →
  `https://raw.githubusercontent.com/CamelotLabs/default-token-list/main/src/tokens/arbitrum-one.json`.
  Verified: **300 tokens**, all chainId 42161, includes DAI/USDC/USDC.e/USDT/WETH/ARB/wstETH/GRAIL.
  Note: this file is a **bare array**, not a wrapped token-list object — the proxy must wrap it.
- **BSC → `pancakeswap-extended` (943), confirmed.** Already wired; includes DAI and the long tail.
  The curated `pancakeswap-default` (13) is explicitly **not** used.
- **KalyChain → unchanged.** Keep the existing local 12-token array (`KALYCHAIN_TOKENS`) as the
  primary source, exactly as today. No remote list, no behavior change for chain 3888.
- **Hardcoded per-chain arrays stay as offline fallback** (remote primary). Not deleted.
- **Scope: all 3 surfaces + routing.** Swap selector, in-app "View Assets", and reconcile the routing
  layer to the dynamic list. Bridge stays on Hyperlane warp-routes (required for bridging) — unchanged.

## Architecture

Single source of truth per chain: `useTokenLists(chainId)`, backed by `tokenListService`, backed by
the backend proxy, with the bundled per-chain array as a guaranteed fallback. Every surface consumes
that one path.

KalyChain (3888) keeps using its bundled local list directly. BSC (56) and Arbitrum (42161) use the
remote-primary path below, with the bundled array as fallback.

```
upstream JSON (PancakeSwap extended / Camelot)        [BSC + Arbitrum only]
        │  (CORS-proxied, cached 30m, schema-normalized)
backend  /api/token-lists/[listId]
        │  (fetchJSON, cached 30m, schema-validated, priority-deduped)
frontend tokenListService.getTokensForChain(chainId)
        │  (remote primary  ──►  bundled array fallback on empty/error)
frontend useTokenLists(chainId)  ── single hook
        │  (KalyChain 3888: bundled local list, unchanged)
        ├── Swap "Select Token" modal (TokenSelectorModal)
        ├── In-app wallet "View Assets" (ConnectWallet supportedTokens)  [curated subset]
        └── DEX routing token resolution (DexService / per-DEX services)
```

### Components & changes

**1. Backend proxy — `backend/src/pages/api/token-lists/[listId].ts` (+ `index.ts`)**
- Add list id `camelot-arbitrum` →
  `https://raw.githubusercontent.com/CamelotLabs/default-token-list/main/src/tokens/arbitrum-one.json`.
- Add a **normalization step**: if the fetched JSON is a bare array, wrap it as
  `{ name, version: {major,minor,patch}, tokens: <array> }` before validating/returning, so array-shaped
  sources pass the frontend's Uniswap-schema validation. Object-shaped sources pass through unchanged.
- Keep the existing 30-min cache and CORS allow-list (add no new origins).

**2. Frontend list config — `frontend/src/config/tokenLists.ts`**
- Add `CAMELOT_ARBITRUM: '/api/token-lists/camelot-arbitrum'` to `TOKEN_LIST_URLS`.
- Repoint chain `42161` from `uniswap-default` to `camelot-arbitrum` (priority 100).
- Chain `3888` (KalyChain): **no change** — continues to use the bundled local list.

**3. Token-list resolution + fallback — `frontend/src/hooks/useTokenLists.tsx`**
- **KalyChain (3888) / testnet (3889): unchanged** — keep using the bundled local arrays directly.
- For **BSC (56) and Arbitrum (42161):** try `tokenListService.getTokensForChain(chainId)` first.
- If the remote result is empty or throws, fall back to the bundled array for that chain
  (`BSC_TOKENS` / `ARBITRUM_TOKENS`). Always include the native token.
- Remove the ad-hoc "manually add BUSD" hack — the BSC fallback array already covers it.
- Emit a visible `console.warn` on fallback (no more silent empty lists).

**4. In-app wallet assets — `frontend/src/components/wallet/ConnectWallet.tsx`**
- Build thirdweb `supportedTokens` for **all** supported chains (3888, 56, 42161), not just KalyChain.
- Use a **curated subset per chain** (the bundled fallback arrays — majors/stables), NOT the full 943,
  to keep the thirdweb panel light. thirdweb's `supportedTokens` is a static `Record<chainId, Token[]>`.

**5. DEX routing reconciliation — `frontend/src/services/dex/*` + `frontend/src/config/dex/*`**
- The quote/swap services must accept the from/to `Token` objects the UI passes (address + decimals)
  and route through the DEX's wrapped-native + common base tokens, rather than restricting to the
  hardcoded `DexConfig.tokens` set.
- Keep `DexConfig.tokens` only as the offline fallback / common-bases hint.
- **Verification required:** confirm `UniswapV2Service` (Camelot) and `PancakeSwapService` build
  multi-hop paths (token → WETH/WBNB → token) for tokens not in a direct pair. The Arbitrum
  "No liquidity" likely needs a base-token hop, not just a bigger list. This is the riskiest item and
  may surface a follow-up routing fix.

### Data flow on chain switch

`activeChainId` change → `useTokenLists` refetches → remote (or fallback) list returned → swap modal
re-renders. (This wiring already exists; we are fixing the *source*, not the refresh.)

### Error handling

| Failure | Behavior |
|--------|----------|
| Backend/proxy unreachable | Bundled per-chain fallback array; `console.warn` |
| Upstream 4xx/5xx | Proxy returns error; service falls back to bundled array |
| Schema invalid / unexpected shape | Proxy normalizes arrays; invalid → service falls back |
| Empty token array | Treated as failure → fallback |

### Testing

- **Unit (pure logic, fits existing vitest scope):**
  - Proxy/service normalization: bare array → wrapped list; object passes through.
  - `getTokensForChain` returns bundled fallback when remote is empty/throws.
  - `tokenLists.ts` maps 56→pancakeswap-extended, 42161→camelot-arbitrum; 3888 stays local.
- **Integration:** `useTokenLists` returns the native token + a populated list for each chain with
  remote mocked present, and the bundled fallback with remote mocked failing.
- **Manual:** with backend running, BSC selector shows DAI + hundreds; Arbitrum shows Camelot tokens
  (GRAIL, ARB, DAI, USDC.e); in-app "View Assets" shows majors on each chain; a BSC DAI↔USDT quote
  succeeds.

## Out of scope (YAGNI)

- The "Change" token-list switcher UI (currently a GitHub link) — leave as-is.
- Bridge token source — stays on Hyperlane warp-routes.
- User-imported custom tokens by address — separate feature.

## Open items / risks

- **Arbitrum routing**: bigger list alone may not fix "No liquidity"; a base-token multi-hop fix in
  `UniswapV2Service` may be needed (flagged in component 5).
- **thirdweb `supportedTokens` size**: use curated subsets to avoid bloating the wallet panel.
