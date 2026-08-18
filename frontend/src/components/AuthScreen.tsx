import { FormEvent, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Mail, Lock, ArrowRight, Eye, EyeOff, Sparkles, CheckCircle2 } from 'lucide-react';
import { supabase } from '../supabase';

export function AuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    const result = mode === 'sign-in'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });
    setSubmitting(false);
    if (result.error) {
      setMessage(result.error.message);
      setIsError(true);
    } else if (mode === 'sign-up') {
      setMessage('Account created! Check your email to confirm, then sign in.');
      setIsError(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 overflow-hidden"
      style={{ background: 'var(--gradient-hero)' }}
    >
      {/* Background orbs */}
      <div className="fixed inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute rounded-full float"
          style={{
            width: 500, height: 500, top: -150, left: -100,
            background: 'radial-gradient(circle, rgba(99,102,241,0.25) 0%, transparent 70%)',
            filter: 'blur(80px)',
          }} />
        <div className="absolute rounded-full float float-delay-2"
          style={{
            width: 400, height: 400, bottom: -100, right: -50,
            background: 'radial-gradient(circle, rgba(236,72,153,0.2) 0%, transparent 70%)',
            filter: 'blur(80px)',
          }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-sm"
      >
        <form
          onSubmit={submit}
          className="card p-6 sm:p-8 space-y-5 shadow-2xl"
          style={{ background: 'var(--color-surface)', borderColor: 'var(--color-line)' }}
        >
          {/* Logo */}
          <div className="text-center mb-2">
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg"
              style={{ background: 'var(--gradient-primary)' }}
            >
              <Brain size={20} color="white" />
            </div>
            <p className="mono-kicker text-[10px] mb-1">Delve Research</p>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--color-ink)' }}>
              {mode === 'sign-in' ? 'Welcome back' : 'Create account'}
            </h1>
            <p className="text-xs mt-1" style={{ color: 'var(--color-ink-mute)' }}>
              Your research papers stay private to your workspace
            </p>
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--color-ink-soft)' }}>
              Email address
            </label>
            <div className="relative">
              <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-ink-mute)' }} />
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@university.edu"
                className="delve-input pl-9 text-xs"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--color-ink-soft)' }}>
              Password
            </label>
            <div className="relative">
              <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-ink-mute)' }} />
              <input
                required
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="delve-input pl-9 pr-9 text-xs"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--color-ink-mute)' }}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {/* Error / Success message */}
          <AnimatePresence>
            {message && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="rounded-xl px-4 py-3 text-xs flex items-center gap-2"
                style={isError ? {
                  background: 'rgba(244,63,94,0.1)',
                  color: 'var(--color-err)',
                  border: '1px solid rgba(244,63,94,0.25)',
                } : {
                  background: 'rgba(16,185,129,0.1)',
                  color: 'var(--color-ok)',
                  border: '1px solid rgba(16,185,129,0.25)',
                }}
              >
                {isError ? null : <CheckCircle2 size={14} />}
                <span>{message}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Submit button */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            type="submit"
            disabled={submitting}
            className="control-button control-button-primary w-full text-xs font-semibold"
            style={{ minHeight: 44, borderRadius: 10 }}
          >
            {submitting ? (
              <span className="loading-dots"><span/><span/><span/></span>
            ) : mode === 'sign-in' ? (
              <>Sign in <ArrowRight size={14} /></>
            ) : (
              <>Create account <ArrowRight size={14} /></>
            )}
          </motion.button>

          {/* Toggle mode */}
          <div className="text-center pt-1">
            <button
              type="button"
              onClick={() => { setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in'); setMessage(null); }}
              className="text-xs font-medium hover:underline transition-all"
              style={{ color: 'var(--color-blue-dim)' }}
            >
              {mode === 'sign-in' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
            </button>
          </div>

          {/* Free tier note */}
          <div className="flex items-center gap-1.5 justify-center pt-2 border-t" style={{ borderColor: 'var(--color-line)' }}>
            <Sparkles size={12} color="var(--color-pink)" />
            <span className="text-[11px]" style={{ color: 'var(--color-ink-mute)' }}>
              5 free research papers included per account
            </span>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
