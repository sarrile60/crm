import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Scale, Users, TrendingUp, AlertCircle, LogOut, Settings, FileText, Bell, Shield } from 'lucide-react';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import axios from 'axios';
import LeadsTable from '../components/crm/LeadsTable';
import UserManagement from '../components/crm/UserManagement';
import SettingsPanel from '../components/crm/SettingsPanel';
import CallbackNotifications from '../components/crm/CallbackNotifications';
import ChatWidget from '../components/chat/ChatWidget';
import TeamMembers from '../components/crm/TeamMembers';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const CRMDashboard = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [callbackLead, setCallbackLead] = useState(null);
  const [sessionInfo, setSessionInfo] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('crmToken');
    const user = localStorage.getItem('crmUser');
    
    if (!token || !user) {
      navigate('/crm/login');
      return;
    }
    
    setCurrentUser(JSON.parse(user));
    fetchData();
    
    // Start session check interval (every 60 seconds)
    const sessionCheckInterval = setInterval(checkSession, 60000);
    
    // Check session immediately on load
    checkSession();
    
    return () => clearInterval(sessionCheckInterval);
  }, []);
  
  const checkSession = async () => {
    try {
      const token = localStorage.getItem('crmToken');
      if (!token) return;
      
      const response = await axios.get(`${API}/crm/auth/session-check`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!response.data.valid) {
        // Session expired - auto logout
        let reason = response.data.reason || t('session.sessionExpired');
        // Parse reason codes from backend
        if (reason.startsWith('not_work_day:')) {
          const day = reason.split(':')[1];
          reason = t('session.notWorkDay', { day });
        } else if (reason.startsWith('before_work_hours:')) {
          const time = reason.split(':')[1];
          reason = t('session.beforeWorkHours', { time });
        } else if (reason.startsWith('after_work_hours:')) {
          const time = reason.split(':')[1];
          reason = t('session.afterWorkHours', { time });
        }
        toast.error(reason);
        localStorage.removeItem('crmToken');
        localStorage.removeItem('crmUser');
        navigate('/crm/login');
      } else {
        // Update session info for display
        setSessionInfo(response.data.session_info);
      }
    } catch (error) {
      // If session check fails with 401, logout
      if (error.response?.status === 401) {
        localStorage.removeItem('crmToken');
        localStorage.removeItem('crmUser');
        navigate('/crm/login');
      }
    }
  };

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      const statsRes = await axios.get(`${API}/crm/dashboard/stats`, { headers });
      setStats(statsRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
      if (error.response?.status === 401) {
        handleLogout();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      // Call logout API to log the event in audit trail
      const token = localStorage.getItem('crmToken');
      if (token) {
        await axios.post(`${API}/crm/auth/logout`, {}, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }
    } catch (error) {
      // Continue with logout even if API call fails
      console.error('Logout API error:', error);
    }
    
    localStorage.removeItem('crmToken');
    localStorage.removeItem('crmUser');
    toast.success(t('common.logoutSuccess'));
    navigate('/crm/login');
  };

  const handleCallbackAlert = (lead) => {
    // Switch to leads tab and pass the lead to open
    setActiveTab('leads');
    setCallbackLead(lead);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-black text-xl">{t('common.loading')}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-black border-b-2 border-[#D4AF37] py-4 px-8 sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Scale className="w-8 h-8 text-[#D4AF37]" />
            <div>
              <h1 className="text-white text-xl font-semibold">1 LAW SOLICITORS CRM</h1>
              <p className="text-gray-400 text-sm">{currentUser?.full_name} - {t(`users.roles.${currentUser?.role}`)}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Session Timer */}
            {sessionInfo && !sessionInfo.is_admin && (
              <div className="text-right text-xs">
                <div className="text-gray-400">{t('auth.sessionExpires')} {sessionInfo.session_end_time}</div>
                <div className={`font-mono ${sessionInfo.minutes_remaining < 30 ? 'text-red-400' : 'text-[#D4AF37]'}`}>
                  {Math.floor(sessionInfo.minutes_remaining / 60)}h {sessionInfo.minutes_remaining % 60}m {t('auth.timeRemaining')}
                </div>
              </div>
            )}
            {sessionInfo && sessionInfo.is_admin && (
              <div className="text-right text-xs">
                <div className="text-[#D4AF37]">{t('auth.adminNoExpiry')}</div>
              </div>
            )}
            <CallbackNotifications onCallbackAlert={handleCallbackAlert} currentUser={currentUser} />
            <Button onClick={handleLogout} className="bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none">
              <LogOut className="w-4 h-4 mr-2" />
              {t('auth.logout')}
            </Button>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="bg-gray-50 border-b-2 border-gray-200 px-8 py-4">
        <div className="max-w-[1600px] mx-auto flex gap-6">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-4 py-2 font-semibold transition-all ${
              activeTab === 'dashboard'
                ? 'text-[#D4AF37] border-b-2 border-[#D4AF37]'
                : 'text-gray-600 hover:text-black'
            }`}
          >
            <TrendingUp className="w-4 h-4 inline mr-2" />
            {t('nav.dashboard')}
          </button>
          <button
            onClick={() => setActiveTab('leads')}
            className={`px-4 py-2 font-semibold transition-all ${
              activeTab === 'leads'
                ? 'text-[#D4AF37] border-b-2 border-[#D4AF37]'
                : 'text-gray-600 hover:text-black'
            }`}
          >
            <FileText className="w-4 h-4 inline mr-2" />
            {t('nav.leads')}
          </button>
          {/* Team tab for supervisors */}
          {currentUser?.role === 'supervisor' && (
            <button
              onClick={() => setActiveTab('team')}
              className={`px-4 py-2 font-semibold transition-all ${
                activeTab === 'team'
                  ? 'text-[#D4AF37] border-b-2 border-[#D4AF37]'
                  : 'text-gray-600 hover:text-black'
              }`}
            >
              <Users className="w-4 h-4 inline mr-2" />
              {t('nav.team')}
            </button>
          )}
          {/* Users tab moved to Administration Panel */}
          {currentUser?.role === 'admin' && (
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-4 py-2 font-semibold transition-all ${
                activeTab === 'settings'
                  ? 'text-[#D4AF37] border-b-2 border-[#D4AF37]'
                  : 'text-gray-600 hover:text-black'
              }`}
            >
              <Settings className="w-4 h-4 inline mr-2" />
              {t('nav.settings')}
            </button>
          )}
          {currentUser?.role === 'admin' && (
            <button
              onClick={() => navigate('/crm/admin')}
              className="px-4 py-2 font-semibold transition-all text-gray-600 hover:text-black bg-[#D4AF37] bg-opacity-10 hover:bg-opacity-20 border border-[#D4AF37] ml-4"
            >
              <Shield className="w-4 h-4 inline mr-2" />
              {t('nav.administration')}
            </button>
          )}
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-[1600px] mx-auto p-8">
        {activeTab === 'dashboard' && stats && (
          <div>
            <h2 className="text-3xl font-bold text-black mb-8">{t('dashboard.title')}</h2>
            
            {/* Stats Cards */}
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
              <div className="bg-white border-2 border-[#D4AF37] p-6 shadow-lg">
                <div className="flex items-center justify-between mb-4">
                  <FileText className="w-8 h-8 text-[#D4AF37]" />
                  <span className="text-sm text-gray-600">{t('common.total')}</span>
                </div>
                <div className="text-4xl font-bold text-black mb-2">{stats.total_leads}</div>
                <p className="text-gray-600">{t('dashboard.totalLeads')}</p>
              </div>

              <div className="bg-white border-2 border-gray-300 p-6 shadow-lg">
                <div className="flex items-center justify-between mb-4">
                  <AlertCircle className="w-8 h-8 text-blue-600" />
                  <span className="text-sm text-gray-600">{t('common.new')}</span>
                </div>
                <div className="text-4xl font-bold text-black mb-2">{stats.new_leads}</div>
                <p className="text-gray-600">{t('dashboard.newLeads')}</p>
              </div>

              <div className="bg-white border-2 border-gray-300 p-6 shadow-lg">
                <div className="flex items-center justify-between mb-4">
                  <TrendingUp className="w-8 h-8 text-orange-600" />
                  <span className="text-sm text-gray-600">{t('common.inProgress')}</span>
                </div>
                <div className="text-4xl font-bold text-black mb-2">{stats.in_progress}</div>
                <p className="text-gray-600">{t('dashboard.inProgress')}</p>
              </div>

              <div className="bg-white border-2 border-gray-300 p-6 shadow-lg">
                <div className="flex items-center justify-between mb-4">
                  <Bell className="w-8 h-8 text-red-600" />
                  <span className="text-sm text-gray-600">{t('common.urgent')}</span>
                </div>
                <div className="text-4xl font-bold text-black mb-2">{stats.pending_callbacks}</div>
                <p className="text-gray-600">{t('dashboard.pendingCallbacks')}</p>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-gray-50 border-2 border-gray-200 p-6">
              <h3 className="text-xl font-bold text-black mb-4">{t('dashboard.quickActions')}</h3>
              <div className="flex flex-wrap gap-4">
                <Button onClick={() => setActiveTab('leads')} className="bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none">
                  {t('dashboard.viewAllLeads')}
                </Button>
                {currentUser?.role === 'admin' && (
                  <Button onClick={() => navigate('/crm/admin')} className="bg-black text-white hover:bg-gray-800 rounded-none">
                    {t('dashboard.adminPanel')}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'leads' && <LeadsTable currentUser={currentUser} urgentCallbackLead={callbackLead} onClearCallbackLead={() => setCallbackLead(null)} />}
        {/* Users tab moved to Administration Panel */}
        {activeTab === 'settings' && <SettingsPanel />}
      </main>
      
      {/* Chat Widget */}
      <ChatWidget currentUser={currentUser} />
    </div>
  );
};

export default CRMDashboard;
