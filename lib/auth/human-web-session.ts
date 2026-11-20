import { NextResponse } from 'next/server'
import type { Identity } from './identity'

/**
 * True when the caller authenticated with a browser session rather than an
 * API key. `'clerk'` is the historical name of the browser-session source.
 *
 * This keeps API keys (agents, the CLI, scripts) out of human-only actions.
 * It does not stop an agent that can drive the member's own browser.
 */
export function isHumanWebSession(identity: Pick<Identity, 'source'>): boolean {
  return identity.source === 'clerk'
}

/**
 * Guard for routes only a human may call from the web app. Returns the 403
 * the route should send back, or null when the caller is a browser session.
 */
export function requireHumanWebSession(
  identity: Pick<Identity, 'source'>,
  message: string
): NextResponse | null {
  if (isHumanWebSession(identity)) return null
  return NextResponse.json({ error: message }, { status: 403 })
}
