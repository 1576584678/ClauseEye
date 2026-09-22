import { useEffect, useState } from 'react'

export type Route =
  | { name: 'vault' }
  | { name: 'doc'; id: string }
  | { name: 'offers' }
  | { name: 'reminders' }
  | { name: 'settings' }

/** 安全解码 hash 片段：非法百分号编码（如 #/doc/%zz）不应让路由解析崩溃 */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export function parseHash(hash: string): Route {
  const clean = hash.replace(/^#\/?/, '')
  const [head, tail] = clean.split('/')
  switch (head) {
    case 'doc':
      return tail ? { name: 'doc', id: safeDecode(tail) } : { name: 'vault' }
    case 'offers':
      return { name: 'offers' }
    case 'reminders':
      return { name: 'reminders' }
    case 'settings':
      return { name: 'settings' }
    default:
      return { name: 'vault' }
  }
}

export function routeToHash(route: Route): string {
  switch (route.name) {
    case 'doc':
      return `#/doc/${encodeURIComponent(route.id)}`
    case 'offers':
      return '#/offers'
    case 'reminders':
      return '#/reminders'
    case 'settings':
      return '#/settings'
    default:
      return '#/vault'
  }
}

export function navigate(route: Route): void {
  window.location.hash = routeToHash(route)
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}
