import { useState, useCallback, useRef, useEffect } from 'react';
import { Editor } from '@tiptap/react';
import { Button } from '@/components/ui/button';

// TipTap 2.11.x module augmentation doesn't always resolve; cast chain to any
const cmd = (editor: Editor) => (editor.chain().focus() as any);
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  Bold, Italic, UnderlineIcon, Strikethrough,
  Subscript, Superscript, RemoveFormatting,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, CheckSquare,
  Indent, Outdent,
  Table as TableIcon, Minus, Link2, ImageIcon, SmilePlus,
  Undo, Redo,
  Maximize, Search,
  ChevronDown, Type, Palette, Highlighter,
  Rows3, Columns3, Trash2, Plus,
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight,
} from 'lucide-react';

const FONT_FAMILIES = [
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Times New Roman', value: '"Times New Roman", serif' },
  { label: 'Calibri', value: 'Calibri, sans-serif' },
  { label: 'Century Gothic', value: '"Century Gothic", sans-serif' },
  { label: 'Courier New', value: '"Courier New", monospace' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Verdana', value: 'Verdana, sans-serif' },
  { label: 'Tahoma', value: 'Tahoma, sans-serif' },
];

const FONT_SIZES = ['8', '9', '10', '11', '12', '14', '16', '18', '20', '24', '28', '32', '36', '48', '72'];

const LINE_HEIGHTS = [
  { label: '1.0', value: '1' },
  { label: '1.15', value: '1.15' },
  { label: '1.5', value: '1.5' },
  { label: '2.0', value: '2' },
];

const HEADING_OPTIONS = [
  { label: 'Normal', value: 'paragraph' },
  { label: 'Heading 1', value: 'h1' },
  { label: 'Heading 2', value: 'h2' },
  { label: 'Heading 3', value: 'h3' },
  { label: 'Heading 4', value: 'h4' },
  { label: 'Quote', value: 'blockquote' },
  { label: 'Code Block', value: 'codeBlock' },
];

const PRESET_COLORS = [
  '#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#efefef', '#f3f3f3', '#ffffff',
  '#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff',
  '#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc',
  '#dd7e6b', '#ea9999', '#f9cb9c', '#ffe599', '#b6d7a8', '#a2c4c9', '#a4c2f4', '#9fc5e8', '#b4a7d6', '#d5a6bd',
  '#cc4125', '#e06666', '#f6b26b', '#ffd966', '#93c47d', '#76a5af', '#6d9eeb', '#6fa8dc', '#8e7cc3', '#c27ba0',
  '#a61c00', '#cc0000', '#e69138', '#f1c232', '#6aa84f', '#45818e', '#3c78d8', '#3d85c6', '#674ea7', '#a64d79',
  '#85200c', '#990000', '#b45f06', '#bf9000', '#38761d', '#134f5c', '#1155cc', '#0b5394', '#351c75', '#741b47',
];

interface ToolbarProps {
  editor: Editor;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onToggleFindReplace: () => void;
}

const ToolbarButton = ({
  onClick,
  active,
  disabled,
  children,
  title,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  title: string;
}) => (
  <Button
    type="button"
    variant="ghost"
    size="icon"
    className={cn('h-7 w-7 rounded-sm', active && 'bg-accent text-accent-foreground')}
    onClick={onClick}
    disabled={disabled}
    title={title}
  >
    {children}
  </Button>
);

const ColorPickerPopover = ({
  icon,
  title,
  currentColor,
  onSelect,
}: {
  icon: React.ReactNode;
  title: string;
  currentColor: string | undefined;
  onSelect: (color: string) => void;
}) => {
  const [customColor, setCustomColor] = useState(currentColor || '#000000');
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 rounded-sm relative"
          title={title}
        >
          {icon}
          <div
            className="absolute bottom-0.5 left-1 right-1 h-0.5 rounded"
            style={{ backgroundColor: currentColor || '#000000' }}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <div className="grid grid-cols-10 gap-0.5 mb-2">
          {PRESET_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className={cn(
                'w-5 h-5 rounded-sm border border-border hover:scale-125 transition-transform',
                currentColor === color && 'ring-2 ring-primary'
              )}
              style={{ backgroundColor: color }}
              onClick={() => onSelect(color)}
            />
          ))}
        </div>
        <div className="flex items-center gap-1 mt-1">
          <Input
            type="color"
            value={customColor}
            onChange={(e) => setCustomColor(e.target.value)}
            className="w-8 h-7 p-0 border-0 cursor-pointer"
          />
          <Input
            value={customColor}
            onChange={(e) => setCustomColor(e.target.value)}
            placeholder="#000000"
            className="h-7 text-xs flex-1"
          />
          <Button
            type="button"
            size="sm"
            className="h-7 text-xs px-2"
            onClick={() => onSelect(customColor)}
          >
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

const TablePickerPopover = ({ editor }: { editor: Editor }) => {
  const [hoverRow, setHoverRow] = useState(0);
  const [hoverCol, setHoverCol] = useState(0);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 rounded-sm" title="Insert Table">
          <TableIcon className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start">
        <p className="text-xs text-muted-foreground mb-1">
          {hoverRow > 0 ? `${hoverRow} × ${hoverCol}` : 'Select size'}
        </p>
        <div className="grid gap-0.5" style={{ gridTemplateColumns: 'repeat(8, 1fr)' }}>
          {Array.from({ length: 8 }, (_, r) =>
            Array.from({ length: 8 }, (_, c) => (
              <button
                key={`${r}-${c}`}
                type="button"
                className={cn(
                  'w-4 h-4 border rounded-[2px] transition-colors',
                  r < hoverRow && c < hoverCol
                    ? 'bg-primary/30 border-primary'
                    : 'bg-background border-border'
                )}
                onMouseEnter={() => { setHoverRow(r + 1); setHoverCol(c + 1); }}
                onClick={() => editor.chain().focus().insertTable({ rows: r + 1, cols: c + 1, withHeaderRow: true }).run()}
              />
            ))
          )}
        </div>
        {editor.isActive('table') && (
          <>
            <Separator className="my-2" />
            <div className="space-y-0.5">
              <Button type="button" variant="ghost" size="sm" className="w-full justify-start h-7 text-xs" onClick={() => editor.chain().focus().addRowBefore().run()}>
                <ArrowUp className="h-3 w-3 mr-1.5" /> Add Row Above
              </Button>
              <Button type="button" variant="ghost" size="sm" className="w-full justify-start h-7 text-xs" onClick={() => editor.chain().focus().addRowAfter().run()}>
                <ArrowDown className="h-3 w-3 mr-1.5" /> Add Row Below
              </Button>
              <Button type="button" variant="ghost" size="sm" className="w-full justify-start h-7 text-xs" onClick={() => editor.chain().focus().addColumnBefore().run()}>
                <ArrowLeft className="h-3 w-3 mr-1.5" /> Add Column Left
              </Button>
              <Button type="button" variant="ghost" size="sm" className="w-full justify-start h-7 text-xs" onClick={() => editor.chain().focus().addColumnAfter().run()}>
                <ArrowRight className="h-3 w-3 mr-1.5" /> Add Column Right
              </Button>
              <Separator className="my-1" />
              <Button type="button" variant="ghost" size="sm" className="w-full justify-start h-7 text-xs" onClick={() => editor.chain().focus().mergeCells().run()}>
                <Rows3 className="h-3 w-3 mr-1.5" /> Merge Cells
              </Button>
              <Button type="button" variant="ghost" size="sm" className="w-full justify-start h-7 text-xs" onClick={() => editor.chain().focus().splitCell().run()}>
                <Columns3 className="h-3 w-3 mr-1.5" /> Split Cell
              </Button>
              <Separator className="my-1" />
              <Button type="button" variant="ghost" size="sm" className="w-full justify-start h-7 text-xs text-destructive" onClick={() => editor.chain().focus().deleteRow().run()}>
                <Trash2 className="h-3 w-3 mr-1.5" /> Delete Row
              </Button>
              <Button type="button" variant="ghost" size="sm" className="w-full justify-start h-7 text-xs text-destructive" onClick={() => editor.chain().focus().deleteColumn().run()}>
                <Trash2 className="h-3 w-3 mr-1.5" /> Delete Column
              </Button>
              <Button type="button" variant="ghost" size="sm" className="w-full justify-start h-7 text-xs text-destructive" onClick={() => editor.chain().focus().deleteTable().run()}>
                <Trash2 className="h-3 w-3 mr-1.5" /> Delete Table
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
};

const LinkPopover = ({ editor }: { editor: Editor }) => {
  const [url, setUrl] = useState('');
  const [open, setOpen] = useState(false);

  const handleSubmit = () => {
    if (url) {
      editor.chain().focus().setLink({ href: url, target: '_blank' }).run();
    } else {
      editor.chain().focus().unsetLink().run();
    }
    setOpen(false);
    setUrl('');
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o && editor.isActive('link')) setUrl(editor.getAttributes('link').href || ''); }}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className={cn('h-7 w-7 rounded-sm', editor.isActive('link') && 'bg-accent')} title="Insert Link (Ctrl+K)">
          <Link2 className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start">
        <div className="space-y-2">
          <Input
            placeholder="https://example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            className="h-8 text-sm"
          />
          <div className="flex gap-1">
            <Button type="button" size="sm" className="h-7 text-xs flex-1" onClick={handleSubmit}>
              {editor.isActive('link') ? 'Update' : 'Insert'} Link
            </Button>
            {editor.isActive('link') && (
              <Button type="button" variant="destructive" size="sm" className="h-7 text-xs" onClick={() => { editor.chain().focus().unsetLink().run(); setOpen(false); }}>
                Remove
              </Button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

const EditorToolbar = ({ editor, isFullscreen, onToggleFullscreen, onToggleFindReplace }: ToolbarProps) => {
  const getCurrentFontFamily = () => {
    const attrs = editor.getAttributes('textStyle');
    return attrs.fontFamily || '';
  };

  const getCurrentFontSize = () => {
    const attrs = editor.getAttributes('textStyle');
    return attrs.fontSize?.replace('px', '') || '11';
  };

  const getCurrentHeading = () => {
    if (editor.isActive('heading', { level: 1 })) return 'h1';
    if (editor.isActive('heading', { level: 2 })) return 'h2';
    if (editor.isActive('heading', { level: 3 })) return 'h3';
    if (editor.isActive('heading', { level: 4 })) return 'h4';
    if (editor.isActive('blockquote')) return 'blockquote';
    if (editor.isActive('codeBlock')) return 'codeBlock';
    return 'paragraph';
  };

  const setHeading = (value: string) => {
    switch (value) {
      case 'h1': cmd(editor).toggleHeading({ level: 1 }).run(); break;
      case 'h2': cmd(editor).toggleHeading({ level: 2 }).run(); break;
      case 'h3': cmd(editor).toggleHeading({ level: 3 }).run(); break;
      case 'h4': cmd(editor).toggleHeading({ level: 4 }).run(); break;
      case 'blockquote': cmd(editor).toggleBlockquote().run(); break;
      case 'codeBlock': cmd(editor).toggleCodeBlock().run(); break;
      default: cmd(editor).setParagraph().run(); break;
    }
  };

  const handleImageInsert = () => {
    const url = prompt('Enter image URL:');
    if (url) {
      cmd(editor).setImage({ src: url }).run();
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-0.5 p-1 border-b border-input bg-muted/40 sticky top-0 z-10">
      {/* Heading / Style */}
      <Select value={getCurrentHeading()} onValueChange={setHeading}>
        <SelectTrigger className="h-7 w-[110px] text-xs border-0 bg-transparent shadow-none">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {HEADING_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} className="text-xs">
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Separator orientation="vertical" className="h-5 mx-0.5" />

      {/* Font Family */}
      <Select value={getCurrentFontFamily()} onValueChange={(v) => cmd(editor).setFontFamily(v).run()}>
        <SelectTrigger className="h-7 w-[120px] text-xs border-0 bg-transparent shadow-none">
          <SelectValue placeholder="Font" />
        </SelectTrigger>
        <SelectContent>
          {FONT_FAMILIES.map((f) => (
            <SelectItem key={f.value} value={f.value} className="text-xs" style={{ fontFamily: f.value }}>
              {f.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Font Size */}
      <Select value={getCurrentFontSize()} onValueChange={(v) => editor.chain().focus().setFontSize(`${v}px`).run()}>
        <SelectTrigger className="h-7 w-[60px] text-xs border-0 bg-transparent shadow-none">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {FONT_SIZES.map((s) => (
            <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Separator orientation="vertical" className="h-5 mx-0.5" />

      {/* Text Formatting */}
      <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold (Ctrl+B)">
        <Bold className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic (Ctrl+I)">
        <Italic className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Underline (Ctrl+U)">
        <UnderlineIcon className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Strikethrough">
        <Strikethrough className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleSubscript().run()} active={editor.isActive('subscript')} title="Subscript">
        <Subscript className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleSuperscript().run()} active={editor.isActive('superscript')} title="Superscript">
        <Superscript className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
        title="Clear Formatting"
      >
        <RemoveFormatting className="h-3.5 w-3.5" />
      </ToolbarButton>

      <Separator orientation="vertical" className="h-5 mx-0.5" />

      {/* Colors */}
      <ColorPickerPopover
        icon={<Type className="h-3.5 w-3.5" />}
        title="Font Color"
        currentColor={editor.getAttributes('textStyle').color}
        onSelect={(color) => editor.chain().focus().setColor(color).run()}
      />
      <ColorPickerPopover
        icon={<Highlighter className="h-3.5 w-3.5" />}
        title="Highlight Color"
        currentColor={editor.getAttributes('highlight').color}
        onSelect={(color) => editor.chain().focus().toggleHighlight({ color }).run()}
      />

      <Separator orientation="vertical" className="h-5 mx-0.5" />

      {/* Alignment */}
      <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="Align Left">
        <AlignLeft className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="Align Center">
        <AlignCenter className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="Align Right">
        <AlignRight className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('justify').run()} active={editor.isActive({ textAlign: 'justify' })} title="Justify">
        <AlignJustify className="h-3.5 w-3.5" />
      </ToolbarButton>

      {/* Line Height */}
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 rounded-sm" title="Line Spacing">
            <div className="flex flex-col items-center text-[8px] leading-none font-bold">
              <span>≡</span>
              <ChevronDown className="h-2 w-2" />
            </div>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-32 p-1" align="start">
          {LINE_HEIGHTS.map((lh) => (
            <Button
              key={lh.value}
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-start h-7 text-xs"
              onClick={() => editor.chain().focus().setLineHeight(lh.value).run()}
            >
              {lh.label}
            </Button>
          ))}
        </PopoverContent>
      </Popover>

      <Separator orientation="vertical" className="h-5 mx-0.5" />

      {/* Indent */}
      <ToolbarButton onClick={() => editor.chain().focus().indent().run()} title="Increase Indent (Ctrl+])">
        <Indent className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().outdent().run()} title="Decrease Indent (Ctrl+[)">
        <Outdent className="h-3.5 w-3.5" />
      </ToolbarButton>

      <Separator orientation="vertical" className="h-5 mx-0.5" />

      {/* Lists */}
      <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet List">
        <List className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Numbered List">
        <ListOrdered className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleTaskList().run()} active={editor.isActive('taskList')} title="Task List">
        <CheckSquare className="h-3.5 w-3.5" />
      </ToolbarButton>

      <Separator orientation="vertical" className="h-5 mx-0.5" />

      {/* Insert */}
      <TablePickerPopover editor={editor} />
      <ToolbarButton onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Horizontal Rule">
        <Minus className="h-3.5 w-3.5" />
      </ToolbarButton>
      <LinkPopover editor={editor} />
      <ToolbarButton onClick={handleImageInsert} title="Insert Image">
        <ImageIcon className="h-3.5 w-3.5" />
      </ToolbarButton>

      <Separator orientation="vertical" className="h-5 mx-0.5" />

      {/* History */}
      <ToolbarButton onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Undo (Ctrl+Z)">
        <Undo className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Redo (Ctrl+Y)">
        <Redo className="h-3.5 w-3.5" />
      </ToolbarButton>

      <div className="flex-1" />

      {/* View */}
      <ToolbarButton onClick={onToggleFindReplace} title="Find & Replace (Ctrl+F)">
        <Search className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton onClick={onToggleFullscreen} active={isFullscreen} title="Fullscreen">
        <Maximize className="h-3.5 w-3.5" />
      </ToolbarButton>
    </div>
  );
};

export default EditorToolbar;
