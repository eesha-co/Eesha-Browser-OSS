/**
 * PricingPlaceholder — the route at /pricing.
 *
 * In the open-source build this renders a minimal heading + slot div. It
 * exists so that:
 *  1. Private overlays can portal-inject a real PricingPage into the slot
 *     (data-velxio-slot="pricing-page") without forking this file.
 *  2. Self-hosters who navigate to /pricing get a polite "this image
 *     doesn't sell anything" page rather than a 404.
 *
 * The route is registered in App.tsx. The slot pattern is the same as
 * data-velxio-slot="user-menu" / "admin-tabs" / "admin-tab-content".
 */

import { useEffect } from 'react';
import { AppHeader } from '../components/layout/AppHeader';

export const PricingPlaceholder = () => {
  useEffect(() => {
    document.title = 'Pricing — Eesha Learn';
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#1e1e1e', color: '#e8e8e8' }}>
      <AppHeader />
      <div data-velxio-slot="pricing-page">
        {/* Default content — only visible if no overlay is mounted (i.e.
            self-hosted OSS image without a private pricing overlay). */}
        <main
          style={{
            maxWidth: 720,
            margin: '60px auto',
            padding: '0 24px',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            lineHeight: 1.6,
          }}
        >
          <h1 style={{ marginTop: 0 }}>Pricing</h1>
          <p>
            This Eesha Learn instance is self-hosted from the open-source image —
            all features are free for everyone using it.
          </p>
          <p>
            The hosted version at{' '}
            <a
              href="https://learn.eesha.onrender.com"
              style={{ color: '#4fc3f7', textDecoration: 'none' }}
            >
              learn.eesha.onrender.com
            </a>{' '}
            offers an optional Pro tier that helps fund development.
          </p>
          <p style={{ color: '#888', fontSize: 13, marginTop: 32 }}>
            Source code is{' '}
            <a
              href="https://github.com/davidmonterocrespo24/velxio"
              style={{ color: '#888' }}
            >
              MIT-licensed on GitHub
            </a>
            .
          </p>
        </main>
      </div>
    </div>
  );
};

export default PricingPlaceholder;
