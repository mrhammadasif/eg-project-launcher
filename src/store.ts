import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const PREFERRED_EDITOR = {
  VISUAL_STUDIO_CODE: 'Visual Studio Code',
  CURSOR: 'Cursor',
  ANTIGRAVITY: 'Antigravity',
  WEBSTORM: 'WebStorm',
} as const;

export type PreferredEditor = (typeof PREFERRED_EDITOR)[keyof typeof PREFERRED_EDITOR];

export const PREFERRED_EDITORS = Object.values(PREFERRED_EDITOR);

export function isPreferredEditor(editor: string): editor is PreferredEditor {
  return PREFERRED_EDITORS.includes(editor as PreferredEditor);
}

interface SettingsState {
  projectsDir: string;
  preferredEditor: PreferredEditor;
  recentSlns: Record<string, string>;
  setProjectsDir: (dir: string) => void;
  setPreferredEditor: (editor: PreferredEditor) => void;
  setRecentSln: (projectName: string, slnPath: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      projectsDir: '~/Projects',
      preferredEditor: PREFERRED_EDITOR.VISUAL_STUDIO_CODE,
      recentSlns: {},
      setProjectsDir: (dir) => set({ projectsDir: dir }),
      setPreferredEditor: (editor) => set({ preferredEditor: editor }),
      setRecentSln: (projectName, slnPath) => set((state) => ({ 
        recentSlns: { ...state.recentSlns, [projectName]: slnPath } 
      })),
    }),
    {
      name: 'launcher-settings',
    }
  )
)
