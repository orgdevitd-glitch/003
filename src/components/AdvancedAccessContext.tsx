import React, { createContext, useContext, useState, useEffect } from "react";
import { Lock, X, ShieldAlert, KeyRound, Eye, EyeOff } from "lucide-react";

export interface AdvancedAccessConfig {
  enabled: boolean;
  displayName: string;
  ttlMinutes: number;
  protectedActions: string[];
}

interface AdvancedAccessContextType {
  config: AdvancedAccessConfig | null;
  requireAdvancedAccess: (actionId: string, callback: () => void) => void;
  isVerified: () => boolean;
}

const AdvancedAccessContext = createContext<AdvancedAccessContextType | undefined>(undefined);

export const useAdvancedAccess = () => {
  const context = useContext(AdvancedAccessContext);
  if (!context) {
    throw new Error("useAdvancedAccess must be used within an AdvancedAccessProvider");
  }
  return context;
};

export const AdvancedAccessProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [config, setConfig] = useState<AdvancedAccessConfig | null>(null);
  const [isServerActive, setIsServerActive] = useState<boolean>(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [pendingCallback, setPendingCallback] = useState<(() => void) | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  // Load config on mount
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch("/api/advanced-access/config");
        const data = await res.json();
        if (data.success && data.config) {
          setConfig(data.config);
        }
      } catch (err) {
        console.error("Failed to load advanced access config:", err);
      }
    };
    fetchConfig();
  }, []);

  // Fetch server status on config load
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch("/api/advanced-access/status");
        const data = await res.json();
        if (data.success) {
          setIsServerActive(data.active);
        }
      } catch (err) {
        console.error("Failed to check advanced access status on mount:", err);
      }
    };
    if (config?.enabled) {
      fetchStatus();
    }
  }, [config]);

  const isVerified = (): boolean => {
    if (!config || !config.enabled) return true;
    return isServerActive;
  };

  const requireAdvancedAccess = async (actId: string, callback: () => void) => {
    // If config hasn't loaded yet or is disabled, or action isn't protected, bypass
    if (!config || !config.enabled || !config.protectedActions.includes(actId)) {
      callback();
      return;
    }

    // Call /api/advanced-access/status to check server-side state
    try {
      const res = await fetch("/api/advanced-access/status");
      const data = await res.json();
      if (data.success && data.active) {
        setIsServerActive(true);
        callback();
        return;
      }
    } catch (err) {
      console.error("Failed to fetch advanced-access status:", err);
    }

    // Otherwise, prompt for advanced access
    setIsServerActive(false);
    setActionId(actId);
    setPendingCallback(() => callback);
    setPassword("");
    setError(null);
    setModalOpen(true);
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setError("Пожалуйста, введите код");
      return;
    }

    setVerifying(true);
    setError(null);

    // Keep reference and clean password from state immediately!
    const enteredPassword = password;
    setPassword("");

    try {
      const res = await fetch("/api/advanced-access/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: enteredPassword })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setIsServerActive(true);
        // localStorage is only used for UX assistance, keep it updated as well
        localStorage.setItem("pm_advanced_access_verified_at", Date.now().toString());
        setModalOpen(false);
        
        // Execute the pending action
        if (pendingCallback) {
          pendingCallback();
        }
        
        // Clear state
        setActionId(null);
        setPendingCallback(null);
      } else {
        setError(data.error || "Неверный код доступа");
      }
    } catch (err) {
      console.error("Verification error:", err);
      setError("Ошибка соединения с сервером. Попробуйте еще раз.");
    } finally {
      setVerifying(false);
    }
  };

  const handleCancel = () => {
    setModalOpen(false);
    setPassword("");
    setError(null);
    setActionId(null);
    setPendingCallback(null);
  };

  const displayName = config?.displayName || "Код расширенного доступа";

  return (
    <AdvancedAccessContext.Provider value={{ config, requireAdvancedAccess, isVerified }}>
      {children}

      {/* Modern, elegant Advanced Access Verification Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div 
            className="relative w-full max-w-md mx-4 overflow-hidden rounded-2xl bg-white border border-gray-100 shadow-2xl p-6 md:p-8 flex flex-col gap-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start gap-4">
              <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
                <ShieldAlert size={24} />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-gray-900 tracking-tight leading-snug">
                  Требуется расширенный доступ
                </h3>
                <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                  Данный функционал доступен только пользователям с расширенным доступом. Введите <span className="font-semibold text-gray-700">{displayName}</span> для продолжения.
                </p>
              </div>
              <button 
                onClick={handleCancel}
                className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleVerify} className="flex flex-col gap-4">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <KeyRound size={16} />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={displayName}
                  className="w-full pl-10 pr-10 py-3 bg-gray-50 border border-gray-200 focus:border-gray-900 focus:bg-white rounded-xl text-sm transition-all focus:outline-none focus:ring-0 text-gray-900"
                  autoFocus
                  disabled={verifying}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {error && (
                <div className="text-xs font-semibold text-red-600 bg-red-50 p-3 rounded-lg border border-red-100">
                  {error}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 mt-2">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-4 py-2.5 text-xs font-semibold text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-xl transition-all cursor-pointer"
                  disabled={verifying}
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={verifying}
                  className="px-5 py-2.5 bg-gray-900 text-white hover:bg-gray-800 disabled:bg-gray-400 text-xs font-bold uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  <Lock size={13} />
                  {verifying ? "Проверка..." : "Подтвердить"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdvancedAccessContext.Provider>
  );
};
