import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Scale, Users, TrendingUp, AlertCircle, LogOut, Settings, FileText, Bell, Shield, DollarSign, BarChart3, PieChart, Wallet, Sliders, ChevronDown, CheckCircle, Clock, Activity } from 'lucide-react';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import axios from 'axios';
import LeadsTable from '../components/crm/LeadsTable';
import LeadsTableOptimized from '../components/crm/LeadsTableOptimized';
import UserManagement from '../components/crm/UserManagement';
import SettingsPanel from '../components/crm/SettingsPanel';
import CallbackNotifications from '../components/crm/CallbackNotifications';
import ChatWidget from '../components/chat/ChatWidget';
import TeamMembers from '../components/crm/TeamMembers';
import DepositsManager from '../components/crm/DepositsManager';
import DepositApprovals from '../components/crm/DepositApprovals';
import TeamRevenue from '../components/crm/TeamRevenue';
import AnalyticsDashboard from '../components/crm/AnalyticsDashboard';
import FinancialDashboard from '../components/crm/FinancialDashboard';
import CommissionSettings from '../components/crm/CommissionSettings';

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
  const [recentLeads, setRecentLeads] = useState([]);
  const [streamData, setStreamData] = useState([]);
  
  // Track which tabs have been visited (for lazy keep-alive)
  const [visitedTabs, setVisitedTabs] = useState(new Set(['dashboard']));
  
  // Bootstrap data - shared across components to avoid duplicate API calls
  const [bootstrapData, setBootstrapData] = useState(null);
  
  // Update visited tabs when activeTab changes
  useEffect(() => {
    if (activeTab) {
      setVisitedTabs(prev => {
        const next = new Set(prev);
        next.add(activeTab);
        return next;
      });
    }
  }, [activeTab]);

  // Send heartbeat to update last_active status
  const sendHeartbeat = async () => {
    try {
      const token = localStorage.getItem('crmToken');
      if (!token) return;
      
      await axios.post(`${API}/crm/heartbeat`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (error) {
      // Silently fail - heartbeat is not critical
      console.debug('Heartbeat failed:', error.message);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('crmToken');
    const user = localStorage.getItem('crmUser');
    
    if (!token || !user) {
      navigate('/crm/login');
      return;
    }
    
    // Quick JWT expiry check (client-side, no API call)
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        localStorage.removeItem('crmToken');
        localStorage.removeItem('crmUser');
        navigate('/crm/login');
        return;
      }
    } catch (e) {
      // Token parse failed - let server validate it
      console.debug('JWT parse failed, will validate server-side');
    }
    
    setCurrentUser(JSON.parse(user));
    fetchData();
    
    // Session check every 2 minutes (for after-hours enforcement)
    const sessionCheckInterval = setInterval(checkSession, 120000);
    
    // Heartbeat every 60 seconds
    const heartbeatInterval = setInterval(sendHeartbeat, 60000);
    
    // Initial heartbeat only (skip session check — JWT already verified above)
    sendHeartbeat();
    
    return () => {
      clearInterval(sessionCheckInterval);
      clearInterval(heartbeatInterval);
    };
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

      // Use bootstrap endpoint - ONE call returns everything
      const bootstrapRes = await axios.get(`${API}/crm/bootstrap`, { headers });
      const data = bootstrapRes.data;
      
      setStats(data.dashboard);
      setBootstrapData(data);
      
      // Update current user from server
      if (data.user) {
        setCurrentUser(data.user);
        localStorage.setItem('crmUser', JSON.stringify(data.user));
      }
      
      // Fetch recent leads and stream for dashboard (run in background)
      const bgHeaders = { Authorization: `Bearer ${token}` };
      Promise.all([
        axios.get(`${API}/crm/leads`, { headers: bgHeaders, params: { limit: 8, offset: 0, sort: 'created_at', order: 'desc' } }),
        axios.get(`${API}/crm/stream`, { headers: bgHeaders, params: { limit: 15 } })
      ]).then(([leadsRes, streamRes]) => {
        const leads = Array.isArray(leadsRes.data) ? leadsRes.data : (leadsRes.data.data || []);
        setRecentLeads(leads);
        setStreamData(streamRes.data || []);
      }).catch(() => {});
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

  // State for deposit creation from notification
  const [pendingDepositData, setPendingDepositData] = useState(null);

  // Listen for openDepositCreate event from notifications
  useEffect(() => {
    const handleOpenDepositCreate = (event) => {
      const depositData = event.detail;
      // Store the deposit data and switch to deposits tab
      setPendingDepositData(depositData);
      setActiveTab('deposits');
    };

    window.addEventListener('openDepositCreate', handleOpenDepositCreate);
    return () => {
      window.removeEventListener('openDepositCreate', handleOpenDepositCreate);
    };
  }, []);

  // Listen for changeTab event (from notification Review button)
  useEffect(() => {
    const handleChangeTab = (event) => {
      const tabName = event.detail;
      if (tabName) {
        setActiveTab(tabName);
      }
    };

    window.addEventListener('changeTab', handleChangeTab);
    return () => {
      window.removeEventListener('changeTab', handleChangeTab);
    };
  }, []);

  // Clear pending deposit data when tab changes away from deposits
  useEffect(() => {
    if (activeTab !== 'deposits') {
      setPendingDepositData(null);
    }
  }, [activeTab]);

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
      <header className="bg-black border-b border-[#D4AF37] px-6 sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between h-12">
          <div className="flex items-center gap-2">
            <Scale className="w-6 h-6 text-[#D4AF37]" />
            <div>
              <h1 className="text-white text-sm font-semibold leading-tight">1 LAW SOLICITORS CRM</h1>
              <p className="text-gray-400 text-[10px] leading-tight">{currentUser?.full_name} · {t(`users.roles.${currentUser?.role}`)}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Session Timer */}
            {sessionInfo && !sessionInfo.is_admin && (
              <div className="text-right text-xs">
                {sessionInfo.has_after_hours_approval ? (
                  <>
                    <div className="text-orange-400">{t('auth.approvedSession')}</div>
                    <div className={`font-mono ${sessionInfo.approval_minutes_remaining < 10 ? 'text-red-400' : 'text-orange-400'}`}>
                      {sessionInfo.approval_minutes_remaining}m {t('auth.timeRemaining')}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-gray-400">{t('auth.sessionExpires')} {sessionInfo.session_end_time}</div>
                    <div className={`font-mono ${sessionInfo.minutes_remaining < 30 ? 'text-red-400' : 'text-[#D4AF37]'}`}>
                      {Math.floor(sessionInfo.minutes_remaining / 60)}h {sessionInfo.minutes_remaining % 60}m {t('auth.timeRemaining')}
                    </div>
                  </>
                )}
              </div>
            )}
            {sessionInfo && sessionInfo.is_admin && (
              <div className="text-right text-xs">
                <div className="text-[#D4AF37]">{t('auth.adminNoExpiry')}</div>
              </div>
            )}
            <CallbackNotifications onCallbackAlert={handleCallbackAlert} currentUser={currentUser} bootstrapData={bootstrapData} />
            <Button onClick={handleLogout} size="sm" className="bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-sm h-8 text-xs">
              <LogOut className="w-3.5 h-3.5 mr-1" />
              {t('auth.logout')}
            </Button>
          </div>
        </div>
      </header>

      {/* Navigation - Clean Professional Layout */}
      <nav className="bg-white border-b border-gray-200 px-6">
        <div className="max-w-[1600px] mx-auto flex items-center h-10">
          {/* Primary Nav Items */}
          <div className="flex items-center gap-1">
            {/* Dashboard */}
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-3 py-2 text-sm font-medium transition-all rounded-sm ${
                activeTab === 'dashboard'
                  ? 'text-[#D4AF37] bg-[#D4AF37]/10'
                  : 'text-gray-600 hover:text-black hover:bg-gray-100'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
              {t('nav.dashboard')}
            </button>

            {/* Leads */}
            <button
              onClick={() => setActiveTab('leads')}
              className={`px-3 py-2 text-sm font-medium transition-all rounded-sm ${
                activeTab === 'leads'
                  ? 'text-[#D4AF37] bg-[#D4AF37]/10'
                  : 'text-gray-600 hover:text-black hover:bg-gray-100'
              }`}
            >
              <FileText className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
              {t('nav.leads')}
            </button>

            {/* Deposits */}
            <button
              onClick={() => setActiveTab('deposits')}
              className={`px-3 py-2 text-sm font-medium transition-all rounded-sm ${
                activeTab === 'deposits'
                  ? 'text-[#D4AF37] bg-[#D4AF37]/10'
                  : 'text-gray-600 hover:text-black hover:bg-gray-100'
              }`}
            >
              <DollarSign className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
              {t('nav.deposits')}
            </button>

            {/* Team (Supervisor/Admin) */}
            {(currentUser?.role === 'supervisor' || currentUser?.role === 'admin') && (
              <button
                onClick={() => setActiveTab('team')}
                className={`px-3 py-2 text-sm font-medium transition-all rounded-sm ${
                  activeTab === 'team'
                    ? 'text-[#D4AF37] bg-[#D4AF37]/10'
                    : 'text-gray-600 hover:text-black hover:bg-gray-100'
                }`}
              >
                <Users className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
                {t('nav.team')}
              </button>
            )}

            {/* Earnings (Agent/Supervisor) */}
            {(currentUser?.role === 'agent' || currentUser?.role === 'supervisor') && (
              <button
                onClick={() => setActiveTab('earnings')}
                className={`px-3 py-2 text-sm font-medium transition-all rounded-sm ${
                  activeTab === 'earnings'
                    ? 'text-[#D4AF37] bg-[#D4AF37]/10'
                    : 'text-gray-600 hover:text-black hover:bg-gray-100'
                }`}
              >
                <Wallet className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
                {t('nav.earnings')}
              </button>
            )}

            {/* Divider */}
            {currentUser?.role === 'admin' && (
              <div className="w-px h-5 bg-gray-300 mx-1"></div>
            )}

            {/* Reports Dropdown (Admin) */}
            {currentUser?.role === 'admin' && (
              <div className="relative group">
                <button
                  className={`px-3 py-2 text-sm font-medium transition-all rounded-sm flex items-center gap-1 ${
                    ['revenue', 'analytics', 'finance', 'depositApprovals'].includes(activeTab)
                      ? 'text-[#D4AF37] bg-[#D4AF37]/10'
                      : 'text-gray-600 hover:text-black hover:bg-gray-100'
                  }`}
                >
                  <BarChart3 className="w-3.5 h-3.5 -mt-0.5" />
                  Reports
                  <ChevronDown className="w-3 h-3" />
                </button>
                <div className="absolute left-0 top-full mt-0 w-52 bg-white border border-gray-200 shadow-lg rounded-sm opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                  <button onClick={() => setActiveTab('revenue')} className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-2 ${activeTab === 'revenue' ? 'text-[#D4AF37] bg-[#D4AF37]/5' : 'text-gray-700'}`}>
                    <BarChart3 className="w-3.5 h-3.5" /> Revenue
                  </button>
                  <button onClick={() => setActiveTab('analytics')} className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-2 ${activeTab === 'analytics' ? 'text-[#D4AF37] bg-[#D4AF37]/5' : 'text-gray-700'}`}>
                    <PieChart className="w-3.5 h-3.5" /> Analytics
                  </button>
                  <button onClick={() => setActiveTab('finance')} className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-2 ${activeTab === 'finance' ? 'text-[#D4AF37] bg-[#D4AF37]/5' : 'text-gray-700'}`}>
                    <Wallet className="w-3.5 h-3.5" /> Finance
                  </button>
                  <div className="border-t border-gray-100"></div>
                  <button onClick={() => setActiveTab('depositApprovals')} className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-2 ${activeTab === 'depositApprovals' ? 'text-[#D4AF37] bg-[#D4AF37]/5' : 'text-gray-700'}`}>
                    <CheckCircle className="w-3.5 h-3.5" /> Deposit Approvals
                  </button>
                </div>
              </div>
            )}

            {/* Admin Dropdown */}
            {currentUser?.role === 'admin' && (
              <div className="relative group">
                <button
                  className={`px-3 py-2 text-sm font-medium transition-all rounded-sm flex items-center gap-1 ${
                    ['settings', 'commissionSettings'].includes(activeTab)
                      ? 'text-[#D4AF37] bg-[#D4AF37]/10'
                      : 'text-gray-600 hover:text-black hover:bg-gray-100'
                  }`}
                >
                  <Settings className="w-3.5 h-3.5 -mt-0.5" />
                  Settings
                  <ChevronDown className="w-3 h-3" />
                </button>
                <div className="absolute left-0 top-full mt-0 w-52 bg-white border border-gray-200 shadow-lg rounded-sm opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                  <button onClick={() => setActiveTab('commissionSettings')} className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-2 ${activeTab === 'commissionSettings' ? 'text-[#D4AF37] bg-[#D4AF37]/5' : 'text-gray-700'}`}>
                    <Sliders className="w-3.5 h-3.5" /> Commission Settings
                  </button>
                  <button onClick={() => setActiveTab('settings')} className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-2 ${activeTab === 'settings' ? 'text-[#D4AF37] bg-[#D4AF37]/5' : 'text-gray-700'}`}>
                    <Settings className="w-3.5 h-3.5" /> CRM Settings
                  </button>
                  <div className="border-t border-gray-100"></div>
                  <button onClick={() => navigate('/crm/admin')} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-2 text-gray-700">
                    <Shield className="w-3.5 h-3.5" /> Administration Panel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-[1600px] mx-auto px-6 py-4">
        {/* ==================== LAZY KEEP-ALIVE TABS ====================
             Mount once on first visit, then keep alive (display:none) forever.
             Result: ALL tab switches are INSTANT after first visit.
        */}

        {/* Dashboard */}
        <div style={{ display: activeTab === 'dashboard' ? 'block' : 'none' }}>
          {stats && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-black">{t('dashboard.title')}</h2>
                <div className="flex gap-2">
                  <Button onClick={() => setActiveTab('leads')} size="sm" className="bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-sm text-xs h-8">
                    {t('dashboard.viewAllLeads')}
                  </Button>
                  {currentUser?.role === 'admin' && (
                    <Button onClick={() => navigate('/crm/admin')} size="sm" className="bg-gray-800 text-white hover:bg-black rounded-sm text-xs h-8">
                      {t('dashboard.adminPanel')}
                    </Button>
                  )}
                </div>
              </div>

              {/* Compact Stats Row */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                <div className="bg-white border border-gray-200 p-3 rounded-sm flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#D4AF37]/10 rounded-sm flex items-center justify-center">
                    <FileText className="w-5 h-5 text-[#D4AF37]" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-black leading-tight">{stats.total_leads}</div>
                    <div className="text-xs text-gray-500">{t('dashboard.totalLeads')}</div>
                  </div>
                </div>
                <div className="bg-white border border-gray-200 p-3 rounded-sm flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-50 rounded-sm flex items-center justify-center">
                    <AlertCircle className="w-5 h-5 text-blue-500" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-black leading-tight">{stats.new_leads}</div>
                    <div className="text-xs text-gray-500">{t('dashboard.newLeads')}</div>
                  </div>
                </div>
                <div className="bg-white border border-gray-200 p-3 rounded-sm flex items-center gap-3">
                  <div className="w-10 h-10 bg-orange-50 rounded-sm flex items-center justify-center">
                    <Activity className="w-5 h-5 text-orange-500" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-black leading-tight">{stats.in_progress}</div>
                    <div className="text-xs text-gray-500">{t('dashboard.inProgress')}</div>
                  </div>
                </div>
                <div className="bg-white border border-gray-200 p-3 rounded-sm flex items-center gap-3">
                  <div className="w-10 h-10 bg-red-50 rounded-sm flex items-center justify-center">
                    <Clock className="w-5 h-5 text-red-500" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-black leading-tight">{stats.pending_callbacks}</div>
                    <div className="text-xs text-gray-500">{t('dashboard.pendingCallbacks')}</div>
                  </div>
                </div>
              </div>

              {/* Two-column layout: Recent Leads + Activity Stream */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Recent Leads */}
                <div className="bg-white border border-gray-200 rounded-sm">
                  <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-black">Recent Leads</h3>
                    <button onClick={() => setActiveTab('leads')} className="text-xs text-[#D4AF37] hover:underline">View all {stats.total_leads} →</button>
                  </div>
                  {recentLeads.length > 0 ? (
                    <div className="divide-y divide-gray-50">
                      {recentLeads.map((lead, i) => (
                        <div key={lead.id || i} className="px-4 py-2 hover:bg-gray-50 cursor-pointer flex items-center justify-between" onClick={() => setActiveTab('leads')}>
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-7 h-7 rounded-full bg-[#D4AF37]/10 flex items-center justify-center flex-shrink-0">
                              <span className="text-[10px] font-bold text-[#D4AF37]">{(lead.fullName || '?')[0]}</span>
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-medium text-black truncate">{lead.fullName}</div>
                              <div className="text-[10px] text-gray-400 truncate">{lead.email_display || lead.email}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                              lead.status === 'New' ? 'bg-blue-100 text-blue-700' :
                              lead.status === 'Callback' ? 'bg-pink-100 text-pink-700' :
                              lead.status?.includes('Deposit') ? 'bg-green-100 text-green-700' :
                              lead.status === 'In Progress' ? 'bg-cyan-100 text-cyan-700' :
                              lead.status === 'Not Interested' ? 'bg-gray-100 text-gray-600' :
                              lead.status === 'Potential Callback' ? 'bg-pink-50 text-pink-600' :
                              'bg-gray-100 text-gray-600'
                            }`}>{lead.status}</span>
                            <span className="text-[10px] text-gray-400">€{lead.amountLost}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 text-center text-xs text-gray-400">Loading...</div>
                  )}
                </div>

                {/* Activity Stream (EspoCRM style) */}
                <div className="bg-white border border-gray-200 rounded-sm">
                  <div className="px-4 py-2 border-b border-gray-100">
                    <h3 className="text-sm font-semibold text-black">Stream</h3>
                  </div>
                  {streamData.length > 0 ? (
                    <div className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
                      {streamData.map((item, i) => {
                        const initials = (item.user_name || '??').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
                        const colors = ['bg-blue-500', 'bg-green-500', 'bg-orange-500', 'bg-purple-500', 'bg-pink-500', 'bg-cyan-500', 'bg-amber-500'];
                        const avatarColor = colors[(item.user_name || '').length % colors.length];
                        
                        let actionText = '';
                        let detailContent = null;
                        
                        if (item.type === 'status_changed') {
                          actionText = <span>updated status of lead <strong className="text-[#D4AF37] cursor-pointer hover:underline">{item.lead_name}</strong></span>;
                          const statusText = (item.details || '').replace('Status changed from ', '').replace(' to ', ' → ');
                          detailContent = <span className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px] font-medium text-gray-700">{statusText || item.details}</span>;
                        } else if (item.type === 'note_added') {
                          actionText = <span>posted on lead <strong className="text-[#D4AF37] cursor-pointer hover:underline">{item.lead_name}</strong></span>;
                          detailContent = <span className="text-xs text-gray-600 italic">{item.details}</span>;
                        } else if (item.type === 'lead_created') {
                          actionText = <span>new lead <strong className="text-[#D4AF37] cursor-pointer hover:underline">{item.lead_name}</strong></span>;
                          detailContent = <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            item.details === 'New' ? 'bg-blue-100 text-blue-700' :
                            item.details === 'Callback' ? 'bg-pink-100 text-pink-700' :
                            item.details?.includes('Deposit') ? 'bg-green-100 text-green-700' :
                            item.details === 'In Progress' ? 'bg-cyan-100 text-cyan-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>{item.details}</span>;
                        } else if (item.type === 'lead_assigned') {
                          actionText = <span>assigned lead <strong className="text-[#D4AF37]">{item.lead_name}</strong></span>;
                          detailContent = <span className="text-xs text-gray-500">{item.details}</span>;
                        } else if (item.type === 'login') {
                          actionText = <span>logged in</span>;
                        } else {
                          actionText = <span>{item.details || item.type}</span>;
                        }
                        
                        const timeStr = item.timestamp ? (() => {
                          const d = new Date(item.timestamp);
                          const now = new Date();
                          const diffMs = now - d;
                          const diffMins = Math.floor(diffMs / 60000);
                          if (diffMins < 1) return 'Just now';
                          if (diffMins < 60) return `${diffMins}m ago`;
                          const diffHours = Math.floor(diffMins / 60);
                          if (diffHours < 24) return `${diffHours}h ago`;
                          return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
                        })() : '';
                        
                        return (
                          <div key={i} className="px-4 py-2.5 hover:bg-gray-50">
                            <div className="flex items-start gap-2.5">
                              <div className={`w-7 h-7 rounded-full ${avatarColor} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                                <span className="text-[10px] font-bold text-white">{initials}</span>
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-xs">
                                  <span className="font-semibold text-gray-800">{item.user_name}</span>
                                  {' '}<span className="text-gray-500">{actionText}</span>
                                </div>
                                {detailContent && <div className="mt-1">{detailContent}</div>}
                                <div className="text-[10px] text-gray-400 mt-1">{timeStr}</div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-6 text-center text-xs text-gray-400">No recent activity</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Leads - always mounted */}
        <div style={{ display: activeTab === 'leads' ? 'block' : 'none' }}>
          <LeadsTable currentUser={currentUser} urgentCallbackLead={callbackLead} onClearCallbackLead={() => setCallbackLead(null)} bootstrapData={bootstrapData} />
        </div>

        {/* Deposits - lazy mount, then keep alive */}
        {visitedTabs.has('deposits') && (
          <div style={{ display: activeTab === 'deposits' ? 'block' : 'none' }}>
            <DepositsManager 
              currentUser={currentUser} 
              pendingDepositData={pendingDepositData}
              onDepositCreated={() => setPendingDepositData(null)}
            />
          </div>
        )}

        {/* Earnings (Agent/Supervisor) */}
        {visitedTabs.has('earnings') && (currentUser?.role === 'agent' || currentUser?.role === 'supervisor') && (
          <div style={{ display: activeTab === 'earnings' ? 'block' : 'none' }}>
            <FinancialDashboard currentUser={currentUser} />
          </div>
        )}

        {/* Deposit Approvals (Admin) */}
        {visitedTabs.has('depositApprovals') && currentUser?.role === 'admin' && (
          <div style={{ display: activeTab === 'depositApprovals' ? 'block' : 'none' }}>
            <DepositApprovals currentUser={currentUser} />
          </div>
        )}

        {/* Analytics (Admin) */}
        {visitedTabs.has('analytics') && currentUser?.role === 'admin' && (
          <div style={{ display: activeTab === 'analytics' ? 'block' : 'none' }}>
            <AnalyticsDashboard currentUser={currentUser} />
          </div>
        )}

        {/* Finance (Admin) */}
        {visitedTabs.has('finance') && currentUser?.role === 'admin' && (
          <div style={{ display: activeTab === 'finance' ? 'block' : 'none' }}>
            <FinancialDashboard currentUser={currentUser} />
          </div>
        )}

        {/* Commission Settings (Admin) */}
        {visitedTabs.has('commissionSettings') && currentUser?.role === 'admin' && (
          <div style={{ display: activeTab === 'commissionSettings' ? 'block' : 'none' }}>
            <CommissionSettings currentUser={currentUser} />
          </div>
        )}

        {/* Revenue (Supervisor/Admin) */}
        {visitedTabs.has('revenue') && (currentUser?.role === 'supervisor' || currentUser?.role === 'admin') && (
          <div style={{ display: activeTab === 'revenue' ? 'block' : 'none' }}>
            <TeamRevenue currentUser={currentUser} />
          </div>
        )}

        {/* Team (Supervisor/Admin) */}
        {visitedTabs.has('team') && (currentUser?.role === 'supervisor' || currentUser?.role === 'admin') && (
          <div style={{ display: activeTab === 'team' ? 'block' : 'none' }}>
            <TeamMembers currentUser={currentUser} />
          </div>
        )}

        {/* Settings */}
        {visitedTabs.has('settings') && (
          <div style={{ display: activeTab === 'settings' ? 'block' : 'none' }}>
            <SettingsPanel />
          </div>
        )}
      </main>
      
      {/* Chat Widget */}
      <ChatWidget currentUser={currentUser} />
    </div>
  );
};

export default CRMDashboard;
