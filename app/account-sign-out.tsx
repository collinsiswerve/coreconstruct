'use client';

import type { ReactNode } from 'react';
import { chatGPTSignOutPath } from '../lib/auth-navigation';

export function AccountSignOut({ children, returnTo, className, label }: {
  children: ReactNode;
  returnTo?: string;
  className?: string;
  label?: string;
}) {
  return <a className={className} aria-label={label} target="_top" href={chatGPTSignOutPath(returnTo)} onClick={() => {
    sessionStorage.removeItem('cc-field-session');
    localStorage.removeItem('cc-organization');
  }}>{children}</a>;
}
