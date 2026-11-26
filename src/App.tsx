import { useEffect, useState } from 'react';
import { useStore } from './document/store';
import { Home } from './ui/Home';
import { Workspace } from './ui/Workspace';
import { PrintScreen } from './ui/print/PrintScreen';
import { UiLayer } from './ui/common';

export type Route = { name: 'home' } | { name: 'project'; id: string } | { name: 'print'; id: string };

function parseHash(): Route {
  const h = window.location.hash.replace(/^#\/?/, '');
  const m = h.match(/^p\/([^/]+)(\/print)?$/);
  if (m) return m[2] ? { name: 'print', id: m[1] } : { name: 'project', id: m[1] };
  return { name: 'home' };
}

export const navigate = (r: Route) => {
  window.location.hash = r.name === 'home' ? '#/' : r.name === 'project' ? `#/p/${r.id}` : `#/p/${r.id}/print`;
};

export default function App() {
  const [route, setRoute] = useState<Route>(parseHash);
  const loaded = useStore((s) => s.loaded);
  const init = useStore((s) => s.init);

  useEffect(() => {
    init();
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [init]);

  if (!loaded) return <div className="app" style={{ display: 'grid', placeItems: 'center' }}>טוען…</div>;

  return (
    <div className="app">
      {route.name === 'home' && <Home />}
      {route.name === 'project' && <Workspace id={route.id} />}
      {route.name === 'print' && <PrintScreen id={route.id} />}
      <UiLayer />
    </div>
  );
}
