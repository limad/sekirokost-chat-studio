import { useState, useCallback } from 'react';
import { useAppStore } from '@/store/useAppStore';

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ClaudeResponse {
  content: string;
  tokens: {
    input: number;
    output: number;
  };
}

/**
 * Hook pour interagir avec l'API Claude/Ollama avec streaming
 */
export function useClaude() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { addMessage, updateMessage, updateSessionStatus, updateTokenUsage, apiKey, apiUrl, selectedModel, provider, ollamaUrl, ollamaThink, systemPrompt } = useAppStore();

  const sendMessage = useCallback(
    async (
      sessionId: string, 
      message: string, 
      history: ClaudeMessage[] = [],
      onChunk?: (chunk: string) => void
    ): Promise<ClaudeResponse | null> => {
      setIsLoading(true);
      setError(null);
      updateSessionStatus(sessionId, 'processing');
      
      let tempMessageId: string | null = null;

      try {
        // Mode simulation si pas d'API configurée
        if (provider === 'anthropic' && !apiKey) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          
          const mockResponse = `Voici une réponse simulée à : "${message}"\n\n⚙️ Pour activer l'API Claude réelle :\n1. Cliquez sur "Paramètres" dans la sidebar\n2. Obtenez une clé API sur console.anthropic.com\n3. Collez votre clé et testez la connexion\n4. Sauvegardez !`;
          
          const tokens = {
            input: Math.ceil(message.length / 4),
            output: Math.ceil(mockResponse.length / 4),
          };

          addMessage(sessionId, {
            role: 'assistant',
            content: mockResponse,
            tokenCount: tokens.output,
          });

          updateTokenUsage(sessionId, tokens);
          updateSessionStatus(sessionId, 'completed');

          setIsLoading(false);
          return { content: mockResponse, tokens };
        }

        // Créer un message assistant vide pour le streaming
        tempMessageId = `temp-${Date.now()}`;
        addMessage(sessionId, {
          id: tempMessageId,
          role: 'assistant',
          content: '',
          tokenCount: 0,
        });

        const endpoint = provider === 'ollama' ? '/api/ollama' : '/api/claude';
        const requestBody = provider === 'ollama' 
          ? {
              ollamaUrl,
              model: selectedModel,
              messages: [
                ...(systemPrompt?.trim() ? [{ role: 'system', content: systemPrompt.trim() }] : []),
                ...history,
                { role: 'user', content: message },
              ],
              stream: true,
              think: ollamaThink,
            }
          : {
              apiKey,
              apiUrl,
              model: selectedModel,
              messages: [...history, { role: 'user', content: message }],
              stream: true,
            };

        // Créer un AbortController pour timeout (120 secondes)
        const abortController = new AbortController();
        const timeoutId = setTimeout(() => abortController.abort(), 120000);

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
          signal: abortController.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Erreur API');
        }

        // Lire le stream SSE
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        
        if (!reader) {
          throw new Error('No response body');
        }

        let fullContent = '';
        let inputTokens = 0;
        let outputTokens = 0;
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          let currentEvent = '';
          for (const line of lines) {
            if (!line.trim()) continue;
            
            // Récupérer le type d'événement SSE
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim();
              continue;
            }
            
            // Parser les données SSE
            if (!line.startsWith('data: ')) continue;
            
            try {
              const data = JSON.parse(line.slice(6));
              
              // Utiliser currentEvent si disponible, sinon data.type
              const eventType = currentEvent || data.type;
              
              // Gestion des événements SSE
              if (eventType === 'content_block_delta' && data.delta?.text) {
                fullContent += data.delta.text;
                
                // Mettre à jour le message progressivement
                updateMessage(sessionId, tempMessageId, {
                  content: fullContent,
                });
                
                // Callback optionnel pour animation
                onChunk?.(data.delta.text);
              }
              
              // Message terminé avec statistiques (Ollama)
              if (data.type === 'message_done' && data.usage) {
                inputTokens = data.usage.input_tokens || 0;
                outputTokens = data.usage.output_tokens || 0;
              }
              
              // Pour Claude : message_start avec usage.input_tokens
              if (eventType === 'message_start' && data.message?.usage) {
                inputTokens = data.message.usage.input_tokens || 0;
              }
              
              // Pour Claude : usage dans message_delta
              if (eventType === 'message_delta' && data.usage) {
                outputTokens = data.usage.output_tokens || 0;
              }
              
              // Reset event type après traitement
              currentEvent = '';
            } catch (e) {
              // Ignorer les erreurs de parsing
              console.warn('SSE parsing error:', e);
            }
          }
        }

        // Finaliser le message
        updateMessage(sessionId, tempMessageId, {
          content: fullContent,
          tokenCount: outputTokens,
        });

        const tokens = {
          input: inputTokens,
          output: outputTokens,
        };

        updateTokenUsage(sessionId, tokens);
        updateSessionStatus(sessionId, 'completed');

        setIsLoading(false);
        return { content: fullContent, tokens };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue';
        
        // Déterminer le type d'erreur
        let userFriendlyError = errorMessage;
        if (err instanceof Error && err.name === 'AbortError') {
          userFriendlyError = '⏱️ Timeout : La réponse a pris trop de temps (>120s). Ollama local peut être lent, essayez un modèle cloud ou réduisez la complexité de la question.';
        } else if (errorMessage.includes('HeadersTimeoutError') || errorMessage.includes('fetch failed')) {
          userFriendlyError = '🔌 Erreur de connexion : Impossible de joindre le serveur Ollama. Vérifiez qu\'Ollama est bien démarré et accessible.';
        }
        
        // Mettre à jour le message temporaire avec l'erreur
        if (tempMessageId) {
          updateMessage(sessionId, tempMessageId, {
            content: `❌ **Erreur**\n\n${userFriendlyError}`,
          });
        }
        
        setError(errorMessage);
        updateSessionStatus(sessionId, 'error');
        setIsLoading(false);
        return null;
      }
    },
    [addMessage, updateMessage, updateSessionStatus, updateTokenUsage, apiKey, apiUrl, selectedModel, provider, ollamaUrl, ollamaThink, systemPrompt]
  );

  return {
    sendMessage,
    isLoading,
    error,
  };
}
