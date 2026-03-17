import { Editor } from '@tiptap/react';

interface StatusBarProps {
  editor: Editor;
}

const StatusBar = ({ editor }: StatusBarProps) => {
  const chars = editor.storage.characterCount?.characters() ?? 0;
  const words = editor.storage.characterCount?.words() ?? 0;

  // Approximate cursor position
  const { from } = editor.state.selection;
  const resolvedPos = editor.state.doc.resolve(from);
  // Count lines by walking through the doc
  let line = 1;
  let col = 1;
  let counted = 0;
  editor.state.doc.descendants((node, pos) => {
    if (pos >= from) return false;
    if (node.isBlock && pos > 0) line++;
    return true;
  });
  col = from - resolvedPos.start() + 1;

  return (
    <div className="flex items-center justify-between px-3 py-1 border-t border-input bg-muted/30 text-[10px] text-muted-foreground select-none">
      <div className="flex items-center gap-4">
        <span>Words: {words}</span>
        <span>Characters: {chars}</span>
      </div>
      <span>Line {line}, Col {col}</span>
    </div>
  );
};

export default StatusBar;
