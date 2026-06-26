'use client';

import dynamic from 'next/dynamic';

const SwaggerUI = dynamic(() => import('./SwaggerUIClient'), { ssr: false });

export default function ApiDocsPage() {
  return (
    <div style={{ maxWidth: '100%' }}>
      <SwaggerUI />
    </div>
  );
}
