import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PREFERRED_EDITOR, PREFERRED_EDITORS, isPreferredEditor, useSettingsStore } from './store';
import { open } from '@tauri-apps/plugin-dialog';

export function SettingsDialog({ open: isOpen, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) {
  const { projectsDir, preferredEditor, setProjectsDir, setPreferredEditor } = useSettingsStore();
  const selectedPreferredEditor = isPreferredEditor(preferredEditor)
    ? preferredEditor
    : PREFERRED_EDITOR.VISUAL_STUDIO_CODE;

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
            <Label htmlFor="preferredEditor">Default Editor</Label>
            <Select
              value={selectedPreferredEditor}
              onValueChange={(value) => {
                if (value && isPreferredEditor(value)) {
                  setPreferredEditor(value);
                }
              }}
            >
              <SelectTrigger id="preferredEditor" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PREFERRED_EDITORS.map((editor) => (
                  <SelectItem key={editor} value={editor}>
                    {editor}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
