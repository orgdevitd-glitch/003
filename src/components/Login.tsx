import React, { useState } from 'react';
import { Lock, Eye, EyeOff, Loader2 } from 'lucide-react';

interface LoginProps {
  onLoginSuccess: () => void;
}

export function Login({ onLoginSuccess }: LoginProps) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError('Пожалуйста, введите пароль');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (response.ok && data.authenticated) {
        onLoginSuccess();
      } else {
        setError(data.error || 'Неверный пароль. Попробуйте еще раз.');
      }
    } catch (err) {
      setError('Ошибка соединения с сервером авторизации');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 sm:p-6 font-sans w-full max-w-full overflow-x-hidden">
      <div className="w-full max-w-md bg-white rounded-3xl border border-gray-100 shadow-xl overflow-hidden p-5 sm:p-8 md:p-10 space-y-6 sm:space-y-8">
        
        {/* Brand / Title Icon */}
        <div className="flex flex-col items-center text-center space-y-3 sm:space-y-4">
          <div className="w-14 h-14 sm:w-16 sm:h-16 bg-[#FBDF4B] rounded-2xl flex items-center justify-center shadow-lg rotate-3 border border-black/5">
            <div className="w-10 h-10 sm:w-12 sm:h-12 border-2 border-black rounded-full flex items-center justify-center">
              <span className="text-black font-black text-base sm:text-lg tracking-tighter">AI</span>
            </div>
          </div>
          
          <div className="space-y-1">
            <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-gray-900">
              Вход в систему
            </h2>
            <p className="text-gray-400 text-[10px] sm:text-xs font-black uppercase tracking-[0.2em]">
              Проектный Аналитик 2.0
            </p>
          </div>
        </div>

        {/* Security advisory note (without password reveal) */}
        <p className="text-[11px] sm:text-xs text-gray-500 text-center px-2 sm:px-4 leading-relaxed bg-gray-50 py-3 rounded-2xl">
          Доступ к проектным отчетам и интеллектуальному анализу ограничен. Пожалуйста, введите пароль доступа к портфелю.
        </p>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-gray-400 block">
              Пароль доступа
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                <Lock size={18} />
              </span>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full pl-11 pr-12 py-3.5 sm:py-4 bg-gray-50 border border-gray-100 focus:border-[#FBDF4B] focus:bg-white rounded-2xl text-base font-semibold tracking-wide transition-all outline-none"
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
                disabled={loading}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3.5 sm:p-4 bg-red-50 text-red-600 text-xs font-bold rounded-2xl border border-red-100/50 flex items-center gap-3">
              <span className="w-1.5 h-1.5 bg-red-600 rounded-full animate-ping flex-shrink-0" />
              <span className="break-words">{error}</span>
            </div>
          )}

          {/* Action button */}
          <button
            type="submit"
            className="w-full bg-[#010101] text-white hover:bg-gray-800 focus:ring-4 focus:ring-yellow-400 py-3.5 sm:py-4 font-black text-xs uppercase tracking-[0.3em] transition-all rounded-2xl shadow-lg shadow-black/10 active:scale-95 flex items-center justify-center gap-3 cursor-pointer min-h-[44px]"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Авторизация...</span>
              </>
            ) : (
              <span>Подтвердить вход</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
