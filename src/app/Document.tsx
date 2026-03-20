import styles from "./styles.css?url";
import { Suspense } from 'react'
import { PreRenderHacks } from "@/app/components/scriptHacks/PreRenderHacks";

export function Document({ children }: { children: React.ReactNode }) {
  return (
  <html lang="en">
    <head>
      <PreRenderHacks />
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Qlave - The Collaboration App</title>
      <link rel="icon" type="image/png" href="/favicon.png"/>
      <link rel="modulepreload" href="/src/client.tsx" />
      <link rel="stylesheet" href={styles} />

      {/* Google Fonts - Arabian + Latin Fantasy */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />

      {/* Open Graph */}
      <meta property="og:title" content="Qlave - The Collaboration App" />
      <meta property="og:description" content="Real-time collaboration with live transcription." />
      <meta property="og:image" content="https://qlave.dev/og-image1.png" />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:type" content="website" />
      <meta property="og:url" content="https://qlave.dev" />

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content="Qlave - The Collaboration App" />
      <meta name="twitter:description" content="Real-time collaboration with live transcription." />
      <meta name="twitter:image" content="https://qlave.dev/og-image1.png" />
      
      <link href="https://fonts.googleapis.com/css2?family=Amiri:ital,wght@0,400;0,700;1,400&family=Scheherazade+New:wght@400;500;600;700&family=Trajan+Pro:wght@400;700&family=Cinzel:wght@400;600;700&display=swap" rel="stylesheet" />

      {/* Google Fonts - Dashboard UI */}
      <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      
    </head>
    <body>
      <Suspense fallback={<div>Loading...</div>}>
        <div id="root">{children}</div>
      </Suspense>
      <script type="module" src="/src/client.tsx"></script>
      <script 
        src="https://challenges.cloudflare.com/turnstile/v0/api.js" 
        async 
        defer
      />
    </body>
  </html>
  )
};