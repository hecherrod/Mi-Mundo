import React from 'react';
import { createRoot } from 'react-dom/client';
import Home from './app/page';
import Account from './app/cuenta/page';
import Management from './app/gestion/page';
import Access from './Access';
import './app/globals.css';

const view = new URLSearchParams(location.search).get('vista');
const pages: Record<string, React.ComponentType> = { cuenta: Account, gestion: Management, acceso: Access };
const Page = pages[view || ''] || Home;
createRoot(document.getElementById('app')!).render(<><div className="mi-mundo-nav"><a href="/">← Mi Mundo · Héctor Herrera</a><a href="/subasta/?vista=cuenta">Mi cuenta</a></div><Page /></>);
