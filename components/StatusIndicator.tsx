'use client';

import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/utils';

export function StatusIndicator() {
  const { isClaudeProcessing, shouldFlash, provider, selectedModel } = useAppStore();
  
  // Déterminer le nom du modèle selon le provider
  const getModelName = () => {
    if (provider === 'ollama') {
      // Nom lisible : identifiant du modèle sans le tag (ex: qwen3.5:2b -> qwen3.5)
      return selectedModel.split(':')[0] || 'Ollama';
    }
    return 'Claude';
  };
  
  const modelName = getModelName();

  return (
    <div className={cn(
      'fixed bottom-4 left-4 z-50 flex items-center gap-3 px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-full shadow-lg transition-all',
      shouldFlash && 'animate-flash'
    )}>
      <div className="relative flex items-center gap-2">
        <div
          className={cn(
            'w-3 h-3 rounded-full transition-all',
            isClaudeProcessing
              ? 'bg-yellow-500 animate-pulse'
              : 'bg-green-500 animate-pulse-green'
          )}
        />
        <span className="text-sm font-medium text-white">
          {isClaudeProcessing ? `${modelName} travaille...` : 'Prêt'}
        </span>
      </div>
    </div>
  );
}
