import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SettingsState {
  projectsDir: string;
  preferredEditor: string;
  customEditorPath: string;
  recentSlns: Record<string, string>;
  setProjectsDir: (dir: string) => void;
  setPreferredEditor: (editor: string) => void;
  setCustomEditorPath: (path: string) => void;
  setRecentSln: (projectName: string, slnPath: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      projectsDir: '~/Projects',
      preferredEditor: 'Visual Studio Code',
      customEditorPath: '',
      recentSlns: {},
      setProjectsDir: (dir) => set({ projectsDir: dir }),
      setPreferredEditor: (editor) => set({ preferredEditor: editor }),
      setCustomEditorPath: (path) => set({ customEditorPath: path }),
      setRecentSln: (projectName, slnPath) => set((state) => ({ 
        recentSlns: { ...state.recentSlns, [projectName]: slnPath } 
      })),
    }),
    {
      name: 'launcher-settings',
    }
  )
)
