import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, X, FileText, FileImage, FileSpreadsheet, File } from 'lucide-react';

interface FileAttachment {
  file: File;
  id: string;
}

interface FileUploadProps {
  files: FileAttachment[];
  onChange: (files: FileAttachment[]) => void;
  maxSizeMB?: number;
}

const getFileIcon = (type: string) => {
  if (type.startsWith('image/')) return FileImage;
  if (type.includes('spreadsheet') || type.includes('excel') || type.includes('csv')) return FileSpreadsheet;
  if (type.includes('pdf') || type.includes('document') || type.includes('word')) return FileText;
  return File;
};

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const FileUpload = ({ files, onChange, maxSizeMB = 25 }: FileUploadProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const addFiles = (newFiles: FileList | null) => {
    if (!newFiles) return;
    const maxBytes = maxSizeMB * 1024 * 1024;
    const validFiles: FileAttachment[] = [];

    for (let i = 0; i < newFiles.length; i++) {
      const file = newFiles[i];
      if (file.size <= maxBytes) {
        validFiles.push({ file, id: crypto.randomUUID() });
      }
    }

    onChange([...files, ...validFiles]);
  };

  const removeFile = (id: string) => {
    onChange(files.filter((f) => f.id !== id));
  };

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        className={`border-2 border-dashed rounded-md p-6 text-center cursor-pointer transition-colors ${
          dragOver ? 'border-accent bg-accent/5' : 'border-input hover:border-accent/50'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          addFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Drag & drop files here, or <span className="text-accent font-medium">browse</span>
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Max {maxSizeMB}MB per file • PDF, Word, Excel, Images, ZIP
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.zip,.rar,.txt,.csv"
        />
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((attachment) => {
            const Icon = getFileIcon(attachment.file.type);
            return (
              <div
                key={attachment.id}
                className="flex items-center gap-3 p-2 rounded-md border border-input bg-muted/20"
              >
                <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{attachment.file.name}</p>
                  <p className="text-xs text-muted-foreground">{formatFileSize(attachment.file.size)}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => removeFile(attachment.id)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground">
            {files.length} attachment{files.length !== 1 ? 's' : ''}
          </p>
        </div>
      )}
    </div>
  );
};

export default FileUpload;
export type { FileAttachment };
