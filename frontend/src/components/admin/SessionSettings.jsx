import React, { useState, useEffect, useCallback } from 'react';
import { Clock, Save, RefreshCw, Calendar, Shield, Bell, Check, X, User, Globe } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Switch } from '../ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
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
    approval_duration_minutes: 30,
    timezone: 'Europe/Berlin',
    timezone_offset: 'GMT+1',
    current_time: '',
    current_day: '',
    all_timezones: []
  });
  const [loginRequests, setLoginRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [localTime, setLocalTime] = useState(''); // Live updating time

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
    const requestInterval = setInterval(fetchLoginRequests, 30000);
    
    return () => {
      clearInterval(requestInterval);
    };
  }, [fetchSettings, fetchLoginRequests]);

  // Live clock update every second
  useEffect(() => {
    const updateLocalTime = () => {
      // Get the timezone to display (preview or current selected)
      const displayTimezone = previewTimezone || settings.timezone;
      if (displayTimezone && settings.all_timezones?.length > 0) {
        const tzInfo = settings.all_timezones.find(tz => tz.value === displayTimezone);
        if (tzInfo) {
          // Calculate current time in the selected timezone
          try {
            const now = new Date();
            const timeStr = now.toLocaleTimeString('it-IT', { 
              timeZone: displayTimezone,
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            });
            const dateStr = now.toLocaleDateString('it-IT', {
              timeZone: displayTimezone,
              weekday: 'long',
              year: 'numeric',
              month: '2-digit',
              day: '2-digit'
            });
            setLocalTime({ time: timeStr, date: dateStr, offset: tzInfo.offset });
          } catch (e) {
            console.error('Timezone error:', e);
          }
        }
      }
    };
    
    updateLocalTime();
    const timeInterval = setInterval(updateLocalTime, 1000);
    
    return () => clearInterval(timeInterval);
  }, [settings.timezone, settings.all_timezones, previewTimezone]);

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

      {/* Timezone Settings */}
      <div className={`bg-white border-2 p-6 transition-all ${hasChanges ? 'border-[#D4AF37] shadow-lg' : 'border-gray-200'}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-[#D4AF37]" />
            <h3 className="font-bold text-gray-900">Fuso Orario</h3>
          </div>
          {hasChanges && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-amber-600 font-medium animate-pulse">
                ⚠️ Modifiche non salvate
              </span>
              <Button
                onClick={handleSave}
                disabled={saving}
                className="bg-[#D4AF37] hover:bg-[#B8941F] text-black rounded-none"
                size="sm"
              >
                <Save className="w-4 h-4 mr-1" />
                {saving ? 'Salvataggio...' : 'Salva Ora'}
              </Button>
            </div>
          )}
        </div>
        
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Seleziona Fuso Orario
            </label>
            <Select
              value={settings.timezone || 'Europe/Berlin'}
              onValueChange={(value) => {
                updateSetting('timezone', value);
                setPreviewTimezone(null); // Clear preview when value is selected
              }}
            >
              <SelectTrigger className="rounded-none">
                <SelectValue placeholder="Seleziona fuso orario">
                  {settings.all_timezones?.find(tz => tz.value === settings.timezone)?.label || settings.timezone}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-80">
                {settings.all_timezones && settings.all_timezones.length > 0 ? (
                  <>
                    {['Europe', 'Americas', 'Asia', 'Africa', 'Oceania', 'UTC'].map(region => (
                      <React.Fragment key={region}>
                        <div className="px-2 py-1 text-xs font-bold text-gray-500 bg-gray-100 sticky top-0 z-10">
                          {region}
                        </div>
                        {settings.all_timezones
                          .filter(tz => tz.region === region)
                          .map(tz => (
                            <SelectItem 
                              key={tz.value} 
                              value={tz.value}
                              className="flex justify-between cursor-pointer"
                            >
                              <div className="flex items-center justify-between w-full">
                                <span>{tz.city}</span>
                                <span className="ml-4 text-gray-500 font-mono text-xs whitespace-nowrap">
                                  {tz.offset} • {tz.current_time}
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                      </React.Fragment>
                    ))}
                  </>
                ) : (
                  <SelectItem value="Europe/Berlin">Berlin (GMT+1)</SelectItem>
                )}
              </SelectContent>
            </Select>
            
            {/* Current timezone info */}
            <div className="mt-3 p-2 bg-gray-50 border border-gray-200 rounded-none text-xs text-gray-600">
              <span className="font-semibold">Fuso attuale:</span> {settings.timezone}
              <span className="ml-2 font-mono text-[#D4AF37]">{settings.timezone_offset || localTime?.offset}</span>
            </div>
          </div>
          
          <div className={`p-4 border-2 transition-all ${hasChanges ? 'bg-amber-50 border-amber-300' : 'bg-gray-50 border-gray-200'}`}>
            <div className="flex items-center justify-between mb-1">
              <div className="text-sm text-gray-500">
                {hasChanges ? '👁️ Anteprima (Non Salvato)' : 'Ora Corrente nel Fuso Selezionato'}
              </div>
              {hasChanges && (
                <span className="text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full animate-pulse">
                  Clicca Salva
                </span>
              )}
            </div>
            <div className={`text-4xl font-mono font-bold ${hasChanges ? 'text-amber-600' : 'text-[#D4AF37]'}`}>
              {localTime?.time || '--:--:--'}
            </div>
            <div className="text-sm text-gray-600 mt-1 capitalize">
              {localTime?.date || ''}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <div className={`text-sm font-mono font-bold ${hasChanges ? 'text-amber-700' : 'text-[#D4AF37]'}`}>
                {localTime?.offset || settings.timezone_offset}
              </div>
              <div className="text-xs text-gray-400">
                {settings.timezone}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* After Hours Settings */}
      <div className="bg-white border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-5 h-5 text-[#D4AF37]" />
          <h3 className="font-bold text-gray-900">Sicurezza Fuori Orario</h3>
        </div>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Richiedi Approvazione Admin</div>
              <div className="text-sm text-gray-500">
                Se attivo, gli utenti non-admin devono richiedere l'approvazione per accedere fuori orario di lavoro.
              </div>
            </div>
            <Switch
              checked={settings.require_approval_after_hours}
              onCheckedChange={(checked) => updateSetting('require_approval_after_hours', checked)}
            />
          </div>
          
          {settings.require_approval_after_hours && (
            <div className="pt-4 border-t border-gray-200">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Durata Approvazione (minuti)
              </label>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min="5"
                  max="480"
                  value={settings.approval_duration_minutes}
                  onChange={(e) => updateSetting('approval_duration_minutes', parseInt(e.target.value) || 30)}
                  className="w-24 rounded-none"
                />
                <span className="text-gray-500">minuti</span>
                <div className="text-sm text-gray-400 ml-4">
                  (Tempo durante il quale l'utente può accedere dopo l'approvazione)
                </div>
              </div>
              <div className="mt-2 flex gap-2">
                {[15, 30, 60, 120].map(mins => (
                  <Button
                    key={mins}
                    variant="outline"
                    size="sm"
                    onClick={() => updateSetting('approval_duration_minutes', mins)}
                    className={`rounded-none ${settings.approval_duration_minutes === mins ? 'bg-[#D4AF37] text-black' : ''}`}
                  >
                    {mins} min
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 p-4">
        <h4 className="font-semibold text-blue-800 mb-2">Come Funziona</h4>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• Gli utenti vengono <strong>automaticamente disconnessi</strong> all'orario di fine sessione</li>
          <li>• Gli <strong>amministratori</strong> possono sempre accedere senza restrizioni</li>
          <li>• Fuori orario, gli utenti non-admin vedono un messaggio e la richiesta viene inviata qui</li>
          <li>• L'approvazione è <strong>valida per {settings.approval_duration_minutes} minuti</strong>, dopo i quali l'utente deve richiedere nuovamente</li>
          <li>• Tutte le approvazioni e i rifiuti sono registrati nel <strong>log di audit</strong></li>
        </ul>
      </div>
    </div>
  );
};

export default SessionSettings;
