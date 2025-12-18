import React, { useState, useEffect } from 'react';
import { Input } from '../ui/input';
import { Clock, AlertCircle } from 'lucide-react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const SmartDateTimePicker = ({ value, onChange, currentUser, currentLeadId }) => {
  const { t } = useTranslation();
  const [bookedSlots, setBookedSlots] = useState([]);
  const [conflicts, setConflicts] = useState([]);

  useEffect(() => {
    fetchUserCallbacks();
  }, [currentUser]);

  useEffect(() => {
    if (value) {
      checkConflicts(value);
    }
  }, [value, bookedSlots]);

  const fetchUserCallbacks = async () => {
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      // Fetch all leads assigned to current user with callback dates
      const response = await axios.get(`${API}/crm/leads`, { headers });
      const userLeads = response.data.filter(lead => 
        lead.assigned_to === currentUser.id && 
        lead.callback_date &&
        lead.id !== currentLeadId // Exclude current lead being edited
      );

      const slots = userLeads.map(lead => ({
        leadId: lead.id,
        leadName: lead.fullName,
        callbackTime: new Date(lead.callback_date)
      }));

      setBookedSlots(slots);
    } catch (error) {
      console.error('Error fetching user callbacks:', error);
    }
  };

  const checkConflicts = (selectedDateTime) => {
    if (!selectedDateTime) {
      setConflicts([]);
      return;
    }

    const selected = new Date(selectedDateTime);
    const conflictingSlots = [];

    bookedSlots.forEach(slot => {
      const slotStart = new Date(slot.callbackTime);
      const slotEnd = new Date(slotStart.getTime() + 15 * 60000); // +15 minutes buffer

      // Check if selected time falls within this slot's range
      if (selected >= slotStart && selected < slotEnd) {
        conflictingSlots.push({
          leadName: slot.leadName,
          time: slotStart.toLocaleString('it-IT', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })
        });
      }
    });

    setConflicts(conflictingSlots);
  };

  const formatDateTime = (dateTime) => {
    if (!dateTime) return '';
    const date = new Date(dateTime);
    return date.toISOString().slice(0, 16);
  };

  const getMinDateTime = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 5); // Minimum 5 minutes from now
    return now.toISOString().slice(0, 16);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4 text-gray-600" />
        <label className="block text-sm font-semibold text-black">{t('crm.callbackDateTime')}</label>
      </div>
      
      <Input
        type="datetime-local"
        value={formatDateTime(value)}
        onChange={(e) => onChange(e.target.value)}
        min={getMinDateTime()}
        className={`bg-white border-gray-300 rounded-none ${
          conflicts.length > 0 ? 'border-red-500 border-2' : ''
        }`}
        required
      />

      {conflicts.length > 0 && (
        <div className="bg-red-50 border-2 border-red-500 p-3 rounded space-y-2">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-800">
                ⚠️ {t('crm.scheduleConflict')}
              </p>
              <p className="text-xs text-red-700 mt-1">
                {t('crm.appointmentConflictMessage')}
              </p>
              {conflicts.map((conflict, index) => (
                <div key={index} className="mt-2 bg-red-100 p-2 rounded">
                  <p className="text-xs font-semibold text-red-900">
                    {t('crm.client')}: {conflict.leadName}
                  </p>
                  <p className="text-xs text-red-800">
                    {t('crm.time')}: {conflict.time}
                  </p>
                </div>
              ))}
              <p className="text-xs text-red-700 mt-2 font-semibold">
                {t('crm.chooseAnotherTime')}
              </p>
            </div>
          </div>
        </div>
      )}

      {bookedSlots.length > 0 && conflicts.length === 0 && (
        <div className="bg-blue-50 border border-blue-200 p-2 rounded">
          <p className="text-xs text-blue-800">
            <strong>Info:</strong> Hai {bookedSlots.length} callback già programmati oggi. 
            Il sistema ti avviserà di conflitti automaticamente.
          </p>
        </div>
      )}
    </div>
  );
};

export default SmartDateTimePicker;
