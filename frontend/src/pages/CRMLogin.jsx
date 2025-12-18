import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Scale } from 'lucide-react';
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
      toast.error(error.response?.data?.detail || t('auth.loginError'));
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
              <Input
                type="password"
                value={credentials.password}
                onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                placeholder="••••••••"
                className="bg-white border-gray-300 text-black rounded-none"
                required
              />
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
