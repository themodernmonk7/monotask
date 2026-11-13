import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  LogIn,
  UserPlus,
  Mail,
  Lock,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Cloud,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AuthModal({ open, onOpenChange }: AuthModalProps) {
  const { signIn, signUp, signInWithOtp } = useAuth();

  const [mode, setMode] = useState<'signin' | 'signup' | 'magic'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const resetForm = () => {
    setError(null);
    setSuccess(null);
  };

  const handleModeChange = (newMode: 'signin' | 'signup' | 'magic') => {
    setMode(newMode);
    resetForm();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      if (mode === 'signin') {
        const { error } = await signIn(email.trim(), password);
        if (error) {
          setError(error.message);
        } else {
          onOpenChange(false);
        }
      } else if (mode === 'signup') {
        const { error } = await signUp(email.trim(), password);
        if (error) {
          setError(error.message);
        } else {
          setSuccess('Account created! If confirmation is required, check your email.');
          setTimeout(() => {
            onOpenChange(false);
          }, 2000);
        }
      } else if (mode === 'magic') {
        const { error } = await signInWithOtp(email.trim());
        if (error) {
          setError(error.message);
        } else {
          setSuccess('Magic login link sent to your email! Click it to sign in.');
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary mb-1">
            <Cloud className="w-5 h-5" />
            <DialogTitle>
              {mode === 'signin' && 'Sign in to Monotask'}
              {mode === 'signup' && 'Create your Monotask account'}
              {mode === 'magic' && 'Sign in with Magic Link'}
            </DialogTitle>
          </div>
          <DialogDescription>
            {mode === 'signin' && 'Sign in to sync your tasks, working hours, and notes to Supabase.'}
            {mode === 'signup' && 'Start syncing your deep work sessions securely across all devices.'}
            {mode === 'magic' && 'Receive a passwordless sign-in link in your inbox.'}
          </DialogDescription>
        </DialogHeader>

        {/* Tab switcher */}
        <div className="grid grid-cols-3 p-1 bg-muted/30 rounded-xl border border-white/5 text-xs font-semibold">
          <button
            type="button"
            onClick={() => handleModeChange('signin')}
            className={cn(
              'py-1.5 rounded-lg transition-all cursor-pointer',
              mode === 'signin'
                ? 'bg-card text-foreground shadow-sm font-bold'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => handleModeChange('signup')}
            className={cn(
              'py-1.5 rounded-lg transition-all cursor-pointer',
              mode === 'signup'
                ? 'bg-card text-foreground shadow-sm font-bold'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Sign Up
          </button>
          <button
            type="button"
            onClick={() => handleModeChange('magic')}
            className={cn(
              'py-1.5 rounded-lg transition-all cursor-pointer',
              mode === 'magic'
                ? 'bg-card text-foreground shadow-sm font-bold'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Magic Link
          </button>
        </div>

        {/* Error / Success alerts */}
        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-xl text-destructive text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-primary" />
              <span>Email</span>
            </label>
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="bg-card/50 border-white/10"
              autoFocus
            />
          </div>

          {mode !== 'magic' && (
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-primary" />
                <span>Password</span>
              </label>
              <Input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="bg-card/50 border-white/10"
              />
            </div>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl gap-2 font-bold mt-2"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : mode === 'signin' ? (
              <LogIn className="w-4 h-4" />
            ) : mode === 'signup' ? (
              <UserPlus className="w-4 h-4" />
            ) : (
              <Mail className="w-4 h-4" />
            )}
            {mode === 'signin' && 'Sign In'}
            {mode === 'signup' && 'Create Account'}
            {mode === 'magic' && 'Send Magic Link'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
