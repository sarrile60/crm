import React, { useState, useEffect } from 'react';
import { Bell, Phone, Clock } from 'lucide-react';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { toast } from 'sonner';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const CallbackNotifications = ({ onCallbackAlert }) => {
  const [reminders, setReminders] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [urgentCallback, setUrgentCallback] = useState(null);
  const [showUrgentModal, setShowUrgentModal] = useState(false);
  const [leads, setLeads] = useState([]);

  useEffect(() => {
    fetchReminders();
    // Check for reminders every 30 seconds
    const interval = setInterval(checkUpcomingCallbacks, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchReminders = async () => {
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      const res = await axios.get(`${API}/crm/reminders`, { headers });
      setReminders(res.data);
    } catch (error) {
      console.error('Error fetching reminders:', error);
    }
  };

  const checkUpcomingCallbacks = async () => {
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      const leadsRes = await axios.get(`${API}/crm/leads`, { headers });
      const allLeads = leadsRes.data;
      
      const now = new Date();
      
      // Check for callbacks within the next 1 minute
      for (const lead of allLeads) {
        if (lead.status === 'Callback' && lead.callback_date) {
          const callbackTime = new Date(lead.callback_date);
          const timeDiff = callbackTime - now;
          
          // Alert if callback is within 30 seconds to 90 seconds from now
          if (timeDiff > 30000 && timeDiff <= 90000) {
            // Check if we already alerted for this callback
            const alerted = localStorage.getItem(`callback_alerted_${lead.id}`);
            if (!alerted) {
              setUrgentCallback(lead);
              setShowUrgentModal(true);
              localStorage.setItem(`callback_alerted_${lead.id}`, 'true');
              
              // Play alert sound (optional)
              playAlertSound();
            }
          }
        }
      }
      
      fetchReminders();
    } catch (error) {
      console.error('Error checking callbacks:', error);
    }
  };

  const playAlertSound = () => {
    // Create a simple beep sound
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
  };

  const handleCallbackNow = (lead) => {
    // Call the parent callback to switch to leads tab and open the lead
    if (onCallbackAlert) {
      onCallbackAlert(lead);
    }
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
        {reminders.length > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center animate-pulse">
            {reminders.length}
          </span>
        )}
      </button>

      {/* Urgent Callback Alert Modal */}
      <Dialog open={showUrgentModal} onOpenChange={setShowUrgentModal}>
        <DialogContent className="max-w-lg bg-red-50 border-4 border-red-600">
          <DialogHeader>
            <DialogTitle className="text-3xl font-bold text-red-600 flex items-center gap-3">
              <Phone className="w-8 h-8 animate-bounce" />
              CALLBACK URGENTE!
            </DialogTitle>
          </DialogHeader>
          {urgentCallback && (
            <div className="space-y-4">
              <div className="bg-white border-2 border-red-600 p-6">
                <div className="flex items-center gap-2 text-red-600 font-bold mb-4">
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
                    <label className="text-sm font-semibold text-gray-600">Ora Callback:</label>
                    <p className="text-black font-semibold">
                      {new Date(urgentCallback.callback_date).toLocaleTimeString('it-IT', { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex gap-3">
                <Button
                  onClick={() => handleCallbackNow(urgentCallback)}
                  className="flex-1 bg-red-600 text-white hover:bg-red-700 rounded-none text-lg py-6 font-bold"
                >
                  <Phone className="w-5 h-5 mr-2" />
                  CHIAMA ORA
                </Button>
                <Button
                  onClick={() => setShowUrgentModal(false)}
                  className="bg-gray-300 text-black hover:bg-gray-400 rounded-none px-6"
                >
                  Più Tardi
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Regular Reminders Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-2xl bg-white">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-black">Callback in Attesa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[500px] overflow-y-auto">
            {reminders.length === 0 ? (
              <p className="text-center text-gray-600 py-8">Nessun callback in attesa</p>
            ) : (
              reminders.map((reminder) => (
                <div key={reminder.id} className="border-2 border-gray-200 p-4">
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
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CallbackNotifications;