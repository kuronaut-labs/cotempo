import { createRootRoute, HeadContent, Link, Outlet, Scripts } from '@tanstack/react-router'
import globalCss from '~/styles/global.css?url'
import uiCss from '~/styles/ui.css?url'
import printCss from '~/styles/print.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Timesheets' },
    ],
    links: [
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      {
        rel: 'stylesheet',
        href:
          'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap',
      },
      { rel: 'stylesheet', href: globalCss },
      { rel: 'stylesheet', href: uiCss },
      { rel: 'stylesheet', href: printCss },
    ],
  }),
  component: RootDocument,
  notFoundComponent: NotFound,
})

function NotFound() {
  return (
    <main className="app-shell">
      <p className="tree-empty">
        Page not found. <Link to="/today">Go to Today</Link>
      </p>
    </main>
  )
}

function RootDocument() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  )
}
