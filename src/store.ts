import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SettingsState {
  projectsDir: string;
  preferredEditor: string;
  customEditorPath: string;
  setProjectsDir: (dir: string) => void;
  setPreferredEditor: (editor: string) => void;
  setCustomEditorPath: (path: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      projectsDir: '~/Projects',
      preferredEditor: 'Visual Studio Code',
      customEditorPath: '',
      setProjectsDir: (dir) => set({ projectsDir: dir }),
      setPreferredEditor: (editor) => set({ preferredEditor: editor }),
      setCustomEditorPath: (path) => set({ customEditorPath: path }),
    }),
    {
      name: 'launcher-settings',
    }
  )
)
