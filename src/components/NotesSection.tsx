import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus,
  Trash2,
  CheckCircle2,
  CornerDownLeft,
  Pencil,
  Check,
  ChevronRight,
  FolderPlus,
} from 'lucide-react';
import { useApp } from '@/hooks/useApp';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
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
  groupId,
  note,
  onToggle,
  onUpdate,
  onRemove,
}: {
  groupId: string;
  note: { id: string; text: string; checked: boolean };
  onToggle: (groupId: string, id: string) => void;
  onUpdate: (groupId: string, id: string, text: string) => void;
  onRemove: (groupId: string, id: string) => void;
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
      onUpdate(groupId, note.id, trimmed);
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
          'flex flex-row items-start gap-4 px-4 py-3 transition-all duration-300 border-white/5 shadow-sm relative overflow-hidden ',
          note.checked
            ? 'bg-white/1 opacity-60'
            : 'bg-card/40 hover:bg-card/60 hover:shadow-lg hover:border-white/10',
        )}
      >
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div
            role="button"
            tabIndex={0}
            onClick={() => {
              onToggle(groupId, note.id);
              setIsEditing(false);
            }}
            className={cn(
              'relative flex items-center justify-center w-5 h-5 cursor-pointer rounded-lg border transition-all duration-500 shrink-0 mt-0.5',
              note.checked
                ? 'bg-primary border-primary shadow-[0_0_10px_oklch(var(--primary)/30%)]'
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
                  <CheckCircle2 className="w-3.5 h-3.5 text-primary-foreground stroke-2" />
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
                className="bg-background/50 border-primary/30 focus-visible:ring-primary/20 min-h-[60px] text-sm leading-relaxed p-2 resize-none"
              />
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-widest flex items-center gap-1">
                  <CornerDownLeft className="w-2.5 h-2.5" /> Cmd + Enter to save
                </span>
                <div className="flex gap-1.5">
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => {
                      setEditedText(note.text);
                      setIsEditing(false);
                    }}
                    className="h-7 px-2 text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="xs"
                    onClick={handleSave}
                    className="h-7 px-2 text-xs"
                  >
                    <Check className="w-3 h-3 mr-1" /> Save
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center gap-2 group/text">
              <span
                className={cn(
                  'flex-1 text-sm font-medium leading-relaxed transition-all duration-500 whitespace-pre-wrap cursor-text',
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

        <div className="flex items-center gap-1 opacity-0 group-hover/note:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              setIsEditing(true);
            }}
            className="size-7 text-muted-foreground/40 hover:text-muted-foreground "
          >
            <Pencil className="w-3 h-3" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-all"
                title="Delete note"
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-card border-white/5 backdrop-blur-xl">
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Note?</AlertDialogTitle>
                <AlertDialogDescription className="text-muted-foreground">
                  Are you sure you want to remove this note?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="bg-muted hover:bg-muted/80 border-none">
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => onRemove(groupId, note.id)}
                  className="bg-destructive hover:bg-destructive/80 text-destructive-foreground border-none"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </Card>
    </motion.div>
  );
}

function NoteGroupComponent({
  group,
  onAddNote,
  onToggleNote,
  onUpdateNote,
  onRemoveNote,
  onUpdateTitle,
  onRemoveGroup,
}: {
  group: {
    id: string;
    title: string;
    notes: { id: string; text: string; checked: boolean }[];
  };
  onAddNote: (groupId: string, text: string) => void;
  onToggleNote: (groupId: string, id: string) => void;
  onUpdateNote: (groupId: string, id: string, text: string) => void;
  onRemoveNote: (groupId: string, id: string) => void;
  onUpdateTitle: (groupId: string, title: string) => void;
  onRemoveGroup: (groupId: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(group.title);
  const [newNoteText, setNewNoteText] = useState('');

  const handleAdd = (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = newNoteText.trim();
    if (text) {
      onAddNote(group.id, text);
      setNewNoteText('');
    }
  };

  const handleSaveTitle = () => {
    const trimmed = editedTitle.trim();
    if (trimmed && trimmed !== group.title) {
      onUpdateTitle(group.id, trimmed);
    } else {
      setEditedTitle(group.title);
    }
    setIsEditingTitle(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between group/title">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-6 w-6 rounded-md text-muted-foreground/60 cursor-pointer"
          >
            <motion.div animate={{ rotate: isExpanded ? 90 : 0 }}>
              <ChevronRight className="w-4 h-4" />
            </motion.div>
          </Button>
          {isEditingTitle ? (
            <Input
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              onBlur={handleSaveTitle}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveTitle()}
              className="h-7 text-sm font-bold bg-muted/40 border-none focus-visible:ring-1"
              autoFocus
            />
          ) : (
            <h3
              className="text-sm font-bold text-foreground/80 cursor-pointer truncate flex"
              onClick={() => setIsEditingTitle(true)}
            >
              {group.title}
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 font-black text-primary/80 uppercase tracking-tighter shadow-inner ml-2 flex justify-center items-center">
                {group.notes.length}
              </span>
            </h3>
          )}
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover/title:opacity-100 transition-opacity">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground/40 hover:text-destructive"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Group?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will delete "{group.title}" and all its notes.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => onRemoveGroup(group.id)}
                  className="bg-destructive"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-3 md:pl-4">
              <div className="relative bg-card/20 rounded-xl border border-white/5 focus-within:border-primary/20 transition-all p-2">
                <Textarea
                  value={newNoteText}
                  onChange={(e) => setNewNoteText(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === 'Enter' && (e.metaKey || e.ctrlKey) && handleAdd()
                  }
                  placeholder="Drop a note here... (Cmd + Enter)"
                  className="bg-transparent border-none shadow-none focus-visible:ring-0 min-h-[60px] text-sm p-3 resize-none placeholder:text-muted-foreground/40 leading-relaxed"
                />
                <div className="flex justify-end mt-2">
                  <Button
                    onClick={() => handleAdd()}
                    size="xs"
                    className="h-7 px-3 text-xs rounded-lg"
                  >
                    <Plus className="w-3 h-3 mr-1" /> Add
                  </Button>
                </div>
              </div>

              <div className="grid gap-2">
                <AnimatePresence mode="popLayout">
                  {group.notes
                    .sort((a, b) => Number(a.checked) - Number(b.checked))
                    .map((note) => (
                      <NoteItem
                        key={note.id}
                        groupId={group.id}
                        note={note}
                        onToggle={onToggleNote}
                        onUpdate={onUpdateNote}
                        onRemove={onRemoveNote}
                      />
                    ))}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function NotesSection() {
  const {
    noteGroups,
    addNoteGroup,
    updateNoteGroupTitle,
    removeNoteGroup,
    addNote,
    toggleNote,
    updateNote,
    removeNote,
  } = useApp();
  const [newGroupTitle, setNewGroupTitle] = useState('');
  const [newNoteText, setNewNoteText] = useState('');

  // The first group (usually 'General' or the first created) is treated as "flat"
  const generalGroup =
    noteGroups.find((g) => g.id === 'general' || g.id === 'legacy-default') ||
    noteGroups[0];
  const otherGroups = noteGroups.filter((g) => g.id !== generalGroup?.id);

  const handleCreateGroup = (e?: React.FormEvent) => {
    e?.preventDefault();
    const title = newGroupTitle.trim();
    if (title) {
      addNoteGroup(title);
      setNewGroupTitle('');
    }
  };

  const handleAddQuickNote = () => {
    const text = newNoteText.trim();
    if (text && generalGroup) {
      addNote(generalGroup.id, text);
      setNewNoteText('');
    }
  };

  return (
    <div className="space-y-12">
      {/* Quick Note / Flat Notes Area */}
      <div className="space-y-6">
        <div className="relative group/input bg-card/20 rounded-2xl border border-white/5 p-2 focus-within:border-primary/20 transition-all duration-500 shadow-inner">
          <Textarea
            value={newNoteText}
            onChange={(e) => setNewNoteText(e.target.value)}
            onKeyDown={(e) =>
              e.key === 'Enter' &&
              (e.metaKey || e.ctrlKey) &&
              handleAddQuickNote()
            }
            placeholder="Quick note... (Cmd + Enter)"
            className="bg-transparent border-none shadow-none focus-visible:ring-0 min-h-[100px] resize-none text-base placeholder:text-muted-foreground/40 leading-relaxed p-4"
          />
          <div className="flex justify-between items-center p-2">
            <span className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-widest ml-2 flex items-center gap-1">
              <CornerDownLeft className="w-3 h-3" /> Add focus
            </span>
            <Button
              onClick={handleAddQuickNote}
              size="sm"
              className="rounded-lg shadow-sm"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Note
            </Button>
          </div>
        </div>

        {generalGroup && (
          <div className="grid gap-2">
            <AnimatePresence mode="popLayout">
              {generalGroup.notes
                .sort((a, b) => Number(a.checked) - Number(b.checked))
                .map((note) => (
                  <NoteItem
                    key={note.id}
                    groupId={generalGroup.id}
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

      <div className="h-px bg-white/5 flex items-center justify-center">
        <span className="bg-background px-4 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/30">
          Groups
        </span>
      </div>

      {/* Note Groups Area */}
      <div className="space-y-8">
        <form onSubmit={handleCreateGroup} className="flex gap-2">
          <Input
            value={newGroupTitle}
            onChange={(e) => setNewGroupTitle(e.target.value)}
            placeholder="Group notes..."
            className="bg-card/40 border-white/5 focus-visible:ring-primary/20"
          />
          <Button type="submit" variant="secondary" className="shrink-0">
            <FolderPlus className="w-4 h-4 mr-2" />
            New Group
          </Button>
        </form>

        <div className="grid gap-6">
          <AnimatePresence mode="popLayout">
            {otherGroups.map((group) => (
              <NoteGroupComponent
                key={group.id}
                group={group}
                onAddNote={addNote}
                onToggleNote={toggleNote}
                onUpdateNote={updateNote}
                onRemoveNote={removeNote}
                onUpdateTitle={updateNoteGroupTitle}
                onRemoveGroup={removeNoteGroup}
              />
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
