import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useSettingsStore } from './store';
import { open } from '@tauri-apps/plugin-dialog';

export function SettingsDialog({ open: isOpen, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) {
  const { projectsDir, preferredEditor, customEditorPath, setProjectsDir, setPreferredEditor, setCustomEditorPath } = useSettingsStore();

  const handleSelectDir = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath: projectsDir || undefined,
      });
      if (selected && typeof selected === 'string') {
        setProjectsDir(selected);
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Configure your project directory and default code editor.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 py-2">
          <div className="grid gap-2">
            <Label htmlFor="projectsDir">Projects Root Folder</Label>
            <div className="flex gap-2">
              <Input 
                id="projectsDir" 
                value={projectsDir} 
                onChange={(e) => setProjectsDir(e.target.value)} 
                placeholder="~/Projects"
              />
              <Button type="button" variant="secondary" onClick={handleSelectDir}>Browse</Button>
            </div>
          </div>
          
          <div className="grid gap-2">
            <Label htmlFor="preferredEditor">Preferred Editor App Name</Label>
            <Input 
              id="preferredEditor" 
              value={preferredEditor} 
              onChange={(e) => setPreferredEditor(e.target.value)} 
              placeholder="Visual Studio Code"
            />
            <p className="text-[11px] text-muted-foreground">Examples: "Visual Studio Code", "Cursor", "WebStorm"</p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="customEditorPath">Custom Editor Path (Optional)</Label>
            <Input 
              id="customEditorPath" 
              value={customEditorPath} 
              onChange={(e) => setCustomEditorPath(e.target.value)} 
              placeholder="/Applications/Cursor.app/Contents/MacOS/Cursor"
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
