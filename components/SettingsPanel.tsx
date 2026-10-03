'use client';

import { useState, useRef, useEffect } from 'react';
import { X, Key, CheckCircle2, XCircle, Loader2, Settings as SettingsIcon, Cpu, Download, Upload, Save, Trash2, FolderOpen } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { MODEL_PRICING } from '@/lib/utils';
import { useClaudeModels } from '@/hooks/useClaudeModels';
import { DEFAULT_CLAUDE_MODEL } from '@/lib/claudeModels';
import { useOllamaModels } from '@/hooks/useOllamaModels';
import { exportData, importData, createAutoBackup, listAutoBackups, deleteAutoBackup } from '@/lib/backup';

interface SettingsPanelProps {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { 
    apiKey, apiUrl, selectedModel, provider, ollamaUrl, backupPath, systemPrompt,
    setApiKey, setApiUrl, setSelectedModel, setProvider, setOllamaUrl, setBackupPath, setSystemPrompt,
    workspaces
  } = useAppStore();
  
  const [tempApiKey, setTempApiKey] = useState(apiKey || '');
  const [tempApiUrl, setTempApiUrl] = useState(apiUrl || 'https://api.anthropic.com/v1');
  const [tempSystemPrompt, setTempSystemPrompt] = useState(systemPrompt ?? '');
  const [tempModel, setTempModel] = useState(selectedModel || DEFAULT_CLAUDE_MODEL);
  const [tempProvider, setTempProvider] = useState(provider || 'anthropic');
  const [tempOllamaUrl, setTempOllamaUrl] = useState(ollamaUrl || 'http://localhost:11434');
  const { models: claudeModels, error: claudeModelsError, loading: claudeLoading, fetched: claudeFetched, reload: reloadClaude } =
    useClaudeModels(tempApiKey || null, tempApiUrl, tempProvider === 'anthropic');
  const { models: fetchedModels, error: fetchModelsError, loading: fetchingModels, reload: reloadModels } =
    useOllamaModels(tempOllamaUrl, tempProvider === 'ollama');
  // Si le modèle choisi n'existe pas sur le serveur Ollama sélectionné, bascule sur un modèle présent
  useEffect(() => {
    if (tempProvider !== 'ollama' || fetchedModels.length === 0) return;
    if (fetchedModels.some((m) => m.id === tempModel)) return;
    setTempModel(fetchedModels[0].id);
  }, [tempProvider, fetchedModels, tempModel]);

  // Liste réelle du serveur Ollama (aucune liste statique)
  const ollamaList = fetchedModels.map((m) => ({
    id: m.id,
    name: m.id,
    type: (m.id.endsWith(':cloud') ? 'cloud' : 'local') as 'cloud' | 'local',
    size: m.size ? `${(m.size / 1e9).toFixed(1)} Go` : '',
    description: [m.parameterSize, m.thinking ? 'raisonnement' : ''].filter(Boolean).join(' · '),
    recommended: false,
  }));
  const [tempBackupPath, setTempBackupPath] = useState(backupPath || '/Users/julien/Documents/sekirokostchatstudio-backups');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [testMessage, setTestMessage] = useState('');
  const [showKey, setShowKey] = useState(false);
  
  // Backup states
  const [backups, setBackups] = useState<any[]>([]);
  const [backupStatus, setBackupStatus] = useState<string>('');
  const [loadingBackups, setLoadingBackups] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSave = () => {
    setApiKey(tempApiKey);
    setApiUrl(tempApiUrl);
    setSelectedModel(tempModel);
    setProvider(tempProvider);
    setOllamaUrl(tempOllamaUrl);
    setBackupPath(tempBackupPath);
    setSystemPrompt(tempSystemPrompt);
    setTestResult(null);
    alert('✅ Paramètres sauvegardés !');
  };

  const handleTestConnection = async () => {
    if (tempProvider === 'anthropic' && !tempApiKey) {
      setTestResult('error');
      setTestMessage('Veuillez entrer une clé API');
      return;
    }

    setTesting(true);
    setTestResult(null);
    setTestMessage('');

    try {
      const endpoint = tempProvider === 'ollama' ? '/api/ollama' : '/api/claude';
      const requestBody = tempProvider === 'ollama'
        ? {
            ollamaUrl: tempOllamaUrl,
            model: tempModel,
            stream: false,
            messages: [
              { role: 'user', content: 'Réponds simplement "OK" pour confirmer que la connexion fonctionne.' }
            ],
          }
        : {
            apiKey: tempApiKey,
            apiUrl: tempApiUrl,
            model: tempModel,
            messages: [
              { role: 'user', content: 'Réponds simplement "OK" pour confirmer que la connexion fonctionne.' }
            ],
          };

      // Appel via notre backend proxy
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        const data = await response.json();
        setTestResult('success');
        setTestMessage(`Connexion réussie ! ${tempProvider === 'ollama' ? tempModel : 'Claude'} a répondu : ` + data.content[0].text);
      } else {
        const error = await response.json();
        console.error('Test connection error:', error);
        setTestResult('error');
        
        // Message d'erreur détaillé
        let errorMsg = `Erreur ${response.status}: `;
        if (error.error) {
          errorMsg += error.error;
          if (error.details) {
            errorMsg += ` - ${JSON.stringify(error.details)}`;
          }
        } else {
          errorMsg += 'Connexion échouée';
        }
        
        setTestMessage(errorMsg);
      }
    } catch (error) {
      setTestResult('error');
      setTestMessage('Erreur réseau : ' + (error instanceof Error ? error.message : 'Connexion impossible'));
    } finally {
      setTesting(false);
    }
  };

  // Backup handlers
  const handleExport = async () => {
    try {
      const storeData = localStorage.getItem('claude-interface-storage');
      if (!storeData) {
        alert('Aucune donnée à exporter');
        return;
      }
      
      const data = JSON.parse(storeData);
      const filename = await exportData(data);
      setBackupStatus(`✅ Export réussi : ${filename}`);
      setTimeout(() => setBackupStatus(''), 3000);
    } catch (error) {
      setBackupStatus('❌ Erreur lors de l\'export');
      console.error('Export error:', error);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const data = await importData(file);
      
      if (confirm('⚠️ L\'import va remplacer toutes vos données actuelles. Continuer ?')) {
        localStorage.setItem('claude-interface-storage', JSON.stringify(data));
        setBackupStatus('✅ Import réussi ! Rechargez la page.');
        setTimeout(() => window.location.reload(), 2000);
      }
    } catch (error) {
      setBackupStatus('❌ Erreur lors de l\'import');
      console.error('Import error:', error);
    }
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleAutoBackup = async () => {
    try {
      setLoadingBackups(true);
      const storeData = localStorage.getItem('claude-interface-storage');
      if (!storeData) {
        alert('Aucune donnée à sauvegarder');
        return;
      }
      
      const data = JSON.parse(storeData);
      const result = await createAutoBackup(data, tempBackupPath);
      setBackupStatus(`✅ ${result.message}`);
      
      // Rafraîchir la liste
      await loadBackups();
      
      setTimeout(() => setBackupStatus(''), 3000);
    } catch (error: any) {
      setBackupStatus(`❌ ${error.message || 'Erreur backup'}`);
    } finally {
      setLoadingBackups(false);
    }
  };

  const loadBackups = async () => {
    try {
      setLoadingBackups(true);
      const result = await listAutoBackups(tempBackupPath);
      setBackups(result.backups || []);
    } catch (error) {
      console.error('Load backups error:', error);
    } finally {
      setLoadingBackups(false);
    }
  };

  const handleDeleteBackup = async (filename: string) => {
    if (!confirm(`Supprimer ${filename} ?`)) return;
    
    try {
      await deleteAutoBackup(filename, tempBackupPath);
      setBackupStatus(`✅ Backup ${filename} supprimé`);
      await loadBackups();
      setTimeout(() => setBackupStatus(''), 3000);
    } catch (error) {
      setBackupStatus('❌ Erreur lors de la suppression');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-zinc-900 border-b border-zinc-800 p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <SettingsIcon size={24} className="text-blue-500" />
            <h2 className="text-2xl font-bold text-white">Paramètres</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-zinc-800 rounded-lg transition"
          >
            <X size={20} className="text-zinc-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Provider Selection */}
          <section>
            <h3 className="text-lg font-semibold text-white mb-3">Provider</h3>
            <div className="grid grid-cols-2 gap-3">
              <label
                className={`p-4 border rounded-lg cursor-pointer transition ${
                  tempProvider === 'anthropic'
                    ? 'bg-blue-500/20 border-blue-500'
                    : 'bg-zinc-800/50 border-zinc-700 hover:border-zinc-600'
                }`}
              >
                <input
                  type="radio"
                  name="provider"
                  value="anthropic"
                  checked={tempProvider === 'anthropic'}
                  onChange={(e) => setTempProvider(e.target.value as 'anthropic' | 'ollama')}
                  className="sr-only"
                />
                <div className="flex items-center gap-2 mb-2">
                  <Key size={20} className="text-purple-500" />
                  <span className="font-medium text-white">Anthropic API</span>
                </div>
                <p className="text-xs text-zinc-400">
                  Claude officiel, payant, performances maximales
                </p>
              </label>

              <label
                className={`p-4 border rounded-lg cursor-pointer transition ${
                  tempProvider === 'ollama'
                    ? 'bg-blue-500/20 border-blue-500'
                    : 'bg-zinc-800/50 border-zinc-700 hover:border-zinc-600'
                }`}
              >
                <input
                  type="radio"
                  name="provider"
                  value="ollama"
                  checked={tempProvider === 'ollama'}
                  onChange={(e) => setTempProvider(e.target.value as 'anthropic' | 'ollama')}
                  className="sr-only"
                />
                <div className="flex items-center gap-2 mb-2">
                  <Cpu size={20} className="text-green-500" />
                  <span className="font-medium text-white">Ollama Local</span>
                </div>
                <p className="text-xs text-zinc-400">
                  Modèles locaux, gratuit, privé
                </p>
              </label>
            </div>
          </section>

          {/* API Configuration - Anthropic only */}
          {tempProvider === 'anthropic' && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Key size={20} className="text-purple-500" />
              <h3 className="text-lg font-semibold text-white">Configuration API Claude</h3>
            </div>

            {/* Info */}
            <div className="mb-4 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <p className="text-sm text-blue-300">
                💡 <strong>Astuce :</strong> Obtenez votre clé API sur{' '}
                <a
                  href="https://console.anthropic.com/settings/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-blue-200"
                >
                  console.anthropic.com
                </a>
              </p>
            </div>

            {/* API Key Input */}
            <div className="space-y-2 mb-4">
              <label className="block text-sm font-medium text-zinc-300">
                Clé API Anthropic
              </label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={tempApiKey}
                  onChange={(e) => setTempApiKey(e.target.value)}
                  placeholder="sk-ant-api03-..."
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 pr-24"
                />
                <button
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 rounded transition"
                >
                  {showKey ? 'Masquer' : 'Afficher'}
                </button>
              </div>
              <p className="text-xs text-zinc-500">
                Votre clé est stockée localement dans votre navigateur (localStorage)
              </p>
            </div>

            {/* API URL Input */}
            <div className="space-y-2 mb-4">
              <label className="block text-sm font-medium text-zinc-300">
                URL de l'API
              </label>
              <input
                type="text"
                value={tempApiUrl}
                onChange={(e) => setTempApiUrl(e.target.value)}
                placeholder="https://api.anthropic.com/v1"
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
              />
              <p className="text-xs text-zinc-500">
                Laissez l'URL par défaut sauf si vous utilisez un proxy
              </p>
            </div>

            {/* Test Connection Button */}
            <button
              onClick={handleTestConnection}
              disabled={testing || !tempApiKey}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition"
            >
              {testing ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Test en cours...
                </>
              ) : (
                <>
                  <CheckCircle2 size={18} />
                  Tester la connexion
                </>
              )}
            </button>

            {/* Test Result */}
            {testResult && (
              <div
                className={`mt-4 p-4 rounded-lg border ${
                  testResult === 'success'
                    ? 'bg-green-500/10 border-green-500/20'
                    : 'bg-red-500/10 border-red-500/20'
                }`}
              >
                <div className="flex items-start gap-2">
                  {testResult === 'success' ? (
                    <CheckCircle2 size={20} className="text-green-400 flex-shrink-0 mt-0.5" />
                  ) : (
                    <XCircle size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <p className={`font-medium ${testResult === 'success' ? 'text-green-300' : 'text-red-300'}`}>
                      {testResult === 'success' ? '✅ Connexion réussie !' : '❌ Connexion échouée'}
                    </p>
                    <p className="text-sm text-zinc-400 mt-1">{testMessage}</p>
                  </div>
                </div>
              </div>
            )}
          </section>
          )}

          {/* Ollama Configuration - Ollama only */}
          {tempProvider === 'ollama' && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Cpu size={20} className="text-green-500" />
              <h3 className="text-lg font-semibold text-white">Configuration Ollama</h3>
            </div>

            {/* Info */}
            <div className="mb-4 p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
              <p className="text-sm text-green-300">
                💡 <strong>Prérequis :</strong> Installez Ollama sur{' '}
                <a
                  href="https://ollama.ai/download"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-green-200"
                >
                  ollama.ai/download
                </a>
                {' '}et démarrez-le.
              </p>
            </div>

            {/* Ollama URL Input */}
            <div className="space-y-2 mb-4">
              <label className="block text-sm font-medium text-zinc-300">
                URL Ollama
              </label>
              <input
                type="text"
                value={tempOllamaUrl}
                onChange={(e) => setTempOllamaUrl(e.target.value)}
                placeholder="http://localhost:11434"
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-green-500"
              />
              <p className="text-xs text-zinc-500">
                Laissez l'URL par défaut si Ollama tourne localement
              </p>
            </div>

            {/* Test Connection Button */}
            <button
              onClick={handleTestConnection}
              disabled={testing}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition"
            >
              {testing ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Test en cours...
                </>
              ) : (
                <>
                  <CheckCircle2 size={18} />
                  Tester la connexion
                </>
              )}
            </button>

            {/* Test Result */}
            {testResult && (
              <div
                className={`mt-4 p-4 rounded-lg border ${
                  testResult === 'success'
                    ? 'bg-green-500/10 border-green-500/20'
                    : 'bg-red-500/10 border-red-500/20'
                }`}
              >
                <div className="flex items-start gap-2">
                  {testResult === 'success' ? (
                    <CheckCircle2 size={20} className="text-green-400 flex-shrink-0 mt-0.5" />
                  ) : (
                    <XCircle size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <p className={`font-medium ${testResult === 'success' ? 'text-green-300' : 'text-red-300'}`}>
                      {testResult === 'success' ? '✅ Connexion réussie !' : '❌ Connexion échouée'}
                    </p>
                    <p className="text-sm text-zinc-400 mt-1">{testMessage}</p>
                  </div>
                </div>
              </div>
            )}
          </section>
          )}

          {/* Model Selection */}
          <section>
            <h3 className="text-lg font-semibold text-white mb-3">
              {tempProvider === 'anthropic' ? 'Modèle Claude' : 'Modèle Ollama'}
            </h3>
            
            {tempProvider === 'anthropic' ? (
              <>
                <div className="flex items-center justify-between mb-2 text-xs">
                  <span className={claudeModelsError ? 'text-yellow-500' : 'text-zinc-500'}>
                    {claudeLoading
                      ? 'Chargement des modèles…'
                      : claudeModelsError
                        ? `Liste par défaut (${claudeModelsError})`
                        : claudeFetched
                          ? `${claudeModels.length} modèle(s) disponibles sur ce compte`
                          : 'Liste par défaut (entrez une clé API pour charger la liste réelle)'}
                  </span>
                  <button type="button" onClick={reloadClaude} className="text-blue-400 hover:underline">
                    Actualiser
                  </button>
                </div>
                <div className="space-y-2">
                  {claudeModels.map((m) => (
                    <label
                      key={m.id}
                      className={`block p-3 border rounded-lg cursor-pointer transition ${
                        tempModel === m.id
                          ? 'bg-blue-500/20 border-blue-500'
                          : 'bg-zinc-800/50 border-zinc-700 hover:border-zinc-600'
                      }`}
                    >
                      <input
                        type="radio"
                        name="model"
                        value={m.id}
                        checked={tempModel === m.id}
                        onChange={(e) => setTempModel(e.target.value)}
                        className="sr-only"
                      />
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-white">{m.name}</span>
                        <span className="text-xs text-zinc-500">
                          {MODEL_PRICING[m.id]
                            ? `$${MODEL_PRICING[m.id].input} / $${MODEL_PRICING[m.id].output} par 1M tokens`
                            : m.id}
                        </span>
                      </div>
                    </label>
                  ))}
                </div>
                <div className="mt-3">
                  <label className="block text-sm font-medium text-zinc-300 mb-1">
                    Autre modèle (saisie manuelle)
                  </label>
                  <input
                    type="text"
                    value={tempModel}
                    onChange={(e) => setTempModel(e.target.value.trim())}
                    placeholder="ex : claude-sonnet-5-5"
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between mb-2 text-xs">
                  <span className={fetchModelsError ? 'text-yellow-500' : 'text-zinc-500'}>
                    {fetchingModels
                      ? 'Chargement des modèles…'
                      : fetchModelsError
                        ? `Serveur injoignable (${fetchModelsError})`
                        : `${fetchedModels.length} modèle(s) détecté(s) sur le serveur`}
                  </span>
                  <button type="button" onClick={reloadModels} className="text-blue-400 hover:underline">
                    Actualiser
                  </button>
                </div>
                <div className="space-y-2">
                  {ollamaList.map(({ id: modelId, ...info }) => (
                    <label
                      key={modelId}
                      className={`block p-3 border rounded-lg cursor-pointer transition ${
                        tempModel === modelId
                          ? 'bg-green-500/20 border-green-500'
                          : 'bg-zinc-800/50 border-zinc-700 hover:border-zinc-600'
                      }`}
                    >
                      <input
                        type="radio"
                        name="model"
                        value={modelId}
                        checked={tempModel === modelId}
                        onChange={(e) => setTempModel(e.target.value)}
                        className="sr-only"
                      />
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white">{info.name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            info.type === 'cloud' 
                              ? 'bg-blue-500/20 text-blue-300' 
                              : 'bg-purple-500/20 text-purple-300'
                          }`}>
                            {info.type === 'cloud' ? '☁️ Cloud' : '💻 Local'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {info.type === 'local' && (
                            <span className="text-xs text-zinc-500">{info.size}</span>
                          )}
                          {info.recommended && (
                            <span className="text-xs bg-green-500/20 text-green-300 px-2 py-1 rounded">
                              ⭐
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-zinc-400">{info.description}</p>
                    </label>
                  ))}
                </div>
                <div className="mt-3">
                  <label className="block text-sm font-medium text-zinc-300 mb-1">
                    Autre modèle (saisie manuelle)
                  </label>
                  <input
                    type="text"
                    value={tempModel}
                    onChange={(e) => setTempModel(e.target.value.trim())}
                    placeholder="ex : llama3.2:1b ou un modèle :cloud"
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-green-500"
                  />
                </div>
                <div className="mt-4">
                  <label className="block text-sm font-medium text-zinc-300 mb-1">
                    Prompt système
                  </label>
                  <textarea
                    value={tempSystemPrompt}
                    onChange={(e) => setTempSystemPrompt(e.target.value)}
                    rows={3}
                    placeholder="Ex : Tu es un assistant utile. Réponds toujours en français."
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-green-500"
                  />
                  <p className="text-xs text-zinc-600 mt-1">
                    Envoyé au modèle Ollama avant chaque conversation. Laisser vide pour désactiver.
                  </p>
                </div>
                <div className="mt-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                  <p className="text-xs text-blue-300">
                    {tempModel && tempModel.endsWith(':cloud') ? (
                      <>
                        ☁️ <strong>Modèle cloud :</strong> Aucun téléchargement nécessaire, fonctionne directement !
                      </>
                    ) : (
                      <>
                        💻 <strong>Modèle local :</strong> Téléchargez avec{' '}
                        <code className="bg-zinc-800 px-1 rounded">ollama pull {tempModel || '<modèle>'}</code>
                      </>
                    )}
                  </p>
                </div>
              </>
            )}
          </section>

          {/* Backup & Export/Import */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Save size={20} className="text-orange-500" />
              <h3 className="text-lg font-semibold text-white">Sauvegarde & Export</h3>
            </div>

            {/* Backup Path */}
            <div className="space-y-2 mb-4">
              <label className="block text-sm font-medium text-zinc-300">
                Dossier de sauvegarde automatique
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={tempBackupPath}
                  onChange={(e) => setTempBackupPath(e.target.value)}
                  placeholder="/Users/julien/Documents/sekirokostchatstudio-backups"
                  className="flex-1 px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500 text-sm"
                />
                <button
                  onClick={loadBackups}
                  className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg transition"
                  title="Actualiser"
                >
                  <FolderOpen size={18} className="text-zinc-300" />
                </button>
              </div>
              <p className="text-xs text-zinc-500">
                Les backups automatiques sont sauvegardés ici (rotation sur 7 jours)
              </p>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <button
                onClick={handleExport}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition text-sm"
              >
                <Download size={16} />
                Exporter
              </button>
              
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition text-sm"
              >
                <Upload size={16} />
                Importer
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleImport}
                className="hidden"
              />
              
              <button
                onClick={handleAutoBackup}
                disabled={loadingBackups}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-orange-600 hover:bg-orange-700 disabled:bg-zinc-700 text-white rounded-lg transition text-sm"
              >
                {loadingBackups ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Backup
              </button>
            </div>

            {/* Status Message */}
            {backupStatus && (
              <div className="mb-4 p-3 bg-zinc-800 border border-zinc-700 rounded-lg">
                <p className="text-sm text-white">{backupStatus}</p>
              </div>
            )}

            {/* Backups List */}
            {backups.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-medium text-zinc-300 mb-2">
                  Backups automatiques ({backups.length}/7)
                </h4>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {backups.map((backup) => (
                    <div
                      key={backup.filename}
                      className="flex items-center justify-between p-2 bg-zinc-800 rounded-lg"
                    >
                      <span className="text-sm text-zinc-300">{backup.filename}</span>
                      <button
                        onClick={() => handleDeleteBackup(backup.filename)}
                        className="p-1 hover:bg-zinc-700 rounded transition"
                        title="Supprimer"
                      >
                        <Trash2 size={14} className="text-red-400" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <p className="text-xs text-blue-300">
                💡 <strong>Export :</strong> Télécharge vos données en JSON<br />
                💡 <strong>Import :</strong> Restaure depuis un fichier JSON<br />
                💡 <strong>Backup :</strong> Sauvegarde auto dans le dossier configuré
              </p>
            </div>
          </section>

          {/* Warning - Anthropic only */}
          {tempProvider === 'anthropic' && (
          <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
            <p className="text-sm text-yellow-300">
              ⚠️ <strong>Sécurité :</strong> Ne partagez jamais votre clé API. Elle donne accès à votre compte Anthropic.
            </p>
          </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-zinc-800 p-4 bg-zinc-900/50 flex gap-3">
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition"
          >
            💾 Sauvegarder
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white font-medium rounded-lg transition"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
