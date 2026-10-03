import { useEffect, useState } from 'react';

export interface OllamaModelInfo {
  id: string;
  size: number;
  parameterSize: string;
  thinking: boolean;
}

// Récupère la liste réelle des modèles du serveur Ollama configuré
export function useOllamaModels(ollamaUrl: string, enabled: boolean = true) {
  const [models, setModels] = useState<OllamaModelInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!enabled || !ollamaUrl) return;
    let cancelled = false;
    setLoading(true);
    fetch('/api/ollama/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ollamaUrl }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
        setModels(data.models);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setModels([]);
        setError(e.message);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [ollamaUrl, enabled, reloadKey]);

  return { models, error, loading, reload: () => setReloadKey((k) => k + 1) };
}
