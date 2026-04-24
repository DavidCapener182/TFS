/**
 * Shared auth / store-login surfaces.
 * Keep this fully opaque so the card never blends into the shell gradient.
 */
export const AUTH_CARD_CLASS =
  'w-full overflow-hidden rounded-[30px] border border-slate-200/95 bg-white text-slate-900 shadow-[0_20px_44px_hsl(var(--shell)/0.26),0_2px_10px_hsl(var(--shell)/0.08)] sm:rounded-[32px]'

/** Links on light auth cards (high contrast vs default primary on dark UI). */
export const AUTH_LINK_CLASS =
  'font-semibold text-[hsl(var(--brand))] underline-offset-2 hover:underline'
