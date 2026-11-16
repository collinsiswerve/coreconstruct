export const privatePilotOrigin = 'https://coreconstruct-pilot-cis.aiarchihub.chatgpt.site';
export const loginPath = '/login';

const applicationOrigin = 'https://coreconstruct.invalid';
const linkPath = /^\/(?:join|portal)\/[a-f0-9]{64}$/i;
const recordPath = /^\/(?:client|receipts)\/(?:[a-zA-Z0-9:_-]|%3[Aa]){1,160}$/;

export function workspaceReturnPath(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048 || !value.startsWith('/') ||
    value.startsWith('//') || /[\\\u0000-\u0020\u007f]/.test(value)) return '/';
  const url = new URL(value, applicationOrigin);
  const path = url.pathname;
  if (url.origin !== applicationOrigin || (path !== '/' && path !== loginPath &&
    !linkPath.test(path) && !recordPath.test(path))) return '/';
  const parameters = new URLSearchParams();
  const org = url.searchParams.get('org');
  const view = url.searchParams.get('view');
  if (recordPath.test(path) && org && /^[a-zA-Z0-9_-]{1,160}$/.test(org)) parameters.set('org', org);
  if (path === '/' && view && /^[a-z-]{1,40}$/.test(view)) parameters.set('view', view);
  return path + (parameters.size ? '?' + parameters.toString() : '');
}

export function loginPagePath(returnTo = '/') {
  const next = workspaceReturnPath(returnTo);
  return next === '/' || next === loginPath ? loginPath : loginPath + '?next=' + encodeURIComponent(next);
}

export function chatGPTSignInPath(returnTo = '/') {
  return '/signin-with-chatgpt?return_to=' + encodeURIComponent(workspaceReturnPath(returnTo));
}

export function chatGPTSignOutPath(returnTo = loginPath) {
  return '/signout-with-chatgpt?return_to=' + encodeURIComponent(workspaceReturnPath(returnTo));
}
