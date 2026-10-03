import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Workspace, Project, Session, Message } from '@/types';

interface AppState {
  workspaces: Workspace[];
  currentWorkspaceId: string | null;
  currentProjectId: string | null;
  currentSessionId: string | null;
  isClaudeProcessing: boolean;
  shouldFlash: boolean;
  apiKey: string | null;
  apiUrl: string;
  selectedModel: string;
  provider: 'anthropic' | 'ollama';
  ollamaUrl: string;
  ollamaThink: boolean;
  systemPrompt: string;
  backupPath: string;
  
  // Actions
  addWorkspace: (name: string, color: string) => void;
  addProject: (workspaceId: string, name: string, description?: string) => void;
  addSession: (projectId: string, name: string) => void;
  addMessage: (sessionId: string, message: Omit<Message, 'timestamp'> | Omit<Message, 'id' | 'timestamp'>) => void;
  updateMessage: (sessionId: string, messageId: string, updates: Partial<Message>) => void;
  updateSessionStatus: (sessionId: string, status: Session['status']) => void;
  updateTokenUsage: (sessionId: string, tokens: { input?: number; output?: number }) => void;
  setCurrentWorkspace: (workspaceId: string | null) => void;
  setCurrentProject: (projectId: string | null) => void;
  setCurrentSession: (sessionId: string | null) => void;
  setClaudeProcessing: (isProcessing: boolean) => void;
  triggerFlash: () => void;
  getCurrentSession: () => Session | null;
  deleteSession: (sessionId: string) => void;
  deleteProject: (projectId: string) => void;
  deleteWorkspace: (workspaceId: string) => void;
  resetAll: () => void;
  showWelcomeScreen: boolean;
  setShowWelcomeScreen: (show: boolean) => void;
  setApiKey: (key: string) => void;
  setApiUrl: (url: string) => void;
  setSelectedModel: (model: string) => void;
  setProvider: (provider: 'anthropic' | 'ollama') => void;
  setOllamaUrl: (url: string) => void;
  setOllamaThink: (think: boolean) => void;
  setSystemPrompt: (prompt: string) => void;
  setBackupPath: (path: string) => void;
}

const generateId = () => Math.random().toString(36).substr(2, 9);

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      workspaces: [],
      currentWorkspaceId: null,
      currentProjectId: null,
      currentSessionId: null,
      isClaudeProcessing: false,
      shouldFlash: false,
      showWelcomeScreen: false,
      apiKey: null,
      apiUrl: 'https://api.anthropic.com/v1',
      selectedModel: 'claude-sonnet-5-5',
      provider: 'anthropic',
      ollamaUrl: 'http://localhost:11434',
      ollamaThink: false,
      systemPrompt: 'Tu es un assistant utile. Réponds toujours en français, de façon claire et concise.',
      backupPath: '/Users/julien/Documents/sekirokostchatstudio-backups',

      addWorkspace: (name, color) => {
        const newWorkspace: Workspace = {
          id: generateId(),
          name,
          color,
          projects: [],
          createdAt: new Date(),
        };
        set((state) => ({
          workspaces: [...state.workspaces, newWorkspace],
          currentWorkspaceId: newWorkspace.id,
        }));
      },

      addProject: (workspaceId, name, description) => {
        const newProject: Project = {
          id: generateId(),
          name,
          description,
          sessions: [],
          createdAt: new Date(),
        };
        set((state) => ({
          workspaces: state.workspaces.map((w) =>
            w.id === workspaceId
              ? { ...w, projects: [...w.projects, newProject] }
              : w
          ),
          currentProjectId: newProject.id,
        }));
      },

      addSession: (projectId, name) => {
        const newSession: Session = {
          id: generateId(),
          name,
          workspaceId: '',
          projectId,
          messages: [],
          status: 'idle',
          tokenUsage: { input: 0, output: 0, total: 0 },
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        set((state) => ({
          workspaces: state.workspaces.map((w) => ({
            ...w,
            projects: w.projects.map((p) =>
              p.id === projectId
                ? { ...p, sessions: [...p.sessions, newSession] }
                : p
            ),
          })),
          currentSessionId: newSession.id,
        }));
      },

      addMessage: (sessionId, message) => {
        const newMessage: Message = {
          ...message,
          id: ('id' in message && message.id) ? message.id : generateId(),
          timestamp: new Date(),
        };

        set((state) => ({
          workspaces: state.workspaces.map((w) => ({
            ...w,
            projects: w.projects.map((p) => ({
              ...p,
              sessions: p.sessions.map((s) =>
                s.id === sessionId
                  ? {
                      ...s,
                      messages: [...s.messages, newMessage],
                      updatedAt: new Date(),
                    }
                  : s
              ),
            })),
          })),
        }));
      },

      updateMessage: (sessionId, messageId, updates) => {
        set((state) => ({
          workspaces: state.workspaces.map((w) => ({
            ...w,
            projects: w.projects.map((p) => ({
              ...p,
              sessions: p.sessions.map((s) =>
                s.id === sessionId
                  ? {
                      ...s,
                      messages: s.messages.map((m) =>
                        m.id === messageId ? { ...m, ...updates } : m
                      ),
                      updatedAt: new Date(),
                    }
                  : s
              ),
            })),
          })),
        }));
      },

      updateSessionStatus: (sessionId, status) => {
        set((state) => ({
          workspaces: state.workspaces.map((w) => ({
            ...w,
            projects: w.projects.map((p) => ({
              ...p,
              sessions: p.sessions.map((s) =>
                s.id === sessionId
                  ? { ...s, status, updatedAt: new Date() }
                  : s
              ),
            })),
          })),
        }));

        if (status === 'completed') {
          get().setClaudeProcessing(false);
          get().triggerFlash();
        } else if (status === 'processing') {
          get().setClaudeProcessing(true);
        }
      },

      updateTokenUsage: (sessionId, tokens) => {
        set((state) => ({
          workspaces: state.workspaces.map((w) => ({
            ...w,
            projects: w.projects.map((p) => ({
              ...p,
              sessions: p.sessions.map((s) => {
                if (s.id === sessionId) {
                  const newInput = tokens.input !== undefined ? tokens.input : s.tokenUsage.input;
                  const newOutput = tokens.output !== undefined ? tokens.output : s.tokenUsage.output;
                  return {
                    ...s,
                    tokenUsage: {
                      input: newInput,
                      output: newOutput,
                      total: newInput + newOutput,
                    },
                  };
                }
                return s;
              }),
            })),
          })),
        }));
      },

      setCurrentWorkspace: (workspaceId) => set({ currentWorkspaceId: workspaceId }),
      setCurrentProject: (projectId) => set({ currentProjectId: projectId }),
      setCurrentSession: (sessionId) => set({ currentSessionId: sessionId }),
      setClaudeProcessing: (isProcessing) => set({ isClaudeProcessing: isProcessing }),
      
      triggerFlash: () => {
        set({ shouldFlash: true });
        setTimeout(() => set({ shouldFlash: false }), 1500);
      },

      getCurrentSession: () => {
        const state = get();
        if (!state.currentSessionId) return null;

        for (const workspace of state.workspaces) {
          for (const project of workspace.projects) {
            const session = project.sessions.find((s) => s.id === state.currentSessionId);
            if (session) return session;
          }
        }
        return null;
      },

      deleteSession: (sessionId) => {
        set((state) => ({
          workspaces: state.workspaces.map((w) => ({
            ...w,
            projects: w.projects.map((p) => ({
              ...p,
              sessions: p.sessions.filter((s) => s.id !== sessionId),
            })),
          })),
          currentSessionId: state.currentSessionId === sessionId ? null : state.currentSessionId,
        }));
      },

      deleteProject: (projectId) => {
        set((state) => ({
          workspaces: state.workspaces.map((w) => ({
            ...w,
            projects: w.projects.filter((p) => p.id !== projectId),
          })),
          currentProjectId: state.currentProjectId === projectId ? null : state.currentProjectId,
        }));
      },

      deleteWorkspace: (workspaceId) => {
        set((state) => ({
          workspaces: state.workspaces.filter((w) => w.id !== workspaceId),
          currentWorkspaceId: state.currentWorkspaceId === workspaceId ? null : state.currentWorkspaceId,
        }));
      },

      resetAll: () => {
        set({
          workspaces: [],
          currentWorkspaceId: null,
          currentProjectId: null,
          currentSessionId: null,
          isClaudeProcessing: false,
          shouldFlash: false,
          showWelcomeScreen: true,
        });
      },

      setShowWelcomeScreen: (show) => {
        set({ showWelcomeScreen: show });
      },

      setApiKey: (key) => {
        set({ apiKey: key });
      },

      setApiUrl: (url) => {
        set({ apiUrl: url });
      },

      setSelectedModel: (model) => {
        set({ selectedModel: model });
      },

      setProvider: (provider) => {
        set({ provider });
      },

      setOllamaUrl: (url) => {
        set({ ollamaUrl: url.trim() });
      },

      setSystemPrompt: (prompt) => {
        set({ systemPrompt: prompt });
      },

      setOllamaThink: (think) => {
        set({ ollamaThink: think });
      },

      setBackupPath: (path) => {
        set({ backupPath: path });
      },
    }),
    {
      name: 'claude-interface-storage',
    }
  )
);
