import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'CoreConstruct | Your site, in sync', description: 'Private construction operations: attendance, wagebills, expenses, approvals and weekly reporting.', robots: { index: false, follow: false }, manifest: '/manifest.webmanifest', icons: { icon: '/favicon.svg' } };
export default function Layout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }
