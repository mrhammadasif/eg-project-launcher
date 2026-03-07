import { useEffect, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Settings, RefreshCw, Folder } from 'lucide-react';
import { useSettingsStore } from './store';
import { SettingsDialog } from './SettingsDialog.tsx';
import { Separator } from "@/components/ui/separator"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"

function App() {
  const { projectsDir, preferredEditor, customEditorPath } = useSettingsStore();
  const [projects, setProjects] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchProjects = useCallback(async () => {
    if (!projectsDir) return;
    setLoading(true);
    try {
      const result = await invoke<string[]>('get_projects', { rootPath: projectsDir });
      setProjects(result);
    } catch (e) {
      console.error(e);
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [projectsDir]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);
  
  useEffect(() => {
    const handleFocus = () => fetchProjects();
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [fetchProjects]);

  const openProject = async (folderName: string) => {
    const folderPath = `${projectsDir.replace(/\/$/, '')}/${folderName}`;
    const editorToUse = customEditorPath || preferredEditor;
    try {
      await invoke('open_project', { editor: editorToUse, folderPath });
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      <Command className="rounded-none border-b-0 h-full flex flex-col pt-2">
        <div className="px-3 pb-2 pt-1">
          <CommandInput placeholder="Search projects..." autoFocus className="h-9" />
        </div>
        <CommandList className="flex-1 max-h-none overflow-y-auto overflow-x-hidden px-2 pb-2">
          <CommandEmpty className="py-6 text-center text-sm">No projects found.</CommandEmpty>
          <CommandGroup heading="Projects">
            {projects.map((proj) => (
              <CommandItem key={proj} onSelect={() => openProject(proj)} className="cursor-pointer py-2">
                <Folder className="mr-2 h-4 w-4 text-muted-foreground" />
                <span>{proj}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>

      <Separator />

      <div className="flex justify-between items-center p-2 bg-muted/20">
        <button 
          onClick={() => setSettingsOpen(true)}
          className="flex items-center text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded"
        >
          <Settings className="w-3.5 h-3.5 mr-1.5" /> Settings
        </button>
        <button 
          onClick={fetchProjects}
          className={`flex items-center text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded ${loading ? 'opacity-70' : ''}`}
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}

export default App;
