import { useEffect, useState, useCallback } from 'react';
import type { MouseEvent } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Settings, RefreshCw, Folder, Box, Layers, Menu, LogOut, GitBranch, ArrowDownLeft, TerminalSquare, Download } from 'lucide-react';
import { useSettingsStore } from './store';
import { SettingsDialog } from './SettingsDialog.tsx';
import { Separator } from "@/components/ui/separator"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

type Project = {
  name: string;
  project_type: string;
  path: string;
  has_git: boolean;
  git_branch: string | null;
  git_status: string | null;
  git_ahead: number | null;
  git_behind: number | null;
};

type ProjectGitInfo = {
  has_git: boolean;
  git_branch: string | null;
  git_status: string | null;
  git_ahead: number | null;
  git_behind: number | null;
}

function App() {
  const { projectsDir, preferredEditor, customEditorPath } = useSettingsStore();
  const [projects, setProjects] = useState<Project[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchProjects = useCallback(async () => {
    if (!projectsDir) return;
    setLoading(true);
    try {
      const baseProjects = await invoke<Project[]>('get_projects', { rootPath: projectsDir });
      setProjects(baseProjects);

      // Fetch git info asynchronously for each project in the background
      baseProjects.forEach(async (proj) => {
        try {
          const gitInfo = await invoke<ProjectGitInfo>('get_project_git_info', { path: proj.path });
          if (gitInfo.has_git) {
            setProjects(prev => prev.map(p => p.name === proj.name ? { ...p, ...gitInfo } : p));
          }
        } catch (err) {
          console.error(`Failed to get git info for ${proj.name}`, err);
        }
      });
      
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

  const executeGitAction = async (e: MouseEvent, action: string, path: string) => {
    e.stopPropagation();
    try {
      if (action === 'tower') {
        await invoke('open_in_tower', { path });
      } else if (action === 'fetch') {
        await invoke('git_fetch', { path });
        fetchProjects();
      } else if (action === 'pull') {
        await invoke('git_pull', { path });
        fetchProjects();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const getStatusColor = (status: string | null) => {
    switch (status) {
      case 'dirty': return 'text-destructive';
      case 'ahead': return 'text-blue-400';
      case 'behind': return 'text-amber-400';
      default: return 'text-muted-foreground';
    }
  };

  const handleGlobalGitAction = async (action: 'refresh' | 'fetch' | 'checkout') => {
    const gitProjects = projects.filter(p => p.has_git);
    if (!gitProjects.length) return;

    setLoading(true);
    try {
      if (action === 'refresh') {
        await fetchProjects();
      } else if (action === 'fetch') {
        await Promise.all(gitProjects.map(p => invoke('git_fetch', { path: p.path }).catch(console.error)));
        await fetchProjects();
      } else if (action === 'checkout') {
        const branch = window.prompt("Enter branch name to checkout for all Git projects (e.g., main, development):");
        if (branch) {
          await Promise.all(gitProjects.map(p => invoke('git_checkout', { path: p.path, branch }).catch(console.error)));
          await fetchProjects();
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const [openBranchDropdown, setOpenBranchDropdown] = useState<string | null>(null);
  const [projectBranches, setProjectBranches] = useState<Record<string, string[]>>({});

  const executeBranchSwitch = async (path: string, branchName: string) => {
    setLoading(true);
    setOpenBranchDropdown(null);
    try {
      await invoke('git_checkout', { path, branch: branchName });
      await fetchProjects();
    } catch (err) {
      console.error(err);
      window.alert("Failed to switch branch: " + err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <TooltipProvider delay={300}>
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      <Command className="rounded-none border-b-0 h-full flex flex-col pt-2">
        <div className="px-3 pb-2 pt-1">
          <CommandInput placeholder="Search projects..." autoFocus className="h-9" />
        </div>
        <CommandList className="flex-1 max-h-none overflow-y-auto overflow-x-hidden px-2 pb-2">
          <CommandEmpty className="py-6 text-center text-sm">No projects found.</CommandEmpty>
          <CommandGroup heading="Projects">
            {projects.map((proj) => (
              <CommandItem key={proj.name} onSelect={() => openProject(proj.name)} className="cursor-pointer py-2 group flex items-center justify-between">
                <div className="flex items-center min-w-0 pr-2">
                  {proj.project_type === 'node' ? (
                    <Box className="mr-2 h-4 w-4 shrink-0 text-primary" />
                  ) : proj.project_type === 'dotnet' ? (
                    <Layers className="mr-2 h-4 w-4 shrink-0 text-blue-400" />
                  ) : (
                    <Folder className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate flex-1">{proj.name}</span>
                </div>

                <div className="flex items-center shrink-0">
                  <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity mr-2 shrink-0">
                    {proj.has_git && (
                      <>
                        <Tooltip>
                          <TooltipTrigger className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground inline-flex">
                            <ArrowDownLeft strokeDasharray="2 2" strokeWidth={1.5} className="w-3.5 h-3.5 text-muted-foreground" onClick={(e) => executeGitAction(e, 'fetch', proj.path)} />
                          </TooltipTrigger>
                          <TooltipContent><p className="text-xs">Fetch</p></TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground inline-flex">
                            <ArrowDownLeft strokeWidth={1.5} className="w-3.5 h-3.5 text-muted-foreground" onClick={(e) => executeGitAction(e, 'pull', proj.path)} />
                          </TooltipTrigger>
                          <TooltipContent><p className="text-xs">Pull</p></TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-blue-400 inline-flex">
                            <TerminalSquare strokeWidth={1.5} className="w-3.5 h-3.5" onClick={(e) => executeGitAction(e, 'tower', proj.path)} />
                          </TooltipTrigger>
                          <TooltipContent><p className="text-xs">Open in Tower</p></TooltipContent>
                        </Tooltip>
                      </>
                    )}
                  </div>

                  {proj.has_git && proj.git_branch && (
                    <DropdownMenu 
                      open={openBranchDropdown === proj.path} 
                      onOpenChange={(open) => {
                        if (open) {
                          if (!projectBranches[proj.path]) {
                            invoke<string[]>('get_git_branches', { path: proj.path })
                              .then(branches => setProjectBranches(prev => ({ ...prev, [proj.path]: branches })))
                              .catch(console.error);
                          }
                          setOpenBranchDropdown(proj.path);
                        } else {
                          setOpenBranchDropdown(null);
                        }
                      }}
                    >
                      <DropdownMenuTrigger 
                        className={`flex items-center text-xs space-x-1.5 px-2 py-0.5 rounded cursor-pointer transition-colors outline-none ${openBranchDropdown === proj.path ? 'bg-muted' : 'bg-muted/50 hover:bg-muted'}`}
                        title="Click to check out branch"
                      >
                        <span className={`max-w-[140px] truncate ${getStatusColor(proj.git_status)}`}>
                          {proj.git_branch}
                        </span>
                        {(proj.git_ahead || proj.git_behind) && (
                          <span className="flex items-center space-x-1 text-[10px] font-medium opacity-80 pl-1 border-l border-border/50">
                            {proj.git_behind !== null && proj.git_behind > 0 ? <span className="text-amber-400">↓{proj.git_behind}</span> : null}
                            {proj.git_ahead !== null && proj.git_ahead > 0 ? <span className="text-blue-400">↑{proj.git_ahead}</span> : null}
                          </span>
                        )}
                      </DropdownMenuTrigger>
                      <DropdownMenuContent onClick={(e) => e.stopPropagation()} align="end" className="w-56 max-h-64 overflow-y-auto">
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-b mb-1">
                          Switch Branch
                        </div>
                        {projectBranches[proj.path]?.map(b => (
                          <DropdownMenuItem key={b} onClick={() => executeBranchSwitch(proj.path, b)} className={b === proj.git_branch ? "bg-accent text-accent-foreground font-medium" : ""}>
                            <GitBranch className="mr-2 w-3.5 h-3.5 opacity-70" />
                            <span className="truncate">{b}</span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
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
            <DropdownMenuItem onClick={() => handleGlobalGitAction('refresh')}>
              <RefreshCw className="mr-2 w-4 h-4 text-muted-foreground" />
              <span>Refresh Git Status</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleGlobalGitAction('fetch')}>
              <Download className="mr-2 w-4 h-4 text-muted-foreground" />
              <span>Fetch All repos</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleGlobalGitAction('checkout')}>
              <GitBranch className="mr-2 w-4 h-4 text-muted-foreground" />
              <span>Checkout All branch...</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
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
    </TooltipProvider>
  );
}

export default App;
