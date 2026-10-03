import { useEffect, useState } from 'react';
import { DEFAULT_CLAUDE_MODELS } from '@/lib/claudeModels';

export interface ClaudeModelInfo {
  id: string;
  name: string;
}

// Modèles Claude réels du compte (via la clé API) ; repli sur la liste par défaut
export function useClaudeModels(apiKey: string | null, apiUrl: string, enabled: boolean = true) {
  const [models, setModels] = useState<ClaudeModelInfo[]>(DEFAULT_CLAUDE_MODELS);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!enabled || !apiKey) return;
    let cancelled = false;
    setLoading(true);
    fetch('/api/claude/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, apiUrl }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
        if (data.models.length > 0) setModels(data.models);
        setFetched(true);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setModels(DEFAULT_CLAUDE_MODELS);
        setFetched(false);
        setError(e.message);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [apiKey, apiUrl, enabled, reloadKey]);

  return { models, error, loading, fetched, reload: () => setReloadKey((k) => k + 1) };
}
