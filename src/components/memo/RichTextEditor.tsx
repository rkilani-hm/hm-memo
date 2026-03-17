import { useState, useEffect, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import TextStyle from '@tiptap/extension-text-style';
import FontFamily from '@tiptap/extension-font-family';
import { Color } from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import SubScript from '@tiptap/extension-subscript';
import SuperScript from '@tiptap/extension-superscript';
import CharacterCount from '@tiptap/extension-character-count';
import Typography from '@tiptap/extension-typography';
import Placeholder from '@tiptap/extension-placeholder';
import FontSize from './editor/FontSizeExtension';
import LineHeight from './editor/LineHeightExtension';
import IndentExtension from './editor/IndentExtension';
import EditorToolbar from './editor/EditorToolbar';
import FindReplaceBar from './editor/FindReplaceBar';
import StatusBar from './editor/StatusBar';
import EditorContextMenu from './editor/EditorContextMenu';
import { cn } from '@/lib/utils';

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

const RichTextEditor = ({ content, onChange, placeholder }: RichTextEditorProps) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showFindReplace, setShowFindReplace] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
      }),
      Underline,
      TextStyle,
      FontFamily,
      FontSize,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
      Image,
      TaskList,
      TaskItem.configure({ nested: true }),
      SubScript,
      SuperScript,
      CharacterCount,
      Typography,
      LineHeight,
      IndentExtension,
      Placeholder.configure({
        placeholder: placeholder || 'Start typing...',
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'rich-text-editor-content',
        spellcheck: 'true',
      },
      handleKeyDown: (_view, event) => {
        // Ctrl+F for find
        if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
          event.preventDefault();
          setShowFindReplace(true);
          return true;
        }
        // Ctrl+] indent, Ctrl+[ outdent
        if ((event.ctrlKey || event.metaKey) && event.key === ']') {
          event.preventDefault();
          editor?.commands.indent();
          return true;
        }
        if ((event.ctrlKey || event.metaKey) && event.key === '[') {
          event.preventDefault();
          editor?.commands.outdent();
          return true;
        }
        return false;
      },
    },
  });

  // Sync external content changes
  useEffect(() => {
    if (editor && content && editor.getHTML() !== content) {
      editor.commands.setContent(content, false);
    }
  }, [editor, content]);

  // Escape fullscreen
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) setIsFullscreen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isFullscreen]);

  if (!editor) return null;

  return (
    <div
      className={cn(
        'border border-input rounded-md overflow-hidden bg-background flex flex-col',
        isFullscreen && 'fixed inset-0 z-50 rounded-none border-0'
      )}
    >
      <EditorToolbar
        editor={editor}
        isFullscreen={isFullscreen}
        onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
        onToggleFindReplace={() => setShowFindReplace(!showFindReplace)}
      />

      {showFindReplace && (
        <FindReplaceBar editor={editor} onClose={() => setShowFindReplace(false)} />
      )}

      <EditorContextMenu editor={editor}>
        <div className={cn(
          'overflow-y-auto',
          isFullscreen ? 'flex-1' : 'max-h-[600px]'
        )}>
          <div className="mx-auto bg-background shadow-sm" style={{
            maxWidth: isFullscreen ? '800px' : 'none',
            minHeight: isFullscreen ? '100%' : '400px',
          }}>
            <EditorContent editor={editor} />
          </div>
        </div>
      </EditorContextMenu>

      <StatusBar editor={editor} />
    </div>
  );
};

export default RichTextEditor;
