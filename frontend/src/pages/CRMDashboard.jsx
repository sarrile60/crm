import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Scale, Users, TrendingUp, AlertCircle, LogOut, Settings, FileText, Bell } from 'lucide-react';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import axios from 'axios';
import LeadsTable from '../components/crm/LeadsTable';
import UserManagement from '../components/crm/UserManagement';
import SettingsPanel from '../components/crm/SettingsPanel';
import CallbackNotifications from '../components/crm/CallbackNotifications';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const CRMDashboard = () => {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [callbackLead, setCallbackLead] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('crmToken');
    const user = localStorage.getItem('crmUser');
    
    if (!token || !user) {
      navigate('/crm/login');
      return;
    }
    
    setCurrentUser(JSON.parse(user));
    fetchData();
  }, []);

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

  const handleLogout = () => {
    localStorage.removeItem('crmToken');
    localStorage.removeItem('crmUser');
    toast.success('Logout effettuato');
    navigate('/crm/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-black text-xl">Caricamento...</div>
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
              <p className="text-gray-400 text-sm">{currentUser?.full_name} - {currentUser?.role}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <CallbackNotifications />
            <Button onClick={handleLogout} className="bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none">
              <LogOut className="w-4 h-4 mr-2" />
              Logout
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
            Dashboard
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
            Leads
          </button>
          {(currentUser?.role === 'admin' || currentUser?.role === 'manager') && (
            <button
              onClick={() => setActiveTab('users')}
              className={`px-4 py-2 font-semibold transition-all ${
                activeTab === 'users'
                  ? 'text-[#D4AF37] border-b-2 border-[#D4AF37]'
                  : 'text-gray-600 hover:text-black'
              }`}
            >
              <Users className="w-4 h-4 inline mr-2" />
              Utenti
            </button>
          )}
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
              Impostazioni
            </button>
          )}
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-[1600px] mx-auto p-8">
        {activeTab === 'dashboard' && stats && (
          <div>
            <h2 className="text-3xl font-bold text-black mb-8">Dashboard</h2>
            
            {/* Stats Cards */}
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
              <div className="bg-white border-2 border-[#D4AF37] p-6 shadow-lg">
                <div className="flex items-center justify-between mb-4">
                  <FileText className="w-8 h-8 text-[#D4AF37]" />
                  <span className="text-sm text-gray-600">Totale</span>
                </div>
                <div className="text-4xl font-bold text-black mb-2">{stats.total_leads}</div>
                <p className="text-gray-600">Lead Totali</p>
              </div>

              <div className="bg-white border-2 border-gray-300 p-6 shadow-lg">
                <div className="flex items-center justify-between mb-4">
                  <AlertCircle className="w-8 h-8 text-blue-600" />
                  <span className="text-sm text-gray-600">Nuovi</span>
                </div>
                <div className="text-4xl font-bold text-black mb-2">{stats.new_leads}</div>
                <p className="text-gray-600">Lead Nuovi</p>
              </div>

              <div className="bg-white border-2 border-gray-300 p-6 shadow-lg">
                <div className="flex items-center justify-between mb-4">
                  <TrendingUp className="w-8 h-8 text-orange-600" />
                  <span className="text-sm text-gray-600">In Corso</span>
                </div>
                <div className="text-4xl font-bold text-black mb-2">{stats.in_progress}</div>
                <p className="text-gray-600">In Lavorazione</p>
              </div>

              <div className="bg-white border-2 border-gray-300 p-6 shadow-lg">
                <div className="flex items-center justify-between mb-4">
                  <Bell className="w-8 h-8 text-red-600" />
                  <span className="text-sm text-gray-600">Urgenti</span>
                </div>
                <div className="text-4xl font-bold text-black mb-2">{stats.pending_callbacks}</div>
                <p className="text-gray-600">Callback Pendenti</p>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-gray-50 border-2 border-gray-200 p-6">
              <h3 className="text-xl font-bold text-black mb-4">Azioni Rapide</h3>
              <div className="flex flex-wrap gap-4">
                <Button onClick={() => setActiveTab('leads')} className="bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none">
                  Visualizza Tutti i Lead
                </Button>
                {(currentUser?.role === 'admin' || currentUser?.role === 'manager') && (
                  <Button onClick={() => setActiveTab('users')} className="bg-black text-white hover:bg-gray-800 rounded-none">
                    Gestione Utenti
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'leads' && <LeadsTable currentUser={currentUser} />}
        {activeTab === 'users' && <UserManagement currentUser={currentUser} />}
        {activeTab === 'settings' && <SettingsPanel />}
      </main>
    </div>
  );
};

export default CRMDashboard;