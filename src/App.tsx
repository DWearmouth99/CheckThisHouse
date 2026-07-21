import { useEffect, useState } from 'react';
import MarketingSite from './MarketingSite';
import LabApp from './LabApp';
import TermsPage from './TermsPage';

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
  const isTerms =
    typeof window !== 'undefined' && window.location.pathname.replace(/\/+$/, '') === '/terms';
  if (isTerms) return <TermsPage />;
  return isLab ? <LabApp /> : <MarketingSite />;
}
