import React, { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { toast } from 'sonner';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const CallbackNotifications = () => {
  const [reminders, setReminders] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchReminders();
    // Check for reminders every minute
    const interval = setInterval(fetchReminders, 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchReminders = async () => {
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      const res = await axios.get(`${API}/crm/reminders`, { headers });
      setReminders(res.data);
      
      // Show notification if there are pending reminders
      if (res.data.length > 0 && !showModal) {
        toast.info(`Hai ${res.data.length} callback in attesa!`, {
          duration: 5000
        });
      }
    } catch (error) {
      console.error('Error fetching reminders:', error);
    }
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
          <span className="absolute -top-1 -right-1 bg-red-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
            {reminders.length}
          </span>
        )}
      </button>

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