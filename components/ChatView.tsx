'use client';

import { useAppStore } from '@/store/useAppStore';
import { useState, useRef, useEffect } from 'react';
import { Send, User, Bot } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/utils';
import { TokenCounter } from './TokenCounter';
import { useClaude } from '@/hooks/useClaude';
import { useOllamaModels } from '@/hooks/useOllamaModels';
import { useClaudeModels } from '@/hooks/useClaudeModels';

export function ChatView() {
  const {
    getCurrentSession,
    addMessage,
    updateSessionStatus,
    updateTokenUsage,
    currentSessionId,
    provider,
    ollamaUrl,
    apiKey,
    apiUrl,
    selectedModel,
    setSelectedModel,
    ollamaThink,
    setOllamaThink,
  } = useAppStore();
  const { models: ollamaModels, error: modelsError } = useOllamaModels(ollamaUrl, provider === 'ollama');
  const { models: claudeModels, fetched: claudeFetched } = useClaudeModels(apiKey, apiUrl, provider === 'anthropic');

  const { sendMessage, isLoading } = useClaude();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const session = getCurrentSession();

  // Modèle sélectionné absent du serveur (ancien identifiant statique) : bascule sur un modèle réel
  useEffect(() => {
    if (provider !== 'ollama' || ollamaModels.length === 0) return;
    if (ollamaModels.some((m) => m.id === selectedModel)) return;
    const close = ollamaModels.find((m) => m.id.split(':')[0] === selectedModel.split(':')[0]);
    setSelectedModel((close || ollamaModels[0]).id);
  }, [provider, ollamaModels, selectedModel, setSelectedModel]);

  // Idem Claude : un identifiant périmé est remplacé une fois la liste réelle du compte chargée
  useEffect(() => {
    if (provider !== 'anthropic' || !claudeFetched || claudeModels.length === 0) return;
    if (claudeModels.some((m) => m.id === selectedModel)) return;
    setSelectedModel(claudeModels[0].id);
  }, [provider, claudeFetched, claudeModels, selectedModel, setSelectedModel]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [session?.messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !session || isLoading) return;

    const userMessage = input.trim();
    setInput('');

    // Add user message
    addMessage(session.id, {
      role: 'user',
      content: userMessage,
      tokenCount: Math.ceil(userMessage.length / 4),
    });

    // Update token usage (input)
    updateTokenUsage(session.id, {
      input: session.tokenUsage.input + Math.ceil(userMessage.length / 4),
    });

    // Build conversation history for context
    const history = session.messages
      .filter(msg => (msg.role === 'user' || msg.role === 'assistant') && !msg.content.startsWith('❌') && msg.content.trim() !== '')
      .map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      }));

    // Call real API (Claude or Ollama)
    await sendMessage(session.id, userMessage, history);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  if (!session) {
    return (
      <div className="flex-1 flex items-center justify-center bg-zinc-950">
        <div className="text-center">
          <Bot size={64} className="mx-auto mb-4 text-zinc-700" />
          <h2 className="text-xl font-semibold text-zinc-400 mb-2">
            Aucune session sélectionnée
          </h2>
          <p className="text-zinc-600">
            Créez une session pour commencer à discuter avec Claude
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-zinc-950 h-screen">
      {/* Header */}
      <div className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">{session.name}</h2>
            <p className="text-sm text-zinc-500">
              {session.messages.length} message{session.messages.length > 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {provider === 'anthropic' && (
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                title="Modèle Claude"
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500"
              >
                {!claudeModels.some((m) => m.id === selectedModel) && (
                  <option value={selectedModel}>{selectedModel}</option>
                )}
                {claudeModels.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            )}
            {provider === 'ollama' && (
              <div className="flex items-center gap-2">
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  title={modelsError || 'Modèle Ollama'}
                  className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-green-500"
                >
                  {!ollamaModels.some((m) => m.id === selectedModel) && (
                    <option value={selectedModel}>{selectedModel}</option>
                  )}
                  {ollamaModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.id}{m.parameterSize ? ` (${m.parameterSize})` : ''}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1 text-xs text-zinc-400 cursor-pointer" title="Mode raisonnement (plus lent)">
                  <input
                    type="checkbox"
                    checked={ollamaThink}
                    onChange={(e) => setOllamaThink(e.target.checked)}
                  />
                  Raisonnement
                </label>
              </div>
            )}
            <TokenCounter />
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {session.messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                'flex gap-4',
                message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
              )}
            >
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                  message.role === 'user'
                    ? 'bg-blue-600'
                    : 'bg-purple-600'
                )}
              >
                {message.role === 'user' ? (
                  <User size={18} />
                ) : (
                  <Bot size={18} />
                )}
              </div>

              <div
                className={cn(
                  'flex-1 max-w-3xl',
                  message.role === 'user' ? 'text-right' : 'text-left'
                )}
              >
                <div
                  className={cn(
                    'inline-block px-4 py-3 rounded-2xl',
                    message.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-zinc-800 text-white'
                  )}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                </div>
                <div className="mt-1 px-2 text-xs text-zinc-600">
                  {formatDate(message.timestamp)}
                  {message.tokenCount && (
                    <span className="ml-2">• {message.tokenCount} tokens</span>
                  )}
                </div>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area - Fixed at bottom */}
      <div className="border-t border-zinc-800 bg-zinc-900/80 backdrop-blur p-4">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
          <div className="flex gap-3 items-end">
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Écrivez votre message... (Entrée pour envoyer, Shift+Entrée pour une nouvelle ligne)"
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-2xl text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 resize-none scrollbar-thin"
                rows={3}
                style={{ maxHeight: '200px' }}
              />
            </div>
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className={cn(
                'p-3 rounded-full transition-all',
                input.trim() && !isLoading
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
              )}
            >
              <Send size={20} />
            </button>
          </div>
          <p className="text-xs text-zinc-600 mt-2">
            {isLoading && (
              <span className="text-yellow-500">En train de répondre...</span>
            )}
          </p>
        </form>
      </div>
    </div>
  );
}
