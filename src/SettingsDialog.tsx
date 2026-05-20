import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PREFERRED_EDITOR, PREFERRED_EDITORS, isPreferredEditor, useSettingsStore } from './store';

export function SettingsDialog({ open: isOpen, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) {
  const { projectsDir, preferredEditor, setPreferredEditor } = useSettingsStore();
  const selectedPreferredEditor = isPreferredEditor(preferredEditor)
    ? preferredEditor
    : PREFERRED_EDITOR.VISUAL_STUDIO_CODE;

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
            <Input
              id="projectsDir"
              value={projectsDir}
              readOnly
              disabled
              placeholder="Configured in config.yaml"
            />
            <p className="text-xs text-muted-foreground">Change config.yaml and rebuild the app to update this folder.</p>
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
