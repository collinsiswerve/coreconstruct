const CACHE='coreconstruct-shell-v2';
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(['/favicon.svg','/manifest.webmanifest'])));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('coreconstruct-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{const request=event.request,url=new URL(request.url);if(request.method!=='GET'||url.origin!==self.location.origin)return;
 // Never cache records, private documents, client portals or authentication responses.
 if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/portal/')||url.pathname.startsWith('/client/')||url.pathname.startsWith('/receipts/')||url.pathname.startsWith('/signin')||url.pathname.startsWith('/signout')||url.pathname.startsWith('/callback')||url.pathname.startsWith('/join/'))return;
 if(request.mode==='navigate'&&url.pathname==='/'){event.respondWith(fetch(request).then(response=>{if(response.ok&&!response.redirected){const copy=response.clone();void caches.open(CACHE).then(cache=>cache.put('/',copy));}return response;}).catch(async()=>await caches.match('/')||new Response('Open CoreConstruct online once before using offline drafts.',{status:503,headers:{'Content-Type':'text/plain'}})));return;}
 if(url.pathname.startsWith('/assets/')||url.pathname.startsWith('/_next/')||['/favicon.svg','/manifest.webmanifest'].includes(url.pathname)){event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{if(response.ok){const copy=response.clone();void caches.open(CACHE).then(cache=>cache.put(request,copy));}return response;})));}
});
