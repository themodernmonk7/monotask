import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  StickyNote,
  Plus,
  Trash2,
  CheckCircle2,
  CornerDownLeft,
  Pencil,
  Check,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

function NoteItem({
  note,
  onToggle,
  onUpdate,
  onRemove,
}: {
  note: { id: string; text: string; checked: boolean };
  onToggle: (id: string) => void;
  onUpdate: (id: string, text: string) => void;
  onRemove: (id: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState(note.text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(
        textareaRef.current.value.length,
        textareaRef.current.value.length,
      );
    }
  }, [isEditing]);

  const handleSave = () => {
    const trimmed = editedText.trim();
    if (trimmed && trimmed !== note.text) {
      onUpdate(note.id, trimmed);
    } else {
      setEditedText(note.text);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSave();
    }
    if (e.key === 'Escape') {
      setEditedText(note.text);
      setIsEditing(false);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20, filter: 'blur(10px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      exit={{ opacity: 0, scale: 0.9, filter: 'blur(10px)' }}
      className="group/note"
    >
      <Card
        className={cn(
          'flex flex-row items-start gap-5 px-6 transition-all duration-500 border-white/5 shadow-sm relative overflow-hidden ',
          note.checked
            ? 'bg-white/1 opacity-60'
            : 'bg-card/60 hover:bg-card hover:shadow-xl hover:border-white/10',
        )}
      >
        {/* Content on left */}
        <div className="flex items-start gap-5 flex-1 min-w-0">
          <div
            role="button"
            tabIndex={0}
            onClick={() => {
              onToggle(note.id);
              setIsEditing(false);
            }}
            className={cn(
              'relative flex items-center justify-center w-6 h-6 cursor-pointer rounded-xl border transition-all duration-500 shrink-0 mt-0.5',
              note.checked
                ? 'bg-primary border-primary shadow-[0_0_15px_oklch(var(--primary)_/_40%)]'
                : 'bg-background border-white/20 hover:border-primary/50',
            )}
          >
            <AnimatePresence>
              {note.checked && (
                <motion.div
                  initial={{ scale: 0, rotate: -20 }}
                  animate={{ scale: 1, rotate: 0 }}
                  exit={{ scale: 0, rotate: 20 }}
                >
                  <CheckCircle2 className="w-4 h-4 text-primary-foreground stroke-2" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {isEditing ? (
            <div className="flex-1 space-y-2">
              <Textarea
                ref={textareaRef}
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                onKeyDown={handleKeyDown}
                className="bg-background/50 border-primary/30 focus-visible:ring-primary/20 min-h-[80px] text-base leading-relaxed p-3 resize-none"
              />
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-widest flex items-center gap-1">
                  <CornerDownLeft className="w-3 h-3" /> Cmd + Enter to save
                </span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditedText(note.text);
                      setIsEditing(false);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleSave} className="h-8 px-3">
                    <Check className="w-3.5 h-3.5 mr-1" /> Save
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center gap-2 group/text">
              <span
                className={cn(
                  'flex-1 text-base font-medium leading-relaxed transition-all duration-500 whitespace-pre-wrap cursor-text',
                  note.checked
                    ? 'text-muted-foreground line-through decoration-primary/30'
                    : 'text-foreground/90 group-hover/note:text-foreground',
                )}
                onClick={() => setIsEditing(true)}
              >
                {note.text}
              </span>
            </div>
          )}
        </div>

        {/* Delete button on right */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <div>
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditing(true);
                }}
                className="size-9 mt-0.5 shrink-0 text-muted-foreground/40 hover:text-muted-foreground "
              >
                <Pencil className="w-3 h-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-all z-20 shrink-0"
                title="Delete note"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </AlertDialogTrigger>

          <AlertDialogContent className="bg-card border-white/5 backdrop-blur-xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Note?</AlertDialogTitle>
              <AlertDialogDescription className="text-muted-foreground">
                Are you sure you want to remove this note? This cannot be
                undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="bg-muted hover:bg-muted/80 border-none">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => onRemove(note.id)}
                className="bg-destructive hover:bg-destructive/80 text-destructive-foreground border-none"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Card>
    </motion.div>
  );
}

export function NotesSection() {
  const { notes, addNote, toggleNote, updateNote, removeNote } = useApp();
  const [newNoteText, setNewNoteText] = useState('');

  const handleAdd = (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = newNoteText.trim();
    if (text) {
      addNote(text);
      setNewNoteText('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleAdd();
    }
  };

  return (
    <div className="space-y-8">
      <div className="relative group/input bg-card/40 rounded-2xl border border-white/5 p-2 focus-within:border-primary/40 transition-all duration-500 shadow-inner space-y-2">
        <Textarea
          value={newNoteText}
          onChange={(e) => setNewNoteText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Jot down a quick thought... (Cmd + Enter to save)"
          className="bg-transparent border-none shadow-none focus-visible:ring-0 min-h-[100px] resize-none text-base placeholder:text-muted-foreground/40 leading-relaxed p-4"
        />
        <hr className="border-white/5" />
        <div className="flex justify-between items-center p-2">
          <span className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-widest ml-2 flex items-center gap-1">
            <CornerDownLeft className="w-3 h-3" /> Cmd + Enter to add
          </span>
          <Button
            onClick={() => handleAdd()}
            type="submit"
            size="sm"
            className="rounded-lg shadow-sm shadow-primary/10 cursor-pointer"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Note
          </Button>
        </div>
      </div>

      {notes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center space-y-6">
          <div className="w-20 h-20 rounded-3xl bg-primary/5 flex items-center justify-center rotate-6 border border-primary/10">
            <StickyNote className="w-10 h-10 text-primary/30" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-black text-foreground/80 tracking-tight">
              No notes yet
            </h3>
            <p className="text-sm text-muted-foreground/60 max-w-[240px] leading-relaxed">
              Dumping your thoughts helps you stay focused on the task at hand.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          <AnimatePresence mode="popLayout">
            {[...notes]
              .sort((a, b) => Number(a.checked) - Number(b.checked))
              .map((note) => (
                <NoteItem
                  key={note.id}
                  note={note}
                  onToggle={toggleNote}
                  onUpdate={updateNote}
                  onRemove={removeNote}
                />
              ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
