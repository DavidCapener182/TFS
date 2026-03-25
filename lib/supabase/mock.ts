type MockResult = {
  data: any
  error: null
  count: number
}

function createChain(): any {
  let chain: any
  const chainFn = (() => chain) as any
  chain = new Proxy(chainFn, {
    get(_target, prop) {
      if (prop === 'then') return undefined
      if (prop === 'single' || prop === 'maybeSingle') {
        return async () => ({ data: null, error: null })
      }
      return (..._args: any[]) => chain
    },
    apply() {
      return chain
    },
  })
  return chain
}

export function createMockSupabaseClient(): any {
  return {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      getUser: async () => ({ data: { user: null }, error: null }),
      signInWithPassword: async () => ({ data: null, error: null }),
      signOut: async () => ({ error: null }),
    },
    from: (_table: string) => createChain(),
    rpc: async (_fn: string, _args?: Record<string, unknown>): Promise<MockResult> => ({
      data: null,
      error: null,
      count: 0,
    }),
    storage: {
      from: (_bucket: string) => ({
        upload: async () => ({ data: null, error: null }),
        remove: async () => ({ data: null, error: null }),
        getPublicUrl: (_path: string) => ({ data: { publicUrl: '' } }),
      }),
    },
  }
}
