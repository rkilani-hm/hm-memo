import { Editor } from '@tiptap/react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  Bold, Italic, UnderlineIcon, Link2, TableIcon, RemoveFormatting,
  Scissors, Copy, Clipboard,
} from 'lucide-react';

interface EditorContextMenuProps {
  editor: Editor;
  children: React.ReactNode;
}

const EditorContextMenu = ({ editor, children }: EditorContextMenuProps) => {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={() => document.execCommand('cut')}>
          <Scissors className="h-3.5 w-3.5 mr-2" /> Cut
        </ContextMenuItem>
        <ContextMenuItem onClick={() => document.execCommand('copy')}>
          <Copy className="h-3.5 w-3.5 mr-2" /> Copy
        </ContextMenuItem>
        <ContextMenuItem onClick={() => navigator.clipboard.readText().then(t => editor.chain().focus().insertContent(t).run())}>
          <Clipboard className="h-3.5 w-3.5 mr-2" /> Paste
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="h-3.5 w-3.5 mr-2" /> Bold
        </ContextMenuItem>
        <ContextMenuItem onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="h-3.5 w-3.5 mr-2" /> Italic
        </ContextMenuItem>
        <ContextMenuItem onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <UnderlineIcon className="h-3.5 w-3.5 mr-2" /> Underline
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem onClick={() => {
          const url = prompt('Enter link URL:');
          if (url) editor.chain().focus().setLink({ href: url, target: '_blank' }).run();
        }}>
          <Link2 className="h-3.5 w-3.5 mr-2" /> Insert Link
        </ContextMenuItem>
        <ContextMenuItem onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
          <TableIcon className="h-3.5 w-3.5 mr-2" /> Insert Table
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}>
          <RemoveFormatting className="h-3.5 w-3.5 mr-2" /> Remove Formatting
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};

export default EditorContextMenu;
