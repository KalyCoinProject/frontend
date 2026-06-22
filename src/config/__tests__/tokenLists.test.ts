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
