import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Scale, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const CRMLogin = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [credentials, setCredentials] = useState({
    username: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await axios.post(`${API}/crm/auth/login`, credentials);
      
      if (response.data.token) {
        localStorage.setItem('crmToken', response.data.token);
        localStorage.setItem('crmUser', JSON.stringify(response.data.user));
        toast.success(t('auth.loginSuccess'));
        navigate('/crm/dashboard');
      }
    } catch (error) {
      const detail = error.response?.data?.detail || '';
      
      // Handle after-hours approval required message
      // Format: after_hours_approval_required:after_work_hours:14:20
      if (detail.startsWith('after_hours_approval_required:')) {
        const parts = detail.split(':');
        // parts[0] = "after_hours_approval_required"
        // parts[1] = "after_work_hours" or "before_work_hours" or "not_work_day"
        // parts[2] = hour or day name
        // parts[3] = minute (if time)
        const reasonType = parts[1];
        let translatedReason = reasonType;
        
        // Parse the reason code
        if (reasonType === 'after_work_hours') {
          const time = parts.length >= 4 ? `${parts[2]}:${parts[3]}` : parts[2] || '';
          translatedReason = t('session.afterWorkHours', { time });
        } else if (reasonType === 'before_work_hours') {
          const time = parts.length >= 4 ? `${parts[2]}:${parts[3]}` : parts[2] || '';
          translatedReason = t('session.beforeWorkHours', { time });
        } else if (reasonType === 'not_work_day') {
          const day = parts[2] || '';
          translatedReason = t('session.notWorkDay', { day });
        }
        
        toast.error(t('session.afterHoursApprovalRequired', { reason: translatedReason }));
      } else {
        toast.error(detail || t('auth.loginError'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Scale className="w-10 h-10 text-[#D4AF37]" />
            <span className="text-black text-2xl font-semibold">1 LAW SOLICITORS</span>
          </div>
          <h1 className="text-3xl font-bold text-black mb-2">{t('auth.crmPortal')}</h1>
          <p className="text-gray-700">{t('auth.accessClientManagement')}</p>
        </div>

        <div className="bg-gray-50 border-2 border-[#D4AF37] p-8 shadow-xl">
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-black mb-2 text-sm font-semibold">{t('auth.username')}</label>
              <Input
                type="text"
                value={credentials.username}
                onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
                placeholder="admin_f87450ce5d66"
                className="bg-white border-gray-300 text-black rounded-none"
                required
              />
            </div>
            <div>
              <label className="block text-black mb-2 text-sm font-semibold">{t('auth.password')}</label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={credentials.password}
                  onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                  placeholder="••••••••"
                  className="bg-white border-gray-300 text-black rounded-none pr-10"
                  required
                  data-testid="password-input"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-black transition-colors"
                  data-testid="password-toggle"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none text-lg py-6 font-semibold"
            >
              {loading ? t('common.loggingIn') : t('auth.loginToCRM')}
            </Button>
          </form>
          
          <div className="mt-6 text-center text-sm text-gray-600">
            <p>{t('common.useCredentials')}</p>
          </div>
        </div>

        <div className="text-center mt-6">
          <button
            onClick={() => navigate('/')}
            className="text-gray-700 hover:text-black underline"
          >
            {t('common.backToSite')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CRMLogin;
