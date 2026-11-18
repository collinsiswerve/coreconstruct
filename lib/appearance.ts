import type { Brand } from './suite-types';

export function displayTheme(savedTheme: Brand['theme'] = 'site-ultra'): Brand['theme'] {
  if (typeof window === 'undefined') return savedTheme;
  const requested = new URLSearchParams(window.location.search).get('theme');
  return requested === 'site-ultra' ? 'site-ultra' : savedTheme;
}
