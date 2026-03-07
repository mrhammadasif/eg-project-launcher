import { useEffect, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Settings, RefreshCw, Folder, Box, Layers, Menu, LogOut } from 'lucide-react';
import { useSettingsStore } from './store';
import { SettingsDialog } from './SettingsDialog.tsx';
import { Separator } from "@/components/ui/separator"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

type Project = {
  name: string;
  project_type: string;
};

function App() {
  const { projectsDir, preferredEditor, customEditorPath } = useSettingsStore();
  const [projects, setProjects] = useState<Project[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchProjects = useCallback(async () => {
    if (!projectsDir) return;
    setLoading(true);
    try {
      const result = await invoke<Project[]>('get_projects', { rootPath: projectsDir });
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
              <CommandItem key={proj.name} onSelect={() => openProject(proj.name)} className="cursor-pointer py-2">
                {proj.project_type === 'node' ? (
                  <Box className="mr-2 h-4 w-4 text-primary" />
                ) : proj.project_type === 'dotnet' ? (
                  <Layers className="mr-2 h-4 w-4 text-blue-400" />
                ) : (
                  <Folder className="mr-2 h-4 w-4 text-muted-foreground" />
                )}
                <span>{proj.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>

      <Separator />

      <div className="flex justify-between items-center p-2 bg-muted/20">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center justify-center p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
            <Menu className="w-4 h-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
              <Settings className="mr-2 w-4 h-4 text-muted-foreground" />
              <span>Settings</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => invoke('quit_app')}>
              <LogOut className="mr-2 w-4 h-4 text-destructive" />
              <span className="text-destructive">Quit Launcher</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
