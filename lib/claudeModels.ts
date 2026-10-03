// Modèles Claude proposés par défaut (repli si l'API /models est injoignable).
// La liste réelle est récupérée dynamiquement via /api/claude/models.
export const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-5-5';

export const DEFAULT_CLAUDE_MODELS: { id: string; name: string }[] = [
  { id: 'claude-fable-5-1', name: 'Claude Fable 5.1' },
  { id: 'claude-opus-5-5', name: 'Claude Opus 5.5' },
  { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5' },
  { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' },
];
