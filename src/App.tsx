import { useEffect, useState } from 'react';
import MarketingSite from './MarketingSite';
import LabApp from './LabApp';
import TermsPage from './TermsPage';
import PrivacyPage from './PrivacyPage';

function useLabMode() {
  const [isLab, setIsLab] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.location.hash === '#lab' || new URLSearchParams(window.location.search).has('lab');
  });

  useEffect(() => {
    const sync = () => {
      setIsLab(
        window.location.hash === '#lab' || new URLSearchParams(window.location.search).has('lab')
      );
    };
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, []);

  return isLab;
}

/** Public marketing site by default. Internal analyzer: /#lab */
export default function App() {
  const isLab = useLabMode();
  const path =
    typeof window !== 'undefined' ? window.location.pathname.replace(/\/+$/, '') : '';
  if (path === '/terms') return <TermsPage />;
  if (path === '/privacy') return <PrivacyPage />;
  return isLab ? <LabApp /> : <MarketingSite />;
}
