import { useEffect, useState, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';


import { Settings, RefreshCw, Folder, Box, Layers, Menu, LogOut, GitBranch, ArrowDownLeft, Download, FolderSearch, Sparkles } from 'lucide-react';
import GithubIcon from "@/components/svg/GithubIcon.tsx"
import { useSettingsStore } from './store';
import { SettingsDialog } from './SettingsDialog.tsx';
import { Separator } from "@/components/ui/separator"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type Project = {
  name: string;
  project_type: string;
  path: string;
  has_git: boolean;
  git_branch: string | null;
  git_status: string | null;
  git_ahead: number | null;
  git_behind: number | null;
  sln_files?: string[] | null;
};

type ProjectGitInfo = {
  has_git: boolean;
  git_branch: string | null;
  git_status: string | null;
  git_ahead: number | null;
  git_behind: number | null;
}

function App() {
  const { projectsDir, preferredEditor, customEditorPath, recentSlns, setRecentSln } = useSettingsStore();
  const [projects, setProjects] = useState<Project[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const [openSlnDropdown, setOpenSlnDropdown] = useState<string | null>(null);
  
  const [progressState, setProgressState] = useState<{ isOpen: boolean, current: number, total: number, title: string, description: string }>({
    isOpen: false,
    current: 0,
    total: 0,
    title: '',
    description: '',
  });
  
  const [activeGitActions, setActiveGitActions] = useState<Record<string, 'fetch' | 'pull' | 'tower' | 'finder'>>({});
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const commandListRef = useRef<HTMLDivElement>(null);

  const fetchProjects = useCallback(async () => {
    if (!projectsDir) return;
    setLoading(true);
    try {
      const baseProjects = await invoke<Project[]>('get_projects', { rootPath: projectsDir });
      
      setProjects(prevProjects => {
        const existingMap = new Map(prevProjects.map(p => [p.name, p]));
        return baseProjects.map(base => {
          const existing = existingMap.get(base.name);
          if (existing) {
            return {
              ...base,
              has_git: existing.has_git,
              git_branch: existing.git_branch,
              git_status: existing.git_status,
              git_ahead: existing.git_ahead,
              git_behind: existing.git_behind,
            };
          }
          return base;
        });
      });

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

    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [fetchProjects]);

  const openProject = async (folderName: string, specificFile: string | null = null) => {
    const folderPath = `${projectsDir.replace(/\/$/, '')}/${folderName}`;
    const editorToUse = customEditorPath || preferredEditor;
    try {
      if (specificFile) {
        setRecentSln(folderName, specificFile);
      }
      setOpenSlnDropdown(null);
      await invoke('open_project', { editor: editorToUse, folderPath, specificFile });
    } catch (e) {
      console.error(e);
    }
  };

  const executeGitAction = async (e: React.MouseEvent | React.PointerEvent, action: 'fetch' | 'pull' | 'tower' | 'finder', path: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Prevent starting another action if one is already running for this project
    if (activeGitActions[path]) return;
    
    setActiveGitActions(prev => ({ ...prev, [path]: action }));
    try {
      if (action === 'tower') {
        await invoke('open_in_tower', { path });
      } else if (action === 'fetch') {
        await invoke('git_fetch', { path });
        await fetchProjects();
      } else if (action === 'pull') {
        await invoke('git_pull', { path });
        await fetchProjects();
      } else if (action === 'finder') {
        await invoke('open_in_finder', { path });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setActiveGitActions(prev => {
        const next = { ...prev };
        delete next[path];
        return next;
      });
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

  const handleGlobalGitAction = async (action: 'refresh' | 'fetch') => {
    const gitProjects = projects.filter(p => p.has_git);
    if (!gitProjects.length) return;

    if (action === 'refresh') {
      await fetchProjects();
      return;
    }

    setProgressState({
      isOpen: true,
      current: 0,
      total: gitProjects.length,
      title: 'Fetching Repositories',
      description: 'Please wait while the process completes in the background.'
    });

    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    let completed = 0;
    
    // We execute them sequentially so we don't overwhelm the system and max out file handles/processes
    // while updating the progress bar natively.
    for (const p of gitProjects) {
      if (signal.aborted) {
        break;
      }
      try {
        if (action === 'fetch') {
          await invoke('git_fetch', { path: p.path });
        }
      } catch (error) {
        console.error(`Error on project ${p.name}:`, error);
      }
      if (signal.aborted) {
        break;
      }
      completed++;
      setProgressState(prev => ({ ...prev, current: completed }));
    }

    if (signal.aborted) {
      // already handled cleanup in cancel handler
      return;
    }

    // Give the UI a brief moment to show 100% completion before hiding
    setTimeout(async () => {
      setProgressState(prev => ({ ...prev, isOpen: false }));
      // We trigger a background refresh of the projects to update the icons and commit statuses
      await fetchProjects();
    }, 500);
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

  const shortenTheFolderName = (folderName: string) => {
    return folderName.replace("EG.Applications.", "APP:").replace("EG.Services.", "SVC:").replace("EG.HttpAggregators.", "AGG:")
  }

  return (
    <TooltipProvider delay={300}>
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      <Command className="rounded-none border-b-0 h-full flex flex-col pt-2">
        <div className="px-3 pb-2 pt-1">
          <CommandInput 
            placeholder="Search projects..." 
            autoFocus 
            className="h-9" 
            onValueChange={() => {
              if (commandListRef.current) {
                commandListRef.current.scrollTop = 0;
              }
            }}
          />
        </div>
        <CommandList ref={commandListRef} className="flex-1 max-h-none overflow-y-auto overflow-x-hidden px-2 pb-2">
          <CommandEmpty className="py-6 text-center text-sm">No projects found.</CommandEmpty>
          <CommandGroup heading="Projects">
            {projects.map((proj) => (
              <CommandItem 
                key={proj.name} 
                className="cursor-pointer py-2 group flex items-center justify-between"
                onSelect={() => {
                  if (proj.project_type === 'dotnet' && proj.sln_files && proj.sln_files.length > 1) {
                    setOpenSlnDropdown(openSlnDropdown === proj.name ? null : proj.name);
                  } else {
                    openProject(proj.name);
                  }
                }}
              >
                {proj.project_type === 'dotnet' && proj.sln_files && proj.sln_files.length > 1 ? (
                  <DropdownMenu open={openSlnDropdown === proj.name} onOpenChange={(o) => setOpenSlnDropdown(o ? proj.name : null)}>
                    <DropdownMenuTrigger className="flex flex-1 items-center min-w-0 pr-2 outline-none text-left pointer-events-none">
                      <Layers className="mr-2 h-4 w-4 shrink-0 text-blue-400" />
                      <span className="truncate flex-1">{shortenTheFolderName(proj.name)}</span>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-[380px] max-h-80 overflow-y-auto">
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-b mb-1">
                        Select Solution File
                      </div>
                      {proj.sln_files.slice().sort((a, b) => {
                          const rec = recentSlns[proj.name];
                          if (a === rec) return -1;
                          if (b === rec) return 1;
                          return a.localeCompare(b);
                      }).map(sln => (
                        <DropdownMenuItem key={sln} onClick={() => openProject(proj.name, sln)} className={sln === recentSlns[proj.name] ? "bg-accent/50 selection:bg-accent/50" : ""}>
                          <Layers className="mr-2 w-3.5 h-3.5 opacity-70" />
                          <span className="truncate text-xs">{sln.split('/').pop() || sln}</span>
                          {sln === recentSlns[proj.name] && <span className="ml-auto text-[10px] text-muted-foreground border px-1 rounded bg-background">Recent</span>}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <div className="flex flex-1 items-center min-w-0 pr-2 pointer-events-none">
                    {proj.project_type === 'node' ? (
                      <Box className="mr-2 h-4 w-4 shrink-0 text-primary" />
                    ) : proj.project_type === 'dotnet' ? (
                      <Layers className="mr-2 h-4 w-4 shrink-0 text-blue-400" />
                    ) : (
                      <Folder className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate flex-1 " >{shortenTheFolderName(proj.name)}</span>
                  </div>
                )}

                <div className="flex items-center shrink-0">
                  <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    {proj.has_git && (
                      <>
                        <Tooltip>
                          <TooltipTrigger 
                            className={`p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground inline-flex outline-none ${activeGitActions[proj.path] === 'fetch' ? 'opacity-50 cursor-not-allowed' : ''}`}
                            onClick={(e) => executeGitAction(e, 'fetch', proj.path)}
                            onPointerDown={(e) => e.stopPropagation()}
                            disabled={!!activeGitActions[proj.path]}
                          >
                            {activeGitActions[proj.path] === 'fetch' 
                              ? <RefreshCw strokeWidth={1.5} className="w-3.5 h-3.5 animate-spin" />
                              : <ArrowDownLeft strokeDasharray="2 2" strokeWidth={1.5} className="w-3.5 h-3.5" />
                            }
                          </TooltipTrigger>
                          <TooltipContent><p className="text-xs">{activeGitActions[proj.path] === 'fetch' ? 'Fetching...' : 'Fetch'}</p></TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger 
                            className={`p-1 hover:bg-muted rounded text-muted-foreground hover:text-blue-400 inline-flex outline-none ${activeGitActions[proj.path] === 'tower' ? 'opacity-50 cursor-not-allowed' : ''}`}
                            onClick={(e) => executeGitAction(e, 'tower', proj.path)}
                            onPointerDown={(e) => e.stopPropagation()}
                            disabled={!!activeGitActions[proj.path]}
                          >
                            {activeGitActions[proj.path] === 'tower'
                              ? <RefreshCw strokeWidth={1.5} className="w-3.5 h-3.5 animate-spin" />
                              : <GithubIcon className="w-3.5 h-3.5" />
                            }
                          </TooltipTrigger>
                          <TooltipContent><p className="text-xs">{activeGitActions[proj.path] === 'tower' ? 'Opening...' : 'Open in Tower'}</p></TooltipContent>
                        </Tooltip>
                      </>
                    )}

                    <Tooltip>
                      <TooltipTrigger 
                        className={`p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground inline-flex outline-none ${activeGitActions[proj.path] === 'finder' ? 'opacity-50 cursor-not-allowed' : ''}`}
                        onClick={(e) => executeGitAction(e, 'finder', proj.path)}
                        onPointerDown={(e) => e.stopPropagation()}
                        disabled={!!activeGitActions[proj.path]}
                      >
                        {activeGitActions[proj.path] === 'finder'
                          ? <RefreshCw strokeWidth={1.5} className="w-3.5 h-3.5 animate-spin" />
                          : <FolderSearch strokeWidth={1.5} className="w-3.5 h-3.5" />
                        }
                      </TooltipTrigger>
                      <TooltipContent><p className="text-xs">Reveal in Finder</p></TooltipContent>
                    </Tooltip>

                    <DropdownMenu>
                      <DropdownMenuTrigger 
                        className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground inline-flex outline-none"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        <Sparkles strokeWidth={1.5} className="w-3.5 h-3.5" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent onClick={(e) => e.stopPropagation()} align="end" className="w-40">
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-b mb-1">
                          Open in IDE
                        </div>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); invoke('open_in_ide', { path: proj.path, ide: 'Cursor' }) }}>
                          <span className="truncate">Cursor</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); invoke('open_in_ide', { path: proj.path, ide: 'Antigravity' }) }}>
                          <span className="truncate">Antigravity</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); invoke('open_in_ide', { path: proj.path, ide: 'VSCode' }) }}>
                          <span className="truncate">VSCode</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); invoke('open_in_ide', { path: proj.path, ide: 'Claude Code' }) }}>
                          <span className="truncate">Claude Code</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
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

      <Dialog open={progressState.isOpen} onOpenChange={(open) => {
        if (!open && progressState.current >= progressState.total) {
          setProgressState(prev => ({ ...prev, isOpen: false }));
        }
      }}>
        <DialogContent className="sm:max-w-md [&>button]:hidden">
          <DialogHeader>
            <DialogTitle>{progressState.title}</DialogTitle>
            <DialogDescription>
              {progressState.description}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center py-6 space-y-4">
            <div className="w-full bg-secondary rounded-full h-2.5 overflow-hidden">
              <div 
                className="bg-primary h-2.5 rounded-full transition-all duration-300 ease-out" 
                style={{ width: `${progressState.total > 0 ? (progressState.current / progressState.total) * 100 : 0}%` }}
              ></div>
            </div>
            <div className="text-sm font-medium text-muted-foreground w-full flex justify-between items-center">
              <span>Processed {progressState.current} out of {progressState.total}</span>
              <button 
                onClick={() => {
                  if (abortControllerRef.current) {
                    abortControllerRef.current.abort();
                  }
                  setProgressState(prev => ({ ...prev, isOpen: false }));
                  fetchProjects();
                }}
                className="text-xs text-destructive hover:underline px-2 py-1"
              >
                Cancel
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
    </TooltipProvider>
  );
}

export default App;
