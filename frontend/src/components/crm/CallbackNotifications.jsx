import React, { useState, useEffect, useRef } from 'react';
import { Bell, Phone, Clock, UserCheck, UserX, LogIn, X, Trash2, DollarSign } from 'lucide-react';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { toast } from 'sonner';
import axios from 'axios';
import { useTranslation } from 'react-i18next';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// 24 hours in milliseconds for auto-expiry
const NOTIFICATION_EXPIRY_MS = 24 * 60 * 60 * 1000;

const CallbackNotifications = ({ onCallbackAlert, currentUser }) => {
  const { t, i18n } = useTranslation();
  const [reminders, setReminders] = useState([]);
  const [pendingCallbacks, setPendingCallbacks] = useState([]);
  const [loginRequests, setLoginRequests] = useState([]);
  const [depositNotifications, setDepositNotifications] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [urgentCallback, setUrgentCallback] = useState(null);
  const [showUrgentModal, setShowUrgentModal] = useState(false);
  const [snoozeData, setSnoozeData] = useState({});
  const [totalNotifications, setTotalNotifications] = useState(0);
  const [urgentCallbackQueue, setUrgentCallbackQueue] = useState([]);
  const [dismissedCallbacks, setDismissedCallbacks] = useState({});
  const [supervisorDepositNotifications, setSupervisorDepositNotifications] = useState([]);
  
  // Helper to get proper locale for date formatting
  const getLocale = () => {
    const lang = i18n.language;
    return lang === 'en' ? 'en-GB' : 
           lang === 'it' ? 'it-IT' :
           lang === 'de' ? 'de-DE' :
           lang === 'fr' ? 'fr-FR' :
           lang === 'es' ? 'es-ES' : 'en-GB';
  };

  // Load dismissed callbacks from localStorage on mount
  useEffect(() => {
    const dismissed = JSON.parse(localStorage.getItem('dismissed_callbacks') || '{}');
    // Clean up expired dismissals (older than 24 hours)
    const now = Date.now();
    const cleaned = {};
    Object.keys(dismissed).forEach(key => {
      if (now - dismissed[key].dismissed_at < NOTIFICATION_EXPIRY_MS) {
        cleaned[key] = dismissed[key];
      }
    });
    if (Object.keys(cleaned).length !== Object.keys(dismissed).length) {
      localStorage.setItem('dismissed_callbacks', JSON.stringify(cleaned));
    }
    setDismissedCallbacks(cleaned);
  }, []);

  // Process queue - show next callback popup when current one is closed
  // Track which callbacks have been shown to prevent duplicates
  const shownCallbacksRef = useRef(new Set());
  
  useEffect(() => {
    if (urgentCallbackQueue.length > 0 && !showUrgentModal) {
      // Find the first callback that hasn't been shown recently
      let nextIndex = 0;
      while (nextIndex < urgentCallbackQueue.length) {
        const callback = urgentCallbackQueue[nextIndex];
        const shownKey = `${callback.id}_${callback.callback_date}`;
        
        if (!shownCallbacksRef.current.has(shownKey)) {
          // Show this callback
          shownCallbacksRef.current.add(shownKey);
          setUrgentCallback(callback);
          setShowUrgentModal(true);
          setUrgentCallbackQueue(prev => prev.filter((_, i) => i !== nextIndex));
          
          // Clear the shown key after 30 seconds to allow re-showing if needed
          setTimeout(() => {
            shownCallbacksRef.current.delete(shownKey);
          }, 30000);
          
          break;
        }
        nextIndex++;
      }
      
      // If all callbacks in queue were already shown, clear the queue
      if (nextIndex >= urgentCallbackQueue.length && urgentCallbackQueue.length > 0) {
        setUrgentCallbackQueue([]);
      }
    }
  }, [urgentCallbackQueue, showUrgentModal]);

  useEffect(() => {
    fetchReminders();
    fetchPendingCallbacks();
    checkUpcomingCallbacks();
    
    // Check for reminders and callbacks every 30 seconds
    const interval = setInterval(() => {
      checkUpcomingCallbacks();
      fetchPendingCallbacks();
    }, 30000);
    
    // Check for snoozed callbacks every 30 seconds (reduced from 10s for performance)
    const snoozeInterval = setInterval(checkSnoozedCallbacks, 30000);
    
    return () => {
      clearInterval(interval);
      clearInterval(snoozeInterval);
    };
  }, []);
  
  // Separate useEffect for admin login requests (polls every 10 seconds)
  useEffect(() => {
    if (currentUser?.role !== 'admin') return;
    
    // Immediately fetch login requests
    const fetchAdminLoginRequests = async () => {
      try {
        const token = localStorage.getItem('crmToken');
        if (!token) return;
        
        const headers = { Authorization: `Bearer ${token}` };
        const res = await axios.get(`${API}/admin/login-requests`, { headers });
        const requests = res.data.requests || [];
        
        console.log('Admin: Fetched login requests:', requests.length);
        
        setLoginRequests(prev => {
          // Check if there are new requests
          if (requests.length > prev.length && prev.length > 0) {
            // Play alert sound
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
            } catch (e) {
              // Audio context not available, ignore
            }
            
            toast.info(t('admin.newLoginRequest'), {
              description: t('admin.userNeedsApproval'),
              duration: 5000
            });
          }
          return requests;
        });
      } catch (error) {
        if (error.response?.status !== 403) {
          console.error('Error fetching login requests:', error);
        }
      }
    };
    
    fetchAdminLoginRequests();
    fetchDepositNotifications();
    const loginRequestInterval = setInterval(fetchAdminLoginRequests, 30000); // Every 30s instead of 10s
    const depositInterval = setInterval(fetchDepositNotifications, 20000); // Every 20s instead of 10s
    
    return () => {
      clearInterval(loginRequestInterval);
      clearInterval(depositInterval);
    };
  }, [currentUser?.role, t]);

  // Separate useEffect for supervisor deposit notifications (when agent marks lead as Deposit)
  useEffect(() => {
    if (currentUser?.role?.toLowerCase() !== 'supervisor') return;
    
    fetchSupervisorDepositNotifications();
    const supervisorDepositInterval = setInterval(fetchSupervisorDepositNotifications, 20000); // Every 20s instead of 10s
    
    return () => {
      clearInterval(supervisorDepositInterval);
    };
  }, [currentUser?.role]);

  // Clean up old "called" markers - if callback_date changed, the marker should be cleared
  const cleanupCalledCallbacks = (leads) => {
    const calledCallbacks = JSON.parse(localStorage.getItem('called_callbacks') || '{}');
    let hasChanges = false;
    
    Object.keys(calledCallbacks).forEach(leadId => {
      const calledData = calledCallbacks[leadId];
      const lead = leads.find(l => l.id === leadId);
      
      // If lead no longer exists or callback_date has changed, remove the "called" marker
      if (!lead || lead.callback_date !== calledData.callback_date) {
        delete calledCallbacks[leadId];
        hasChanges = true;
      }
      
      // Also remove markers older than 24 hours
      const calledAt = new Date(calledData.called_at);
      if (Date.now() - calledAt.getTime() > 24 * 60 * 60 * 1000) {
        delete calledCallbacks[leadId];
        hasChanges = true;
      }
    });
    
    if (hasChanges) {
      localStorage.setItem('called_callbacks', JSON.stringify(calledCallbacks));
    }
  };

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
      // Handle both old array format and new paginated format
      const allLeads = Array.isArray(leadsRes.data) ? leadsRes.data : (leadsRes.data.data || []);
      
      // Clean up old "called" markers
      cleanupCalledCallbacks(allLeads);
      
      // Statuses that require callback notifications
      const callbackStatuses = ['Callback', 'Potential Callback', 'Pharos in progress'];
      const depositStatuses = ['Deposit 1', 'Deposit 2', 'Deposit 3', 'Deposit 4', 'Deposit 5'];
      const allNotifyStatuses = [...callbackStatuses, ...depositStatuses];
      
      // Get callbacks that have been marked as "called"
      const calledCallbacks = JSON.parse(localStorage.getItem('called_callbacks') || '{}');
      
      // Get dismissed callbacks
      const dismissed = JSON.parse(localStorage.getItem('dismissed_callbacks') || '{}');
      
      // Filter leads - ONLY show OVERDUE callbacks (scaduto)
      const now = new Date();
      const pending = allLeads.filter(lead => {
        // Only show if status requires callback AND has callback date
        if (!allNotifyStatuses.includes(lead.status) || !lead.callback_date) {
          return false;
        }
        
        // ONLY show notifications for leads assigned to current user
        if (lead.assigned_to !== currentUser.id) {
          return false;
        }
        
        // Skip if this callback has been marked as "called" (agent pressed Chiama)
        const calledData = calledCallbacks[lead.id];
        if (calledData && calledData.callback_date === lead.callback_date) {
          return false;
        }
        
        // Skip if this callback has been dismissed by the user
        const dismissKey = `${lead.id}_${lead.callback_date}`;
        if (dismissed[dismissKey]) {
          return false;
        }
        
        const callbackTime = new Date(lead.callback_date);
        
        // Auto-expire: Skip callbacks older than 24 hours
        const timeSinceCallback = now - callbackTime;
        if (timeSinceCallback > NOTIFICATION_EXPIRY_MS) {
          return false;
        }
        
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

  const updateTotalNotifications = (remindersCount, callbacksCount, loginRequestsCount = 0, depositCount = 0, supervisorDepositCount = 0) => {
    setTotalNotifications(remindersCount + callbacksCount + loginRequestsCount + depositCount + supervisorDepositCount);
  };
  
  // Update total notifications whenever any notification type changes
  useEffect(() => {
    const total = reminders.length + pendingCallbacks.length + loginRequests.length + depositNotifications.length + supervisorDepositNotifications.length;
    setTotalNotifications(total);
  }, [reminders.length, pendingCallbacks.length, loginRequests.length, depositNotifications.length, supervisorDepositNotifications.length]);

  // Fetch deposit notifications for admin
  const fetchDepositNotifications = async () => {
    if (currentUser?.role?.toLowerCase() !== 'admin') return;
    
    try {
      const token = localStorage.getItem('crmToken');
      if (!token) return;
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.get(`${API}/crm/deposits/notifications`, { headers });
      
      const notifications = res.data.notifications || [];
      
      // Check for new notifications and play sound
      if (notifications.length > depositNotifications.length && depositNotifications.length > 0) {
        // New deposit notification - play sound and show toast
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleQUINYDOxqdnEg4wfs+/mVsVEy191cSaYR8PNXbQwJhgHxU3ctHAmWMhFTlwz7+YYiEVPW3Ov5ZdHRM/a86+lFoaET1r0L+XXB0TQGnQvpVaGhFBaNC9k1kYD0NnzryRVhYNRWfNu49UFA1HZ8y6jFESDkhn');
        audio.volume = 0.3;
        audio.play().catch(() => {});
        
        toast.info('💰 ' + t('deposits.newDepositNotification'), {
          description: t('deposits.newDepositDesc'),
          duration: 8000
        });
      }
      
      setDepositNotifications(notifications);
    } catch (error) {
      console.error('Error fetching deposit notifications:', error);
    }
  };

  // Fetch supervisor deposit notifications (when agent marks lead as Deposit)
  const fetchSupervisorDepositNotifications = async () => {
    if (currentUser?.role?.toLowerCase() !== 'supervisor') return;
    
    try {
      const token = localStorage.getItem('crmToken');
      if (!token) return;
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.get(`${API}/crm/supervisor/deposit-notifications`, { headers });
      
      const notifications = res.data.notifications || [];
      
      // Check for new notifications and play sound
      if (notifications.length > supervisorDepositNotifications.length && supervisorDepositNotifications.length > 0) {
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleQUINYDOxqdnEg4wfs+/mVsVEy191cSaYR8PNXbQwJhgHxU3ctHAmWMhFTlwz7+YYiEVPW3Ov5ZdHRM/a86+lFoaET1r0L+XXB0TQGnQvpVaGhFBaNC9k1kYD0NnzryRVhYNRWfNu49UFA1HZ8y6jFESDkhn');
        audio.volume = 0.3;
        audio.play().catch(() => {});
        
        toast.info('📋 ' + t('deposits.agentMarkedDeposit'), {
          description: t('deposits.agentMarkedDepositDesc'),
          duration: 8000
        });
      }
      
      setSupervisorDepositNotifications(notifications);
    } catch (error) {
      console.error('Error fetching supervisor deposit notifications:', error);
    }
  };

  // Helper to refresh login requests after approve/deny
  const refreshLoginRequests = async () => {
    try {
      const token = localStorage.getItem('crmToken');
      if (!token) return;
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.get(`${API}/admin/login-requests`, { headers });
      setLoginRequests(res.data.requests || []);
    } catch (error) {
      console.error('Error refreshing login requests:', error);
    }
  };

  // Handle approve login request
  const handleApproveLogin = async (requestId, username) => {
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      await axios.post(`${API}/admin/login-requests/${requestId}/approve`, {}, { headers });
      toast.success(t('admin.loginApproved', { username }));
      refreshLoginRequests();
    } catch (error) {
      toast.error(t('admin.errorApprovingLogin'));
    }
  };

  // Handle deny login request
  const handleDenyLogin = async (requestId, username) => {
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      await axios.post(`${API}/admin/login-requests/${requestId}/deny`, {}, { headers });
      toast.success(t('admin.loginDenied', { username }));
      refreshLoginRequests();
    } catch (error) {
      toast.error(t('admin.errorDenyingLogin'));
    }
  };

  const checkSnoozedCallbacks = () => {
    // SKIP popup notifications for admins and supervisors - only agents get popups
    if (currentUser.role === 'admin' || currentUser.role === 'supervisor') {
      return;
    }
    
    const now = Date.now();
    const snoozeDataFromStorage = JSON.parse(localStorage.getItem('callback_snoozes') || '{}');
    
    // Get callbacks that have been marked as "called"
    const calledCallbacks = JSON.parse(localStorage.getItem('called_callbacks') || '{}');
    
    const newAlerts = [];
    
    let dataChanged = false;
    
    Object.keys(snoozeDataFromStorage).forEach(leadId => {
      const snooze = snoozeDataFromStorage[leadId];
      
      // Skip if this callback has been marked as "called" (agent pressed Chiama)
      const calledData = calledCallbacks[leadId];
      if (calledData && snooze.lead && calledData.callback_date === snooze.lead.callback_date) {
        // Clean up the snooze data for this called callback
        delete snoozeDataFromStorage[leadId];
        dataChanged = true;
        return;
      }
      
      // Skip if snoozeUntil is null (already triggered, waiting for user action)
      if (snooze.snoozeUntil === null) {
        return;
      }
      
      // Check if snooze time has passed
      if (snooze.snoozeUntil <= now) {
        // Re-trigger the callback alert
        if (snooze.lead) {
          newAlerts.push(snooze.lead);
          
          // Set snoozeUntil to null to prevent duplicate triggers
          // The snooze data will be updated when user clicks snooze again
          snoozeDataFromStorage[leadId] = {
            ...snooze,
            snoozeUntil: null,  // Mark as triggered, prevent re-trigger
            triggeredAt: now
          };
          dataChanged = true;
        }
      }
    });
    
    // Save changes once
    if (dataChanged) {
      localStorage.setItem('callback_snoozes', JSON.stringify(snoozeDataFromStorage));
    }
    
    // Add all new alerts to queue (deduplicate)
    if (newAlerts.length > 0) {
      setUrgentCallbackQueue(prev => {
        const existingIds = new Set(prev.map(l => l.id));
        const uniqueNewAlerts = newAlerts.filter(l => !existingIds.has(l.id));
        if (uniqueNewAlerts.length === 0) return prev;
        return [...prev, ...uniqueNewAlerts];
      });
      playAlertSound();
    }
  };

  const checkUpcomingCallbacks = async () => {
    try {
      const token = localStorage.getItem('crmToken');
      if (!token) return;
      const headers = { Authorization: `Bearer ${token}` };

      // FIXED: Use safe pagination limit instead of fetching all leads
      // Only fetch leads that have callback_date set (server filters by user permissions)
      // We paginate through to collect callbacks - max 200 per page
      const allLeads = [];
      let offset = 0;
      const pageSize = 200;
      let hasMore = true;
      
      while (hasMore && offset < 1000) { // Safety cap: max 1000 leads checked
        const leadsRes = await axios.get(`${API}/crm/leads`, { 
          headers,
          params: { limit: pageSize, offset }
        });
        const pageData = Array.isArray(leadsRes.data) ? leadsRes.data : (leadsRes.data.data || []);
        
        // Only keep leads with callback_date for efficiency
        const leadsWithCallbacks = pageData.filter(lead => lead.callback_date);
        allLeads.push(...leadsWithCallbacks);
        
        // Check if we need more pages
        const total = leadsRes.data.total || pageData.length;
        offset += pageSize;
        hasMore = pageData.length === pageSize && offset < total;
      }
      
      const now = new Date();
      const snoozeDataFromStorage = JSON.parse(localStorage.getItem('callback_snoozes') || '{}');
      const calledCallbacks = JSON.parse(localStorage.getItem('called_callbacks') || '{}');
      const newUrgentCallbacks = [];
      
      for (const lead of allLeads) {
        if (lead.callback_date) {
          // For agents: only show their assigned leads
          if (currentUser.role === 'agent' && lead.assigned_to !== currentUser.id) {
            continue;
          }
          
          // Skip if already called
          const calledData = calledCallbacks[lead.id];
          if (calledData && calledData.callback_date === lead.callback_date) {
            continue;
          }
          
          const callbackTime = new Date(lead.callback_date);
          const timeDiff = callbackTime - now;
          
          // Skip if snoozed
          const snooze = snoozeDataFromStorage[lead.id];
          if (snooze && snooze.snoozeUntil && snooze.snoozeUntil > Date.now()) {
            continue;
          }
          
          // Alert if within 60 seconds or overdue (up to 1 hour)
          const isUpcoming = timeDiff > -1000 && timeDiff <= 60000;
          const isOverdue = timeDiff < 0 && timeDiff > -3600000;
          
          if (isUpcoming || isOverdue) {
            const callbackTs = new Date(lead.callback_date).getTime();
            const alertKey = `callback_alerted_${lead.id}_${callbackTs}`;
            const alerted = localStorage.getItem(alertKey);
            
            if (!alerted) {
              newUrgentCallbacks.push(lead);
              localStorage.setItem(alertKey, 'true');
            }
          }
        }
      }
      
      if (newUrgentCallbacks.length > 0) {
        setUrgentCallbackQueue(prev => {
          const existingIds = new Set(prev.map(l => `${l.id}_${new Date(l.callback_date).getTime()}`));
          const uniqueNew = newUrgentCallbacks.filter(l => !existingIds.has(`${l.id}_${new Date(l.callback_date).getTime()}`));
          if (uniqueNew.length === 0) return prev;
          return [...prev, ...uniqueNew];
        });
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

  const handleCallNow = async (lead) => {
    try {
      // Clear callback from backend
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };
      await axios.post(`${API}/crm/leads/${lead.id}/clear-callback`, {}, { headers });
      
      // Clear snooze data for this lead
      const snoozeDataFromStorage = JSON.parse(localStorage.getItem('callback_snoozes') || '{}');
      delete snoozeDataFromStorage[lead.id];
      localStorage.setItem('callback_snoozes', JSON.stringify(snoozeDataFromStorage));
      
      // Mark this callback as "called" - so it won't show popup again
      const calledCallbacks = JSON.parse(localStorage.getItem('called_callbacks') || '{}');
      calledCallbacks[lead.id] = {
        callback_date: lead.callback_date,
        called_at: new Date().toISOString()
      };
      localStorage.setItem('called_callbacks', JSON.stringify(calledCallbacks));
      
      // Clear the alert key
      const alertKey = `callback_alerted_${lead.id}_${lead.callback_date}`;
      localStorage.removeItem(alertKey);
      
      // Clear the urgent callback state
      setUrgentCallback(null);
      
      // Remove this lead from the queue
      setUrgentCallbackQueue(prev => prev.filter(l => l.id !== lead.id));
      
      // Close the modal
      setShowUrgentModal(false);
      
      // Call the parent callback to switch to leads tab and open the lead
      if (onCallbackAlert) {
        onCallbackAlert(lead);
      }
    } catch (error) {
      console.error('Error clearing callback:', error);
      // Still proceed to open the lead even if backend fails
      setShowUrgentModal(false);
      if (onCallbackAlert) {
        onCallbackAlert(lead);
      }
    }
  };

  // Remove callback completely (on 3rd postpone)
  const handleRemoveCallback = async (lead) => {
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };
      await axios.post(`${API}/crm/leads/${lead.id}/clear-callback`, {}, { headers });
      
      // Clear all local data for this lead
      const snoozeDataFromStorage = JSON.parse(localStorage.getItem('callback_snoozes') || '{}');
      delete snoozeDataFromStorage[lead.id];
      localStorage.setItem('callback_snoozes', JSON.stringify(snoozeDataFromStorage));
      
      const calledCallbacks = JSON.parse(localStorage.getItem('called_callbacks') || '{}');
      delete calledCallbacks[lead.id];
      localStorage.setItem('called_callbacks', JSON.stringify(calledCallbacks));
      
      const alertKey = `callback_alerted_${lead.id}_${lead.callback_date}`;
      localStorage.removeItem(alertKey);
      
      // Clear state
      setUrgentCallback(null);
      setUrgentCallbackQueue(prev => prev.filter(l => l.id !== lead.id));
      setShowUrgentModal(false);
      
      // Refresh pending callbacks list
      fetchPendingCallbacks();
      
      toast.success(t('crm.callbackRemoved'));
    } catch (error) {
      console.error('Error removing callback:', error);
      toast.error(t('crm.errorRemovingCallback'));
    }
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
          toast.warning(t('crm.supervisorNotified', { supervisor: response.data.supervisor }));
        }
      } catch (error) {
        console.error('Error notifying supervisor:', error);
      }
      
      // Keep count at 3 so UI knows to hide the "Later" button
      // Don't close modal - user must click "Call Now"
      snoozeDataFromStorage[lead.id] = {
        count: 3,
        snoozeUntil: null,
        lead: lead,
        supervisorNotified: true
      };
      localStorage.setItem('callback_snoozes', JSON.stringify(snoozeDataFromStorage));
      
      // Force re-render to update button visibility
      setUrgentCallback({...lead});
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
    
    toast.info(t('crm.callbackSnoozed', { count: newCount }));
    setShowUrgentModal(false);
  };

  // Dismiss a single callback notification
  const handleDismissCallback = (lead) => {
    const dismissKey = `${lead.id}_${lead.callback_date}`;
    const dismissed = JSON.parse(localStorage.getItem('dismissed_callbacks') || '{}');
    
    dismissed[dismissKey] = {
      dismissed_at: Date.now(),
      lead_name: lead.fullName
    };
    
    localStorage.setItem('dismissed_callbacks', JSON.stringify(dismissed));
    setDismissedCallbacks(dismissed);
    
    // Remove from pending callbacks immediately
    setPendingCallbacks(prev => prev.filter(l => l.id !== lead.id || l.callback_date !== lead.callback_date));
    
    toast.success(t('crm.callbackDismissed'));
  };

  // Clear all callback notifications
  const handleClearAllCallbacks = () => {
    const dismissed = JSON.parse(localStorage.getItem('dismissed_callbacks') || '{}');
    
    // Add all current pending callbacks to dismissed list
    pendingCallbacks.forEach(lead => {
      const dismissKey = `${lead.id}_${lead.callback_date}`;
      dismissed[dismissKey] = {
        dismissed_at: Date.now(),
        lead_name: lead.fullName
      };
    });
    
    localStorage.setItem('dismissed_callbacks', JSON.stringify(dismissed));
    setDismissedCallbacks(dismissed);
    
    // Clear pending callbacks
    setPendingCallbacks([]);
    
    toast.success(t('crm.allCallbacksCleared'));
  };

  const handleCompleteReminder = async (reminderId) => {
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      await axios.put(`${API}/crm/reminders/${reminderId}/complete`, {}, { headers });
      toast.success(t('crm.reminderCompleted'));
      fetchReminders();
    } catch (error) {
      toast.error(t('crm.errorCompletingReminder'));
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
      <Dialog open={showUrgentModal} onOpenChange={(open) => {
        // Allow closing only if max postpones reached OR if explicitly closing
        const snoozeDataFromStorage = JSON.parse(localStorage.getItem('callback_snoozes') || '{}');
        const currentSnooze = urgentCallback ? snoozeDataFromStorage[urgentCallback.id] : { count: 0 };
        const maxPostponesReached = (currentSnooze?.count || 0) >= 3;
        
        if (!open && maxPostponesReached) {
          setShowUrgentModal(false);
        }
      }}>
        <DialogContent 
          className={`max-w-lg border-4 ${urgentCallback?.status?.startsWith('Deposit') ? 'bg-blue-50 border-blue-600' : 'bg-red-50 border-red-600'}`}
          onPointerDownOutside={(e) => {
            // Allow clicking outside to close only if max postpones reached
            const snoozeDataFromStorage = JSON.parse(localStorage.getItem('callback_snoozes') || '{}');
            const currentSnooze = urgentCallback ? snoozeDataFromStorage[urgentCallback.id] : { count: 0 };
            const maxPostponesReached = (currentSnooze?.count || 0) >= 3;
            if (!maxPostponesReached) {
              e.preventDefault();
            }
          }}
          onEscapeKeyDown={(e) => {
            // Allow escape to close only if max postpones reached
            const snoozeDataFromStorage = JSON.parse(localStorage.getItem('callback_snoozes') || '{}');
            const currentSnooze = urgentCallback ? snoozeDataFromStorage[urgentCallback.id] : { count: 0 };
            const maxPostponesReached = (currentSnooze?.count || 0) >= 3;
            if (!maxPostponesReached) {
              e.preventDefault();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle className={`text-3xl font-bold flex items-center gap-3 ${urgentCallback?.status?.startsWith('Deposit') ? 'text-blue-600' : 'text-red-600'}`}>
              <Phone className="w-8 h-8 animate-bounce" />
              {urgentCallback?.status?.startsWith('Deposit') ? t('crm.urgentDeposit') : t('crm.urgentCallback')}
            </DialogTitle>
          </DialogHeader>
          {urgentCallback && (
            <div className="space-y-4">
              <div className={`bg-white border-2 p-6 ${urgentCallback?.status?.startsWith('Deposit') ? 'border-blue-600' : 'border-red-600'}`}>
                <div className={`flex items-center gap-2 font-bold mb-4 ${urgentCallback?.status?.startsWith('Deposit') ? 'text-blue-600' : 'text-red-600'}`}>
                  <Clock className="w-6 h-6" />
                  <span className="text-xl">{t('crm.lessThanOneMinute')}</span>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-semibold text-gray-600">{t('crm.client')}:</label>
                    <p className="text-xl font-bold text-black">{urgentCallback.fullName}</p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-600">{t('common.phone')}:</label>
                    {/* Respect phone visibility settings - NEVER show raw phone number */}
                    {urgentCallback.phone_display ? (
                      <p className="text-2xl font-bold text-[#D4AF37]">{urgentCallback.phone_display}</p>
                    ) : (
                      <p className="text-lg text-gray-400 italic">{t('visibility.hidden')}</p>
                    )}
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-600">{t('crm.amountLost')}:</label>
                    <p className="text-lg font-semibold text-black">{urgentCallback.amountLost}</p>
                  </div>
                  {urgentCallback.callback_notes && (
                    <div>
                      <label className="text-sm font-semibold text-gray-600">{t('crm.notes')}:</label>
                      <p className="text-black">{urgentCallback.callback_notes}</p>
                    </div>
                  )}
                  <div>
                    <label className="text-sm font-semibold text-gray-600">{t('common.status')}:</label>
                    <p className="text-lg font-bold text-[#D4AF37]">{urgentCallback.status}</p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-600">
                      {urgentCallback?.status?.startsWith('Deposit') ? t('crm.depositTime') : t('crm.callbackTime')}:
                    </label>
                    <p className="text-black font-semibold">
                      {new Date(urgentCallback.callback_date).toLocaleTimeString(getLocale(), { 
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
                const maxPostponesReached = snoozeCount >= 3;
                
                return (
                  <>
                    {snoozeCount > 0 && (
                      <div className={`border-2 p-3 text-center ${maxPostponesReached ? 'bg-red-100 border-red-500' : 'bg-yellow-100 border-yellow-500'}`}>
                        <p className={`text-sm font-bold ${maxPostponesReached ? 'text-red-800' : 'text-yellow-800'}`}>
                          {maxPostponesReached ? (
                            <>🚫 {t('crm.cannotPostponeAnymore')} - {t('crm.supervisorWasNotified')}</>
                          ) : (
                            <>⚠️ {t('crm.postponedTimes', { count: snoozeCount })}
                            {snoozeCount === 2 ? ` - ${t('crm.nextPostponeWillNotify')}` : ''}</>
                          )}
                        </p>
                      </div>
                    )}
                    
                    <div className="flex gap-3">
                      <Button
                        onClick={() => handleCallNow(urgentCallback)}
                        className={`flex-1 text-white rounded-none text-lg py-6 font-bold ${urgentCallback?.status?.startsWith('Deposit') ? 'bg-green-600 hover:bg-green-700' : 'bg-green-600 hover:bg-green-700'}`}
                      >
                        <Phone className="w-5 h-5 mr-2" />
                        {t('crm.callNow')}
                      </Button>
                      {!maxPostponesReached ? (
                        <Button
                          onClick={() => handleSnooze(urgentCallback)}
                          className="flex-1 bg-orange-500 text-white hover:bg-orange-600 rounded-none text-lg py-6 font-bold"
                        >
                          <Clock className="w-5 h-5 mr-2" />
                          {t('crm.later')}
                        </Button>
                      ) : (
                        <Button
                          onClick={() => handleRemoveCallback(urgentCallback)}
                          className="flex-1 bg-red-600 text-white hover:bg-red-700 rounded-none text-lg py-6 font-bold"
                        >
                          <Trash2 className="w-5 h-5 mr-2" />
                          {t('crm.removeCallback')}
                        </Button>
                      )}
                    </div>
                  </>
                );
              })()}
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
              {t('crm.notifications')} ({totalNotifications})
            </DialogTitle>
            <p className="text-sm text-gray-500 mt-2">
              💡 {t('crm.notificationsAutoExpire')}
            </p>
          </DialogHeader>
          <div className="space-y-6 max-h-[600px] overflow-y-auto">
            {/* Overdue Callbacks Section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold text-black flex items-center gap-2">
                  <Phone className="w-5 h-5 text-red-600" />
                  {t('crm.expiredCallbacks')} ({pendingCallbacks.length})
                </h3>
                {pendingCallbacks.length > 0 && (
                  <Button
                    onClick={handleClearAllCallbacks}
                    variant="outline"
                    size="sm"
                    className="text-red-600 border-red-300 hover:bg-red-50 rounded-none"
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    {t('crm.clearAll')}
                  </Button>
                )}
              </div>
              {pendingCallbacks.length === 0 ? (
                <p className="text-center text-gray-500 py-4 bg-gray-50 border border-gray-200">
                  {t('crm.noExpiredCallbacks')}
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
                      overdueText = t('crm.daysAgo', { count: daysOverdue });
                    } else if (hoursOverdue > 0) {
                      overdueText = t('crm.hoursAgo', { count: hoursOverdue });
                    } else {
                      overdueText = t('crm.minutesAgo', { count: minutesOverdue });
                    }
                    
                    return (
                      <div 
                        key={lead.id} 
                        className="border-2 p-4 bg-red-50 border-red-300 relative"
                      >
                        {/* Dismiss button */}
                        <button
                          onClick={() => handleDismissCallback(lead)}
                          className="absolute top-2 right-2 p-1 text-gray-400 hover:text-red-600 hover:bg-red-100 rounded transition-colors"
                          title={t('crm.dismissNotification')}
                        >
                          <X className="w-4 h-4" />
                        </button>
                        
                        <div className="flex items-start justify-between gap-4 pr-6">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <p className="font-bold text-black text-lg">{lead.fullName}</p>
                              <span className={`text-xs px-2 py-1 rounded ${lead.status.startsWith('Deposit') ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                {lead.status}
                              </span>
                            </div>
                            <div className="space-y-1 text-sm">
                              <p className="text-gray-700">
                                <strong>{t('common.phone')}:</strong>{' '}
                                {lead.phone_display ? (
                                  <span className="text-[#D4AF37]">{lead.phone_display}</span>
                                ) : (
                                  <span className="text-gray-400 italic">{t('visibility.hidden')}</span>
                                )}
                              </p>
                              <p className="text-gray-700">
                                <strong>{t('crm.amountLost')}:</strong> {lead.amountLost}
                              </p>
                              <p className="font-semibold text-red-600">
                                <Clock className="w-4 h-4 inline mr-1" />
                                {callbackTime.toLocaleString(getLocale(), { 
                                  day: '2-digit',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                                {' '}<span className="text-red-700 font-bold">({t('crm.expired')} {overdueText})</span>
                              </p>
                              {lead.callback_notes && (
                                <p className="text-gray-600 text-xs italic">
                                  &quot;{lead.callback_notes}&quot;
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
                            {t('crm.openLead')}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Login Approval Requests Section (Admin Only) */}
            {currentUser?.role === 'admin' && (
              <div>
                <h3 className="text-lg font-bold text-black mb-3 flex items-center gap-2">
                  <LogIn className="w-5 h-5 text-orange-600" />
                  {t('admin.loginRequests')} ({loginRequests.length})
                </h3>
                {loginRequests.length === 0 ? (
                  <p className="text-center text-gray-500 py-4 bg-gray-50 border border-gray-200">
                    {t('admin.noLoginRequests')}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {loginRequests.map((request) => {
                      const requestTime = new Date(request.requested_at);
                      const now = new Date();
                      const minutesAgo = Math.floor((now - requestTime) / (1000 * 60));
                      
                      return (
                        <div 
                          key={request.id} 
                          className="border-2 p-4 bg-orange-50 border-orange-300"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <p className="font-bold text-black text-lg">{request.full_name || request.username}</p>
                                <span className="text-xs px-2 py-1 rounded bg-orange-100 text-orange-700">
                                  {t(`users.roles.${request.role}`) || request.role}
                                </span>
                              </div>
                              <div className="space-y-1 text-sm">
                                <p className="text-gray-700">
                                  <strong>{t('auth.username')}:</strong> {request.username}
                                </p>
                                <p className="text-gray-700">
                                  <strong>{t('admin.reason')}:</strong> {t('session.afterWorkHours', { time: request.reason?.split(':').slice(1).join(':') || '' })}
                                </p>
                                <p className="font-semibold text-orange-600">
                                  <Clock className="w-4 h-4 inline mr-1" />
                                  {requestTime.toLocaleString(getLocale(), { 
                                    day: '2-digit',
                                    month: 'short',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                  {' '}<span className="text-orange-700">({minutesAgo} {t('common.minutesAgo')})</span>
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-col gap-2">
                              <Button
                                onClick={() => handleApproveLogin(request.id, request.username)}
                                size="sm"
                                className="bg-green-600 text-white hover:bg-green-700 rounded-none font-semibold"
                              >
                                <UserCheck className="w-4 h-4 mr-1" />
                                {t('admin.approve')}
                              </Button>
                              <Button
                                onClick={() => handleDenyLogin(request.id, request.username)}
                                size="sm"
                                variant="outline"
                                className="border-red-600 text-red-600 hover:bg-red-50 rounded-none font-semibold"
                              >
                                <UserX className="w-4 h-4 mr-1" />
                                {t('admin.deny')}
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Reminders Section */}
            {reminders.length > 0 && (
              <div>
                <h3 className="text-lg font-bold text-black mb-3">
                  {t('crm.reminders')} ({reminders.length})
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
                            <strong>{t('crm.callbackDate')}:</strong> {new Date(reminder.callback_date).toLocaleString()}
                          </p>
                          <p className="text-sm text-gray-700">
                            <strong>{t('crm.notes')}:</strong> {reminder.notes || t('crm.noNotes')}
                          </p>
                        </div>
                        <Button
                          onClick={() => handleCompleteReminder(reminder.id)}
                          size="sm"
                          className="bg-green-600 text-white hover:bg-green-700 rounded-none ml-4"
                        >
                          {t('common.complete')}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Deposit Notifications Section (Admin Only) */}
            {currentUser?.role?.toLowerCase() === 'admin' && depositNotifications.length > 0 && (
              <div className="mb-6">
                <h3 className="text-lg font-bold text-black mb-3 flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-green-600" />
                  {t('deposits.pendingApproval')} ({depositNotifications.length})
                </h3>
                <div className="space-y-3">
                  {depositNotifications.map((notification) => (
                    <div 
                      key={notification.id}
                      className="border-2 p-4 bg-green-50 border-green-300"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-lg">{notification.lead_name}</span>
                            <span className="px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded">
                              {notification.payment_type}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600">
                            {t('deposits.agent')}: {notification.agent_name}
                          </p>
                          <p className="text-2xl font-bold text-green-600 mt-1">
                            {notification.amount?.toLocaleString()} EUR
                          </p>
                        </div>
                        <Button
                          onClick={() => {
                            setShowModal(false);
                            window.location.hash = '#depositApprovals';
                            // Trigger tab change
                            const event = new CustomEvent('changeTab', { detail: 'depositApprovals' });
                            window.dispatchEvent(event);
                          }}
                          size="sm"
                          className="bg-green-600 text-white hover:bg-green-700 rounded-none"
                        >
                          {t('common.review')}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Supervisor Deposit Notifications Section (when agent marks lead as Deposit) */}
            {currentUser?.role?.toLowerCase() === 'supervisor' && supervisorDepositNotifications.length > 0 && (
              <div className="mb-6">
                <h3 className="text-lg font-bold text-black mb-3 flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-blue-600" />
                  {t('deposits.agentDepositRequests')} ({supervisorDepositNotifications.length})
                </h3>
                <div className="space-y-3">
                  {supervisorDepositNotifications.map((notification) => (
                    <div 
                      key={notification.id}
                      className="border-2 p-4 bg-blue-50 border-blue-300"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-lg">{notification.lead_name}</span>
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded">
                              {notification.deposit_status}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600">
                            {t('deposits.agent')}: {notification.agent_name}
                          </p>
                          <p className="text-sm text-gray-600">
                            {t('common.phone')}: {notification.lead_phone}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {new Date(notification.created_at).toLocaleString()}
                          </p>
                        </div>
                        <Button
                          onClick={() => {
                            setShowModal(false);
                            // Navigate to deposits tab and open create modal with pre-filled data
                            const event = new CustomEvent('openDepositCreate', { 
                              detail: { 
                                lead_id: notification.lead_id,
                                lead_name: notification.lead_name,
                                agent_id: notification.agent_id,
                                agent_name: notification.agent_name,
                                notification_id: notification.id
                              } 
                            });
                            window.dispatchEvent(event);
                          }}
                          size="sm"
                          className="bg-blue-600 text-white hover:bg-blue-700 rounded-none"
                        >
                          <DollarSign className="w-4 h-4 mr-1" />
                          {t('deposits.createDeposit')}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty State */}
            {pendingCallbacks.length === 0 && reminders.length === 0 && loginRequests.length === 0 && depositNotifications.length === 0 && supervisorDepositNotifications.length === 0 && (
              <div className="text-center py-12">
                <Bell className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 text-lg">{t('crm.noNotifications')}</p>
                <p className="text-gray-400 text-sm">{t('crm.notificationsWillAppear')}</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CallbackNotifications;
