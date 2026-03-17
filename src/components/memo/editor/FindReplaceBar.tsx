import { useState, useCallback, useRef, useEffect } from 'react';
import { Editor } from '@tiptap/react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { X, ChevronUp, ChevronDown, Replace } from 'lucide-react';

interface FindReplaceBarProps {
  editor: Editor;
  onClose: () => void;
}

const FindReplaceBar = ({ editor, onClose }: FindReplaceBarProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [replaceTerm, setReplaceTerm] = useState('');
  const [matches, setMatches] = useState<number>(0);
  const [currentMatch, setCurrentMatch] = useState<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSearch = useCallback((term: string) => {
    setSearchTerm(term);
    if (!term) {
      setMatches(0);
      setCurrentMatch(0);
      // Clear any decorations
      return;
    }
    // Simple count of matches in text content
    const text = editor.getText();
    const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const found = text.match(regex);
    setMatches(found?.length || 0);
    setCurrentMatch(found && found.length > 0 ? 1 : 0);
  }, [editor]);

  const handleReplace = () => {
    if (!searchTerm) return;
    const { state } = editor;
    const { from, to } = state.selection;
    const selectedText = state.doc.textBetween(from, to);
    if (selectedText.toLowerCase() === searchTerm.toLowerCase()) {
      editor.chain().focus().insertContent(replaceTerm).run();
    }
  };

  const handleReplaceAll = () => {
    if (!searchTerm) return;
    const html = editor.getHTML();
    const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const newHtml = html.replace(regex, replaceTerm);
    editor.commands.setContent(newHtml);
    setMatches(0);
    setCurrentMatch(0);
  };

  return (
    <div className="flex items-center gap-2 p-2 border-b border-input bg-muted/30">
      <div className="flex items-center gap-1 flex-1">
        <Input
          ref={inputRef}
          value={searchTerm}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Find..."
          className="h-7 text-xs w-40"
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
          }}
        />
        <span className="text-xs text-muted-foreground min-w-[50px]">
          {matches > 0 ? `${currentMatch}/${matches}` : searchTerm ? '0 results' : ''}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <Input
          value={replaceTerm}
          onChange={(e) => setReplaceTerm(e.target.value)}
          placeholder="Replace..."
          className="h-7 text-xs w-40"
        />
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={handleReplace} title="Replace">
          <Replace className="h-3 w-3" />
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={handleReplaceAll}>
          All
        </Button>
      </div>
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
};

export default FindReplaceBar;
