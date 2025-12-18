import React, { useState, useEffect, useCallback } from 'react';
import { Clock, Save, RefreshCw, Calendar, Shield, Bell, Check, X, User } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Switch } from '../ui/switch';
import { toast } from 'sonner';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api/admin`;

const DAY_NAMES = {
  0: 'Lunedì',
  1: 'Martedì',
  2: 'Mercoledì',
  3: 'Giovedì',
  4: 'Venerdì',
  5: 'Sabato',
  6: 'Domenica'
};

const SessionSettings = () => {
  const [settings, setSettings] = useState({
    session_start_hour: 8,
    session_start_minute: 0,
    session_end_hour: 18,
    session_end_minute: 30,
    work_days: [0, 1, 2, 3, 4],
    require_approval_after_hours: true,
    approval_duration_minutes: 30
  });
  const [loginRequests, setLoginRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('crmToken');
      const response = await axios.get(`${API}/session-settings`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSettings(response.data);
      setHasChanges(false);
    } catch (error) {
      toast.error('Errore nel caricamento delle impostazioni');
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchLoginRequests = useCallback(async () => {
    try {
      const token = localStorage.getItem('crmToken');
      const response = await axios.get(`${API}/login-requests`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setLoginRequests(response.data.requests);
    } catch (error) {
      console.error('Error fetching login requests:', error);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
    fetchLoginRequests();
    
    // Poll for new login requests every 30 seconds
    const interval = setInterval(fetchLoginRequests, 30000);
    return () => clearInterval(interval);
  }, [fetchSettings, fetchLoginRequests]);

  const handleSave = async () => {
    try {
      setSaving(true);
      const token = localStorage.getItem('crmToken');
      await axios.put(`${API}/session-settings`, settings, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Impostazioni salvate con successo');
      setHasChanges(false);
    } catch (error) {
      toast.error('Errore nel salvataggio');
      console.error('Error:', error);
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const toggleWorkDay = (day) => {
    const newDays = settings.work_days.includes(day)
      ? settings.work_days.filter(d => d !== day)
      : [...settings.work_days, day].sort();
    updateSetting('work_days', newDays);
  };

  const handleApprove = async (requestId, username) => {
    try {
      const token = localStorage.getItem('crmToken');
      await axios.post(`${API}/login-requests/${requestId}/approve`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success(`Accesso approvato per ${username}`);
      fetchLoginRequests();
    } catch (error) {
      toast.error('Errore nell\'approvazione');
    }
  };

  const handleDeny = async (requestId, username) => {
    try {
      const token = localStorage.getItem('crmToken');
      await axios.post(`${API}/login-requests/${requestId}/deny`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success(`Accesso negato per ${username}`);
      fetchLoginRequests();
    } catch (error) {
      toast.error('Errore nel rifiuto');
    }
  };

  const formatTime = (hour, minute) => {
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Impostazioni Sessione</h2>
          <p className="text-gray-500 mt-1">
            Configura gli orari di lavoro e le regole di accesso al sistema.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => { fetchSettings(); fetchLoginRequests(); }}
            disabled={loading}
            className="rounded-none"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="bg-[#D4AF37] hover:bg-[#B8941F] text-black rounded-none"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Salvataggio...' : 'Salva'}
          </Button>
        </div>
      </div>

      {/* Pending Login Requests */}
      {loginRequests.length > 0 && (
        <div className="bg-red-50 border-2 border-red-300 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Bell className="w-5 h-5 text-red-600" />
            <h3 className="font-bold text-red-800">Richieste di Accesso in Attesa ({loginRequests.length})</h3>
          </div>
          <div className="space-y-2">
            {loginRequests.map(req => (
              <div key={req.id} className="bg-white p-3 border border-red-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <User className="w-5 h-5 text-gray-500" />
                  <div>
                    <div className="font-semibold">{req.full_name} ({req.username})</div>
                    <div className="text-sm text-gray-500">
                      Ruolo: {req.role} • {req.reason}
                    </div>
                    <div className="text-xs text-gray-400">
                      Richiesto: {new Date(req.requested_at).toLocaleString('it-IT')}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => handleApprove(req.id, req.username)}
                    className="bg-green-600 hover:bg-green-700 text-white rounded-none"
                    size="sm"
                  >
                    <Check className="w-4 h-4 mr-1" />
                    Approva
                  </Button>
                  <Button
                    onClick={() => handleDeny(req.id, req.username)}
                    variant="destructive"
                    className="rounded-none"
                    size="sm"
                  >
                    <X className="w-4 h-4 mr-1" />
                    Nega
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        {/* Work Hours */}
        <div className="bg-white border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-[#D4AF37]" />
            <h3 className="font-bold text-gray-900">Orari di Lavoro</h3>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Inizio Sessione
              </label>
              <div className="flex gap-2 items-center">
                <Input
                  type="number"
                  min="0"
                  max="23"
                  value={settings.session_start_hour}
                  onChange={(e) => updateSetting('session_start_hour', parseInt(e.target.value) || 0)}
                  className="w-20 rounded-none"
                />
                <span className="text-gray-500">:</span>
                <Input
                  type="number"
                  min="0"
                  max="59"
                  value={settings.session_start_minute}
                  onChange={(e) => updateSetting('session_start_minute', parseInt(e.target.value) || 0)}
                  className="w-20 rounded-none"
                />
                <span className="text-gray-500 ml-2">
                  ({formatTime(settings.session_start_hour, settings.session_start_minute)})
                </span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Fine Sessione (Auto-Logout)
              </label>
              <div className="flex gap-2 items-center">
                <Input
                  type="number"
                  min="0"
                  max="23"
                  value={settings.session_end_hour}
                  onChange={(e) => updateSetting('session_end_hour', parseInt(e.target.value) || 0)}
                  className="w-20 rounded-none"
                />
                <span className="text-gray-500">:</span>
                <Input
                  type="number"
                  min="0"
                  max="59"
                  value={settings.session_end_minute}
                  onChange={(e) => updateSetting('session_end_minute', parseInt(e.target.value) || 0)}
                  className="w-20 rounded-none"
                />
                <span className="text-gray-500 ml-2">
                  ({formatTime(settings.session_end_hour, settings.session_end_minute)})
                </span>
              </div>
            </div>

            <div className="pt-2 text-sm text-gray-500">
              <Clock className="w-4 h-4 inline mr-1" />
              Fuso orario: Europe/Berlin (CET/CEST)
            </div>
          </div>
        </div>

        {/* Work Days */}
        <div className="bg-white border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-5 h-5 text-[#D4AF37]" />
            <h3 className="font-bold text-gray-900">Giorni Lavorativi</h3>
          </div>
          
          <div className="space-y-2">
            {[0, 1, 2, 3, 4, 5, 6].map(day => (
              <div 
                key={day}
                onClick={() => toggleWorkDay(day)}
                className={`p-3 border cursor-pointer transition-colors ${
                  settings.work_days.includes(day)
                    ? 'bg-green-50 border-green-300 text-green-800'
                    : 'bg-gray-50 border-gray-200 text-gray-500'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{DAY_NAMES[day]}</span>
                  {settings.work_days.includes(day) ? (
                    <Check className="w-5 h-5 text-green-600" />
                  ) : (
                    <X className="w-5 h-5 text-gray-400" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* After Hours Settings */}
      <div className="bg-white border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-5 h-5 text-[#D4AF37]" />
          <h3 className="font-bold text-gray-900">Sicurezza Fuori Orario</h3>
        </div>
        
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">Richiedi Approvazione Admin</div>
            <div className="text-sm text-gray-500">
              Se attivo, gli utenti non-admin devono richiedere l'approvazione per accedere fuori orario di lavoro.
              L'approvazione è valida per 30 minuti.
            </div>
          </div>
          <Switch
            checked={settings.require_approval_after_hours}
            onCheckedChange={(checked) => updateSetting('require_approval_after_hours', checked)}
          />
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 p-4">
        <h4 className="font-semibold text-blue-800 mb-2">Come Funziona</h4>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• Gli utenti vengono <strong>automaticamente disconnessi</strong> all'orario di fine sessione</li>
          <li>• Gli <strong>amministratori</strong> possono sempre accedere senza restrizioni</li>
          <li>• Fuori orario, gli utenti non-admin vedono un messaggio e la richiesta viene inviata qui</li>
          <li>• L'approvazione è <strong>valida per 30 minuti</strong>, dopo i quali l'utente deve richiedere nuovamente</li>
          <li>• Tutte le approvazioni e i rifiuti sono registrati nel <strong>log di audit</strong></li>
        </ul>
      </div>
    </div>
  );
};

export default SessionSettings;
