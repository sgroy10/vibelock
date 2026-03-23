import { create } from "zustand";

/** User-provided API keys and service connections */
interface SecretsState {
  // Supabase
  supabaseUrl: string;
  supabaseAnonKey: string;

  // API Keys
  openaiKey: string;
  stripeKey: string;
  customKeys: Record<string, string>;

  // Actions
  setSupabase: (url: string, key: string) => void;
  setOpenaiKey: (key: string) => void;
  setStripeKey: (key: string) => void;
  setCustomKey: (name: string, value: string) => void;
  removeCustomKey: (name: string) => void;
  getAllEnvVars: () => Record<string, string>;
}

export const useSecretsStore = create<SecretsState>((set, get) => ({
  supabaseUrl: "",
  supabaseAnonKey: "",
  openaiKey: "",
  stripeKey: "",
  customKeys: {},

  setSupabase: (url, key) => set({ supabaseUrl: url, supabaseAnonKey: key }),
  setOpenaiKey: (key) => set({ openaiKey: key }),
  setStripeKey: (key) => set({ stripeKey: key }),
  setCustomKey: (name, value) =>
    set((s) => ({ customKeys: { ...s.customKeys, [name]: value } })),
  removeCustomKey: (name) =>
    set((s) => {
      const { [name]: _, ...rest } = s.customKeys;
      return { customKeys: rest };
    }),

  /** Get all env vars to inject into WebContainer */
  getAllEnvVars: () => {
    const s = get();
    const vars: Record<string, string> = {};
    if (s.supabaseUrl) vars.VITE_SUPABASE_URL = s.supabaseUrl;
    if (s.supabaseAnonKey) vars.VITE_SUPABASE_ANON_KEY = s.supabaseAnonKey;
    if (s.openaiKey) vars.VITE_OPENAI_API_KEY = s.openaiKey;
    if (s.stripeKey) vars.VITE_STRIPE_PUBLIC_KEY = s.stripeKey;
    Object.entries(s.customKeys).forEach(([k, v]) => {
      vars[`VITE_${k.toUpperCase().replace(/\s+/g, "_")}`] = v;
    });
    return vars;
  },
}));
