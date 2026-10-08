import { FormEvent, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Mail, Lock, ArrowRight, Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react';
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
      setMessage('Account created. Check your email to confirm your account, then sign in.');
      setIsError(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-canvas">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-sm"
      >
        <div className="card p-6 sm:p-8 space-y-6">
          {/* Header */}
          <div className="text-center">
            <div className="w-10 h-10 rounded-md bg-primary text-white flex items-center justify-center mx-auto mb-3 shadow-sm">
              <Brain size={18} />
            </div>
            <p className="mono-kicker text-[10px] mb-1">Delve Research Platform</p>
            <h1 className="text-xl font-bold text-ink">
              {mode === 'sign-in' ? 'Sign in to workspace' : 'Create an account'}
            </h1>
            <p className="text-xs text-ink-mute mt-1">
              {mode === 'sign-in'
                ? 'Access your autonomous research sessions and papers'
                : 'Start running multi-agent deep research runs'}
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            {/* Email Field */}
            <div>
              <label className="block text-xs font-semibold text-ink-soft mb-1.5" htmlFor="email-input">
                Email address
              </label>
              <div className="relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
                <input
                  id="email-input"
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@institution.edu"
                  className="research-input pl-9"
                  autoComplete="email"
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-ink-soft" htmlFor="password-input">
                  Password
                </label>
              </div>
              <div className="relative">
                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
                <input
                  id="password-input"
                  required
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="research-input pl-9 pr-9"
                  autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-mute hover:text-ink transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {/* Error / Feedback alert */}
            <AnimatePresence>
              {message && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className={`rounded-md p-3 text-xs flex items-start gap-2 border ${
                    isError
                      ? 'bg-err-subtle text-err border-red-200'
                      : 'bg-ok-subtle text-ok border-emerald-200'
                  }`}
                  role="alert"
                >
                  {isError ? <AlertCircle size={14} className="shrink-0 mt-0.5" /> : <CheckCircle2 size={14} className="shrink-0 mt-0.5" />}
                  <span className="leading-relaxed">{message}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting}
              className="control-button control-button-primary w-full text-xs font-medium py-2.5 mt-2"
              style={{ minHeight: 38 }}
            >
              {submitting ? (
                <span className="loading-dots"><span/><span/><span/></span>
              ) : (
                <>
                  <span>{mode === 'sign-in' ? 'Sign In' : 'Create Account'}</span>
                  <ArrowRight size={13} />
                </>
              )}
            </button>
          </form>

          {/* Toggle mode */}
          <div className="pt-2 border-t border-line text-center text-xs text-ink-mute">
            {mode === 'sign-in' ? (
              <p>
                Don&apos;t have an account?{' '}
                <button
                  type="button"
                  onClick={() => { setMode('sign-up'); setMessage(null); }}
                  className="font-medium text-ink hover:underline"
                >
                  Sign up
                </button>
              </p>
            ) : (
              <p>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => { setMode('sign-in'); setMessage(null); }}
                  className="font-medium text-ink hover:underline"
                >
                  Sign in
                </button>
              </p>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
