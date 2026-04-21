import { cookies } from 'next/headers'

export const STORE_PORTAL_COOKIE = 'tfs_store_code'

export async function getStorePortalCode() {
  return cookies().get(STORE_PORTAL_COOKIE)?.value?.trim().toUpperCase() || null
}

export async function setStorePortalCode(storeCode: string) {
  cookies().set(STORE_PORTAL_COOKIE, storeCode.trim().toUpperCase(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 12,
  })
}

export async function clearStorePortalCode() {
  cookies().delete(STORE_PORTAL_COOKIE)
}
