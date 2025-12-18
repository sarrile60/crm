import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Scale, Users, TrendingUp, MousePointerClick, LogOut, Eye, Calendar, Euro } from 'lucide-react';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import axios from 'axios';
import { useTranslation } from 'react-i18next';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const AdminDashboard = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [analytics, setAnalytics] = useState(null);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('adminToken');
    if (!token) {
      navigate('/admin-portal-login');
      return;
    }
    fetchData();
    
    // Start session check interval (every 60 seconds)
    const sessionCheckInterval = setInterval(checkSession, 60000);
    
    // Check session immediately on load
    checkSession();
    
    return () => clearInterval(sessionCheckInterval);
  }, []);
  
  const checkSession = async () => {
    try {
      const token = localStorage.getItem('adminToken');
      if (!token) return;
      
      const response = await axios.get(`${API}/crm/auth/session-check`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!response.data.valid) {
        // Session expired - auto logout
        toast.error(response.data.reason || t('session.sessionExpired'));
        localStorage.removeItem('adminToken');
        navigate('/admin-portal-login');
      }
    } catch (error) {
      // If session check fails with 401, logout
      if (error.response?.status === 401) {
        localStorage.removeItem('adminToken');
        navigate('/admin-portal-login');
      }
    }
  };

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('adminToken');
      const headers = { Authorization: `Bearer ${token}` };

      const [analyticsRes, leadsRes] = await Promise.all([
        axios.get(`${API}/admin/analytics`, { headers }),
        axios.get(`${API}/admin/leads`, { headers })
      ]);

      setAnalytics(analyticsRes.data);
      setLeads(leadsRes.data);
    } catch (error) {
      toast.error(t('users.errorLoadingData'));
      if (error.response?.status === 401) {
        navigate('/admin-portal-login');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      // Call logout API to log the event in audit trail
      const token = localStorage.getItem('adminToken');
      if (token) {
        await axios.post(`${API}/crm/auth/logout`, {}, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }
    } catch (error) {
      // Continue with logout even if API call fails
      console.error('Logout API error:', error);
    }
    
    localStorage.removeItem('adminToken');
    toast.success('Logout effettuato');
    navigate('/admin-portal-login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white text-xl">Caricamento...</div>
      </div>
    );
  }

  const conversionRate = analytics?.formStarts > 0
    ? ((analytics.totalLeads / analytics.formStarts) * 100).toFixed(1)
    : 0;

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <header className="bg-[#121212] border-b border-white/25 py-4 px-8">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Scale className="w-8 h-8 text-[#00FFD1]" />
            <div>
              <h1 className="text-white text-xl font-semibold">1 LAW SOLICITORS</h1>
              <p className="text-white/85 text-sm">Admin Dashboard</p>
            </div>
          </div>
          <Button onClick={handleLogout} className="bg-white/10 text-white hover:bg-white hover:text-black rounded-none">
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto p-8">
        {/* Analytics Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          <div className="bg-[#121212] border border-white/25 p-6">
            <div className="flex items-center justify-between mb-4">
              <Eye className="w-8 h-8 text-[#00FFD1]" />
              <span className="text-white/85 text-sm">Visite Pagina</span>
            </div>
            <div className="text-4xl font-bold text-white mb-2">{analytics?.pageViews || 0}</div>
            <p className="text-white/85 text-sm">Visualizzazioni totali</p>
          </div>

          <div className="bg-[#121212] border border-white/25 p-6">
            <div className="flex items-center justify-between mb-4">
              <Users className="w-8 h-8 text-[#00FFD1]" />
              <span className="text-white/85 text-sm">Form Iniziati</span>
            </div>
            <div className="text-4xl font-bold text-white mb-2">{analytics?.formStarts || 0}</div>
            <p className="text-white/85 text-sm">Utenti che hanno iniziato il form</p>
          </div>

          <div className="bg-[#121212] border border-white/25 p-6">
            <div className="flex items-center justify-between mb-4">
              <TrendingUp className="w-8 h-8 text-[#00FFD1]" />
              <span className="text-white/85 text-sm">Lead Totali</span>
            </div>
            <div className="text-4xl font-bold text-white mb-2">{analytics?.totalLeads || 0}</div>
            <p className="text-white/85 text-sm">Form completati con successo</p>
          </div>

          <div className="bg-[#121212] border border-white/25 p-6">
            <div className="flex items-center justify-between mb-4">
              <MousePointerClick className="w-8 h-8 text-[#00FFD1]" />
              <span className="text-white/85 text-sm">Click CTA</span>
            </div>
            <div className="text-4xl font-bold text-white mb-2">{analytics?.ctaClicks || 0}</div>
            <p className="text-white/85 text-sm">Click sui pulsanti CTA</p>
          </div>
        </div>

        {/* Conversion Rate */}
        <div className="bg-[#121212] border border-white/25 p-6 mb-12">
          <h3 className="text-white text-xl font-semibold mb-4">Tasso di Conversione</h3>
          <div className="flex items-end gap-8">
            <div>
              <div className="text-5xl font-bold text-[#00FFD1] mb-2">{conversionRate}%</div>
              <p className="text-white/85">Form iniziati → Lead completati</p>
            </div>
            <div className="flex-1">
              <div className="h-4 bg-black rounded-none overflow-hidden">
                <div
                  className="h-full bg-[#00FFD1] transition-all"
                  style={{ width: `${conversionRate}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>

        {/* Leads Table */}
        <div className="bg-[#121212] border border-white/25">
          <div className="p-6 border-b border-white/25">
            <h3 className="text-white text-2xl font-semibold">{t('dashboard.receivedLeads')}</h3>
            <p className="text-white/85">{t('dashboard.completeListConsultations')}</p>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-black">
                <tr>
                  <th className="text-left text-white/85 p-4 font-semibold">{t('common.date')}</th>
                  <th className="text-left text-white/85 p-4 font-semibold">{t('common.name')}</th>
                  <th className="text-left text-white/85 p-4 font-semibold">{t('common.email')}</th>
                  <th className="text-left text-white/85 p-4 font-semibold">{t('common.phone')}</th>
                  <th className="text-left text-white/85 p-4 font-semibold">{t('crm.scammerCompany')}</th>
                  <th className="text-left text-white/85 p-4 font-semibold">{t('common.amount')}</th>
                </tr>
              </thead>
              <tbody>
                {leads.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="text-center text-white/85 p-8">
                      {t('dashboard.noLeadsReceived')}
                    </td>
                  </tr>
                ) : (
                  leads.map((lead, index) => (
                    <tr key={lead._id} className="border-t border-white/25 hover:bg-black/50 transition-colors">
                      <td className="p-4 text-white/85">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-[#00FFD1]" />
                          {new Date(lead.createdAt).toLocaleDateString('it-IT')}
                        </div>
                      </td>
                      <td className="p-4 text-white font-semibold">{lead.fullName}</td>
                      <td className="p-4 text-white/85">{lead.email}</td>
                      <td className="p-4 text-white/85">+39 {lead.phone}</td>
                      <td className="p-4 text-white/85">{lead.scammerCompany}</td>
                      <td className="p-4">
                        <div className="flex items-center gap-1 text-[#00FFD1] font-semibold">
                          <Euro className="w-4 h-4" />
                          {lead.amountLost}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Lead Details */}
        {leads.length > 0 && (
          <div className="mt-8 space-y-6">
            <h3 className="text-white text-2xl font-semibold mb-4">Dettagli Lead</h3>
            {leads.map((lead) => (
              <div key={lead._id} className="bg-[#121212] border border-white/25 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-white text-xl font-semibold">{lead.fullName}</h4>
                  <span className="text-white/85 text-sm">
                    {new Date(lead.createdAt).toLocaleString('it-IT')}
                  </span>
                </div>
                <div className="grid md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <span className="text-white/85 text-sm">Email:</span>
                    <p className="text-white">{lead.email}</p>
                  </div>
                  <div>
                    <span className="text-white/85 text-sm">Telefono:</span>
                    <p className="text-white">+39 {lead.phone}</p>
                  </div>
                  <div>
                    <span className="text-white/85 text-sm">Azienda Truffatrice:</span>
                    <p className="text-white">{lead.scammerCompany}</p>
                  </div>
                  <div>
                    <span className="text-white/85 text-sm">Importo Perso:</span>
                    <p className="text-[#00FFD1] font-semibold">{lead.amountLost}</p>
                  </div>
                </div>
                <div>
                  <span className="text-white/85 text-sm">Descrizione Caso:</span>
                  <p className="text-white mt-2 leading-relaxed">{lead.caseDetails}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;