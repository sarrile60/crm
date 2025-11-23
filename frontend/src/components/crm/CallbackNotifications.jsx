import React, { useState, useEffect } from 'react';
import { Bell, Phone, Clock } from 'lucide-react';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { toast } from 'sonner';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const CallbackNotifications = ({ onCallbackAlert, currentUser }) => {
  const [reminders, setReminders] = useState([]);
  const [pendingCallbacks, setPendingCallbacks] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [urgentCallback, setUrgentCallback] = useState(null);
  const [showUrgentModal, setShowUrgentModal] = useState(false);
  const [snoozeData, setSnoozeData] = useState({});
  const [totalNotifications, setTotalNotifications] = useState(0);
  const [urgentCallbackQueue, setUrgentCallbackQueue] = useState([]);

  useEffect(() => {
    fetchReminders();
    fetchPendingCallbacks();
    checkUpcomingCallbacks();
    
    // Check for reminders and callbacks every 30 seconds
    const interval = setInterval(() => {
      checkUpcomingCallbacks();
      fetchPendingCallbacks();
    }, 30000);
    
    // Check for snoozed callbacks every 10 seconds
    const snoozeInterval = setInterval(checkSnoozedCallbacks, 10000);
    
    return () => {
      clearInterval(interval);
      clearInterval(snoozeInterval);
    };
  }, []);

  const fetchReminders = async () => {
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      const res = await axios.get(`${API}/crm/reminders`, { headers });
      setReminders(res.data);
      updateTotalNotifications(res.data.length, pendingCallbacks.length);
    } catch (error) {
      console.error('Error fetching reminders:', error);
    }
  };

  const fetchPendingCallbacks = async () => {
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      const leadsRes = await axios.get(`${API}/crm/leads`, { headers });
      const allLeads = leadsRes.data;
      
      // Statuses that require callback notifications
      const callbackStatuses = ['Callback', 'Potential Callback', 'Pharos in progress'];
      const depositStatuses = ['Deposit 1', 'Deposit 2', 'Deposit 3', 'Deposit 4', 'Deposit 5'];
      const allNotifyStatuses = [...callbackStatuses, ...depositStatuses];
      
      // Filter leads - ONLY show OVERDUE callbacks (scaduto)
      const now = new Date();
      const pending = allLeads.filter(lead => {
        // Only show if status requires callback AND has callback date
        if (!allNotifyStatuses.includes(lead.status) || !lead.callback_date) {
          return false;
        }
        
        const callbackTime = new Date(lead.callback_date);
        
        // ONLY show callbacks that are OVERDUE (past the callback time)
        // When agent changes callback time to future, it disappears automatically
        const isOverdue = callbackTime < now;
        
        return isOverdue;
      });
      
      // Sort by callback date (most overdue first - oldest at top)
      pending.sort((a, b) => new Date(a.callback_date) - new Date(b.callback_date));
      
      setPendingCallbacks(pending);
      updateTotalNotifications(reminders.length, pending.length);
    } catch (error) {
      console.error('Error fetching pending callbacks:', error);
    }
  };

  const updateTotalNotifications = (remindersCount, callbacksCount) => {
    setTotalNotifications(remindersCount + callbacksCount);
  };

  const checkSnoozedCallbacks = () => {
    const now = Date.now();
    const snoozeDataFromStorage = JSON.parse(localStorage.getItem('callback_snoozes') || '{}');
    
    const newAlerts = [];
    
    Object.keys(snoozeDataFromStorage).forEach(leadId => {
      const snooze = snoozeDataFromStorage[leadId];
      
      // Check if snooze time has passed
      if (snooze.snoozeUntil <= now) {
        // Re-trigger the callback alert
        if (snooze.lead) {
          newAlerts.push(snooze.lead);
          
          // Update snooze data
          snoozeDataFromStorage[leadId] = {
            ...snooze,
            snoozeUntil: null
          };
          localStorage.setItem('callback_snoozes', JSON.stringify(snoozeDataFromStorage));
        }
      }
    });
    
    // Add all new alerts to queue
    if (newAlerts.length > 0) {
      setUrgentCallbackQueue(prev => [...prev, ...newAlerts]);
      playAlertSound();
    }
  };

  const checkUpcomingCallbacks = async () => {
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      const leadsRes = await axios.get(`${API}/crm/leads`, { headers });
      const allLeads = leadsRes.data;
      
      const now = new Date();
      
      // Statuses that require callback notifications
      const callbackStatuses = ['Callback', 'Potential Callback', 'Pharos in progress'];
      const depositStatuses = ['Deposit 1', 'Deposit 2', 'Deposit 3', 'Deposit 4', 'Deposit 5'];
      const allNotifyStatuses = [...callbackStatuses, ...depositStatuses];
      
      // Get current snooze data
      const snoozeDataFromStorage = JSON.parse(localStorage.getItem('callback_snoozes') || '{}');
      
      // Check for callbacks within the next 1 minute
      const newUrgentCallbacks = [];
      
      for (const lead of allLeads) {
        if (allNotifyStatuses.includes(lead.status) && lead.callback_date) {
          const callbackTime = new Date(lead.callback_date);
          const timeDiff = callbackTime - now;
          
          // Skip if currently snoozed
          const snooze = snoozeDataFromStorage[lead.id];
          if (snooze && snooze.snoozeUntil > Date.now()) {
            continue;
          }
          
          // Alert if callback is within 30 seconds to 90 seconds from now
          if (timeDiff > 30000 && timeDiff <= 90000) {
            // Check if we already alerted for this specific callback time
            const alertKey = `callback_alerted_${lead.id}_${lead.callback_date}`;
            const alerted = localStorage.getItem(alertKey);
            
            if (!alerted) {
              newUrgentCallbacks.push(lead);
              localStorage.setItem(alertKey, 'true');
            }
          }
        }
      }
      
      // Add all new urgent callbacks to queue
      if (newUrgentCallbacks.length > 0) {
        setUrgentCallbackQueue(prev => [...prev, ...newUrgentCallbacks]);
        playAlertSound();
      }
      
      fetchReminders();
      fetchPendingCallbacks();
    } catch (error) {
      console.error('Error checking callbacks:', error);
    }
  };

  const playAlertSound = () => {
    // Create a simple beep sound
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
    } catch (error) {
      console.error('Error playing sound:', error);
    }
  };

  const handleCallNow = (lead) => {
    // Clear snooze data for this lead
    const snoozeDataFromStorage = JSON.parse(localStorage.getItem('callback_snoozes') || '{}');
    delete snoozeDataFromStorage[lead.id];
    localStorage.setItem('callback_snoozes', JSON.stringify(snoozeDataFromStorage));
    
    // Call the parent callback to switch to leads tab and open the lead
    if (onCallbackAlert) {
      onCallbackAlert(lead);
    }
    setShowUrgentModal(false);
  };

  const handleSnooze = async (lead) => {
    const snoozeDataFromStorage = JSON.parse(localStorage.getItem('callback_snoozes') || '{}');
    const currentSnooze = snoozeDataFromStorage[lead.id] || { count: 0 };
    
    const newCount = currentSnooze.count + 1;
    
    if (newCount >= 3) {
      // Notify supervisor on 3rd snooze
      try {
        const token = localStorage.getItem('crmToken');
        const headers = { Authorization: `Bearer ${token}` };
        
        const response = await axios.post(
          `${API}/crm/callback-snooze-alert?lead_id=${lead.id}&agent_id=${currentUser.id}`,
          {},
          { headers }
        );
        
        if (response.data.success) {
          toast.warning(`Supervisor ${response.data.supervisor} è stato notificato`);
        }
      } catch (error) {
        console.error('Error notifying supervisor:', error);
      }
      
      // Reset count and close modal
      delete snoozeDataFromStorage[lead.id];
      localStorage.setItem('callback_snoozes', JSON.stringify(snoozeDataFromStorage));
      setShowUrgentModal(false);
      return;
    }
    
    // Schedule snooze for 5 minutes
    const snoozeUntil = Date.now() + (5 * 60 * 1000); // 5 minutes
    
    snoozeDataFromStorage[lead.id] = {
      count: newCount,
      snoozeUntil: snoozeUntil,
      lead: lead
    };
    
    localStorage.setItem('callback_snoozes', JSON.stringify(snoozeDataFromStorage));
    
    toast.info(`Callback posticipato di 5 minuti (${newCount}/2)`);
    setShowUrgentModal(false);
  };

  const handleCompleteReminder = async (reminderId) => {
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      await axios.put(`${API}/crm/reminders/${reminderId}/complete`, {}, { headers });
      toast.success('Reminder completato');
      fetchReminders();
    } catch (error) {
      toast.error('Errore nel completamento del reminder');
    }
  };

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="relative p-2 hover:bg-gray-800 rounded transition-colors"
      >
        <Bell className="w-6 h-6 text-white" />
        {totalNotifications > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center animate-pulse">
            {totalNotifications}
          </span>
        )}
      </button>

      {/* Urgent Callback Alert Modal - NO X BUTTON */}
      <Dialog open={showUrgentModal} onOpenChange={() => {}}>
        <DialogContent 
          className={`max-w-lg border-4 ${urgentCallback?.status?.startsWith('Deposit') ? 'bg-blue-50 border-blue-600' : 'bg-red-50 border-red-600'}`}
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className={`text-3xl font-bold flex items-center gap-3 ${urgentCallback?.status?.startsWith('Deposit') ? 'text-blue-600' : 'text-red-600'}`}>
              <Phone className="w-8 h-8 animate-bounce" />
              {urgentCallback?.status?.startsWith('Deposit') ? 'DEPOSIT URGENTE!' : 'CALLBACK URGENTE!'}
            </DialogTitle>
          </DialogHeader>
          {urgentCallback && (
            <div className="space-y-4">
              <div className={`bg-white border-2 p-6 ${urgentCallback?.status?.startsWith('Deposit') ? 'border-blue-600' : 'border-red-600'}`}>
                <div className={`flex items-center gap-2 font-bold mb-4 ${urgentCallback?.status?.startsWith('Deposit') ? 'text-blue-600' : 'text-red-600'}`}>
                  <Clock className="w-6 h-6" />
                  <span className="text-xl">Tra meno di 1 minuto!</span>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-semibold text-gray-600">Cliente:</label>
                    <p className="text-xl font-bold text-black">{urgentCallback.fullName}</p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-600">Telefono:</label>
                    <p className="text-2xl font-bold text-[#D4AF37]">+39 {urgentCallback.phone}</p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-600">Importo:</label>
                    <p className="text-lg font-semibold text-black">{urgentCallback.amountLost}</p>
                  </div>
                  {urgentCallback.callback_notes && (
                    <div>
                      <label className="text-sm font-semibold text-gray-600">Note:</label>
                      <p className="text-black">{urgentCallback.callback_notes}</p>
                    </div>
                  )}
                  <div>
                    <label className="text-sm font-semibold text-gray-600">Stato:</label>
                    <p className="text-lg font-bold text-[#D4AF37]">{urgentCallback.status}</p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-600">
                      {urgentCallback?.status?.startsWith('Deposit') ? 'Ora Deposit:' : 'Ora Callback:'}
                    </label>
                    <p className="text-black font-semibold">
                      {new Date(urgentCallback.callback_date).toLocaleTimeString('it-IT', { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </p>
                  </div>
                </div>
              </div>
              
              {/* Check snooze count */}
              {(() => {
                const snoozeDataFromStorage = JSON.parse(localStorage.getItem('callback_snoozes') || '{}');
                const currentSnooze = snoozeDataFromStorage[urgentCallback.id] || { count: 0 };
                const snoozeCount = currentSnooze.count;
                
                return snoozeCount > 0 && (
                  <div className="bg-yellow-100 border-2 border-yellow-500 p-3 text-center">
                    <p className="text-sm font-bold text-yellow-800">
                      ⚠️ Hai posticipato {snoozeCount} volte. 
                      {snoozeCount === 2 ? ' Il prossimo posticipo notificherà il supervisore!' : ''}
                    </p>
                  </div>
                );
              })()}
              
              <div className="flex gap-3">
                <Button
                  onClick={() => handleCallNow(urgentCallback)}
                  className={`flex-1 text-white rounded-none text-lg py-6 font-bold ${urgentCallback?.status?.startsWith('Deposit') ? 'bg-green-600 hover:bg-green-700' : 'bg-green-600 hover:bg-green-700'}`}
                >
                  <Phone className="w-5 h-5 mr-2" />
                  CHIAMA ORA
                </Button>
                <Button
                  onClick={() => handleSnooze(urgentCallback)}
                  className="flex-1 bg-orange-500 text-white hover:bg-orange-600 rounded-none text-lg py-6 font-bold"
                >
                  <Clock className="w-5 h-5 mr-2" />
                  PIÙ TARDI
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Notifications Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-3xl bg-white">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-black flex items-center gap-2">
              <Bell className="w-6 h-6" />
              Notifiche ({totalNotifications})
            </DialogTitle>
            <p className="text-sm text-gray-500 mt-2">
              💡 Mostra solo callback scaduti. Scompaiono quando cambi lo stato o riprogrammi l'ora
            </p>
          </DialogHeader>
          <div className="space-y-6 max-h-[600px] overflow-y-auto">
            {/* Overdue Callbacks Section */}
            <div>
              <h3 className="text-lg font-bold text-black mb-3 flex items-center gap-2">
                <Phone className="w-5 h-5 text-red-600" />
                Callback Scaduti ({pendingCallbacks.length})
              </h3>
              {pendingCallbacks.length === 0 ? (
                <p className="text-center text-gray-500 py-4 bg-gray-50 border border-gray-200">
                  Nessun callback scaduto
                </p>
              ) : (
                <div className="space-y-3">
                  {pendingCallbacks.map((lead) => {
                    const callbackTime = new Date(lead.callback_date);
                    const now = new Date();
                    const timeDiff = now - callbackTime; // How long overdue
                    const minutesOverdue = Math.floor(timeDiff / (1000 * 60));
                    const hoursOverdue = Math.floor(minutesOverdue / 60);
                    const daysOverdue = Math.floor(hoursOverdue / 24);
                    
                    let overdueText = '';
                    if (daysOverdue > 0) {
                      overdueText = `${daysOverdue} giorni fa`;
                    } else if (hoursOverdue > 0) {
                      overdueText = `${hoursOverdue} ore fa`;
                    } else {
                      overdueText = `${minutesOverdue} minuti fa`;
                    }
                    
                    return (
                      <div 
                        key={lead.id} 
                        className="border-2 p-4 bg-red-50 border-red-300"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <p className="font-bold text-black text-lg">{lead.fullName}</p>
                              <span className={`text-xs px-2 py-1 rounded ${lead.status.startsWith('Deposit') ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                {lead.status}
                              </span>
                            </div>
                            <div className="space-y-1 text-sm">
                              <p className="text-gray-700">
                                <strong>Telefono:</strong> <a href={`tel:+39${lead.phone}`} className="text-[#D4AF37] hover:underline">+39 {lead.phone}</a>
                              </p>
                              <p className="text-gray-700">
                                <strong>Importo:</strong> {lead.amountLost}
                              </p>
                              <p className="font-semibold text-red-600">
                                <Clock className="w-4 h-4 inline mr-1" />
                                {callbackTime.toLocaleString('it-IT', { 
                                  day: '2-digit',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                                {' '}<span className="text-red-700 font-bold">(SCADUTO {overdueText})</span>
                              </p>
                              {lead.callback_notes && (
                                <p className="text-gray-600 text-xs italic">
                                  "{lead.callback_notes}"
                                </p>
                              )}
                            </div>
                          </div>
                          <Button
                            onClick={() => {
                              setShowModal(false);
                              if (onCallbackAlert) {
                                onCallbackAlert(lead);
                              }
                            }}
                            size="sm"
                            className="bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none font-semibold whitespace-nowrap"
                          >
                            <Phone className="w-4 h-4 mr-1" />
                            Apri Lead
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Reminders Section */}
            {reminders.length > 0 && (
              <div>
                <h3 className="text-lg font-bold text-black mb-3">
                  Promemoria ({reminders.length})
                </h3>
                <div className="space-y-3">
                  {reminders.map((reminder) => (
                    <div key={reminder.id} className="border-2 border-gray-200 bg-white p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-semibold text-black mb-2">
                            Lead ID: {reminder.lead_id}
                          </p>
                          <p className="text-sm text-gray-700 mb-2">
                            <strong>Data Callback:</strong> {new Date(reminder.callback_date).toLocaleString('it-IT')}
                          </p>
                          <p className="text-sm text-gray-700">
                            <strong>Note:</strong> {reminder.notes || 'Nessuna nota'}
                          </p>
                        </div>
                        <Button
                          onClick={() => handleCompleteReminder(reminder.id)}
                          size="sm"
                          className="bg-green-600 text-white hover:bg-green-700 rounded-none ml-4"
                        >
                          Completa
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty State */}
            {pendingCallbacks.length === 0 && reminders.length === 0 && (
              <div className="text-center py-12">
                <Bell className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 text-lg">Nessuna notifica</p>
                <p className="text-gray-400 text-sm">Tutte le notifiche compariranno qui</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CallbackNotifications;
