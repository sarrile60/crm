import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, Send, Paperclip, Smile, Users, User, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { toast } from 'sonner';
import axios from 'axios';
import EmojiPicker from 'emoji-picker-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const WS_URL = BACKEND_URL.replace('https://', 'wss://').replace('http://', 'ws://');

const ChatBubble = ({ currentUser }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [activeTab, setActiveTab] = useState('team'); // 'team' or 'direct'
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [contacts, setContacts] = useState([]);
  const [selectedContact, setSelectedContact] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [teamUnread, setTeamUnread] = useState(0);
  const [directUnread, setDirectUnread] = useState(0);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [ws, setWs] = useState(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const [allTeams, setAllTeams] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [showNotification, setShowNotification] = useState(false);
  const [notificationData, setNotificationData] = useState(null);

  useEffect(() => {
    if (isOpen) {
      connectWebSocket();
      fetchContacts();
      fetchUnreadCount();
      
      // Fetch teams for admin
      if (currentUser.role === 'admin') {
        fetchAllTeams();
      }
      
      if (activeTab === 'team') {
        if (currentUser.role === 'admin' && selectedTeamId) {
          fetchTeamMessages(selectedTeamId);
        } else if (currentUser.team_id) {
          fetchTeamMessages(currentUser.team_id);
        }
      }
    }
    
    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, [isOpen, activeTab, selectedTeamId]);

  useEffect(() => {
    if (selectedContact && activeTab === 'direct') {
      fetchDirectMessages(selectedContact.id);
    }
  }, [selectedContact]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const connectWebSocket = () => {
    const token = localStorage.getItem('crmToken');
    const websocket = new WebSocket(`${WS_URL}/api/chat/ws/${token}`);
    
    websocket.onopen = () => {
      console.log('WebSocket connected');
    };
    
    websocket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'new_message') {
        // Add new message to list
        const message = data.message;
        
        // Show notification popup if chat is closed or different tab
        const isInCurrentView = (
          (activeTab === 'team' && message.type === 'team' && (message.team_id === currentUser.team_id || (currentUser.role === 'admin' && message.team_id === selectedTeamId))) ||
          (activeTab === 'direct' && message.type === 'direct' && (message.sender_id === selectedContact?.id || message.recipient_id === selectedContact?.id))
        );
        
        if (!isOpen || !isInCurrentView) {
          // Show notification popup
          setNotificationData({
            sender: message.sender_name,
            content: message.content,
            type: message.type,
            time: new Date()
          });
          setShowNotification(true);
          
          // Auto-hide after 5 seconds
          setTimeout(() => setShowNotification(false), 5000);
          
          // Play sound
          playNotificationSound();
        }
        
        // Check for @mentions
        if (message.content.includes(`@${currentUser.full_name}`) || message.content.includes(`@${currentUser.email}`)) {
          toast.info(`${message.sender_name} ti ha menzionato!`, { duration: 5000 });
          playNotificationSound();
        }
        
        // Check if message belongs to current view
        if (activeTab === 'team' && message.type === 'team' && (message.team_id === currentUser.team_id || (currentUser.role === 'admin' && message.team_id === selectedTeamId))) {
          // Avoid duplicates - check if message already exists
          setMessages(prev => {
            const exists = prev.some(m => m.id === message.id);
            if (exists) return prev;
            return [...prev, message];
          });
          if (isInCurrentView) {
            markAsRead(message.id);
          }
        } else if (activeTab === 'direct' && message.type === 'direct') {
          if ((message.sender_id === selectedContact?.id) || (message.recipient_id === selectedContact?.id)) {
            // Avoid duplicates
            setMessages(prev => {
              const exists = prev.some(m => m.id === message.id);
              if (exists) return prev;
              return [...prev, message];
            });
            if (isInCurrentView) {
              markAsRead(message.id);
            }
          }
        }
        
        // Update unread count
        fetchUnreadCount();
      } else if (data.type === 'message_sent') {
        // Server confirmation - update temp message with real ID if needed
        const message = data.message;
        setMessages(prev => {
          // Check if we already have this message (from optimistic update)
          const hasTempMessage = prev.some(m => m.id.toString().startsWith('temp_'));
          if (hasTempMessage) {
            // Replace most recent temp message with real one
            const lastTempIndex = prev.length - 1;
            if (prev[lastTempIndex]?.id.toString().startsWith('temp_')) {
              const updated = [...prev];
              updated[lastTempIndex] = message;
              return updated;
            }
          }
          
          // Check if message already exists
          const exists = prev.some(m => m.id === message.id);
          if (exists) return prev;
          
          return [...prev, message];
        });
      }
    };
    
    websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
    
    websocket.onclose = () => {
      console.log('WebSocket disconnected');
      // Attempt to reconnect after 5 seconds
      setTimeout(() => {
        if (isOpen) {
          connectWebSocket();
        }
      }, 5000);
    };
    
    setWs(websocket);
  };

  const fetchAllTeams = async () => {
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.get(`${API}/crm/teams`, { headers });
      setAllTeams(res.data);
      
      // Auto-select first team if admin has no team
      if (!currentUser.team_id && res.data.length > 0) {
        setSelectedTeamId(res.data[0].id);
      }
    } catch (error) {
      console.error('Error fetching teams:', error);
    }
  };

  const fetchContacts = async () => {
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.get(`${API}/chat/contacts`, { headers });
      setContacts(res.data);
    } catch (error) {
      console.error('Error fetching contacts:', error);
    }
  };
  
  const playNotificationSound = () => {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 600;
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch (error) {
      console.error('Error playing sound:', error);
    }
  };

  const fetchTeamMessages = async (teamId) => {
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };
      
      // Admin can view any team's messages
      const endpoint = currentUser.role === 'admin' 
        ? `${API}/chat/messages/all-team-messages?team_id=${teamId}`
        : `${API}/chat/messages/team/${teamId}`;
      
      const res = await axios.get(endpoint, { headers });
      setMessages(res.data);
      
      // Mark all as read
      res.data.forEach(msg => markAsRead(msg.id));
    } catch (error) {
      console.error('Error fetching team messages:', error);
    }
  };

  const fetchDirectMessages = async (contactId) => {
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.get(`${API}/chat/messages/direct/${contactId}`, { headers });
      setMessages(res.data);
      
      // Mark all as read
      res.data.forEach(msg => markAsRead(msg.id));
    } catch (error) {
      console.error('Error fetching direct messages:', error);
    }
  };

  const fetchUnreadCount = async () => {
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.get(`${API}/chat/unread-count`, { headers });
      setUnreadCount(res.data.total);
      setTeamUnread(res.data.team);
      setDirectUnread(res.data.direct);
    } catch (error) {
      console.error('Error fetching unread count:', error);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() && !uploading) return;
    
    const messageContent = newMessage;
    
    // Optimistic update - add message immediately to UI
    const tempMessage = {
      id: `temp_${Date.now()}`,
      type: activeTab,
      sender_id: currentUser.id,
      sender_name: currentUser.full_name,
      sender_role: currentUser.role,
      content: messageContent,
      created_at: new Date().toISOString(),
      ...(activeTab === 'team' && { team_id: currentUser.team_id }),
      ...(activeTab === 'direct' && { 
        recipient_id: selectedContact?.id,
        recipient_name: selectedContact?.full_name
      })
    };
    
    // Add to messages immediately
    setMessages(prev => [...prev, tempMessage]);
    setNewMessage('');
    setShowEmojiPicker(false);
    
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };
      
      const messageData = {
        type: activeTab,
        content: messageContent,
        ...(activeTab === 'team' && { team_id: currentUser.team_id }),
        ...(activeTab === 'direct' && { recipient_id: selectedContact?.id })
      };
      
      const response = await axios.post(`${API}/chat/send`, messageData, { headers });
      
      // Replace temp message with real one from server
      const realMessageId = response.data.message_id;
      setMessages(prev => prev.map(msg => 
        msg.id === tempMessage.id ? { ...msg, id: realMessageId } : msg
      ));
      
    } catch (error) {
      // Remove the temporary message on error
      setMessages(prev => prev.filter(msg => msg.id !== tempMessage.id));
      toast.error(error.response?.data?.detail || 'Errore nell\'invio del messaggio');
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setUploading(true);
    
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };
      
      const formData = new FormData();
      formData.append('file', file);
      
      const uploadRes = await axios.post(`${API}/chat/upload`, formData, { 
        headers: { ...headers, 'Content-Type': 'multipart/form-data' }
      });
      
      const { file_url, file_name } = uploadRes.data;
      
      // Add file message optimistically
      const tempMessage = {
        id: `temp_${Date.now()}`,
        type: activeTab,
        sender_id: currentUser.id,
        sender_name: currentUser.full_name,
        sender_role: currentUser.role,
        content: `📎 File: ${file_name}`,
        file_url,
        file_name,
        created_at: new Date().toISOString(),
        ...(activeTab === 'team' && { team_id: currentUser.team_id }),
        ...(activeTab === 'direct' && { 
          recipient_id: selectedContact?.id,
          recipient_name: selectedContact?.full_name
        })
      };
      
      setMessages(prev => [...prev, tempMessage]);
      
      // Send message with file
      const messageData = {
        type: activeTab,
        content: `📎 File: ${file_name}`,
        file_url,
        file_name,
        ...(activeTab === 'team' && { team_id: currentUser.team_id }),
        ...(activeTab === 'direct' && { recipient_id: selectedContact?.id })
      };
      
      const response = await axios.post(`${API}/chat/send`, messageData, { headers });
      
      // Update with real message ID
      const realMessageId = response.data.message_id;
      setMessages(prev => prev.map(msg => 
        msg.id === tempMessage.id ? { ...msg, id: realMessageId } : msg
      ));
      
      toast.success('File caricato e inviato');
      
    } catch (error) {
      toast.error('Errore nel caricamento del file');
    } finally {
      setUploading(false);
    }
  };

  const markAsRead = async (messageId) => {
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };
      await axios.put(`${API}/chat/messages/${messageId}/read`, {}, { headers });
    } catch (error) {
      // Silent fail
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === today.toDateString()) {
      return 'Oggi';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Ieri';
    } else {
      return date.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
    }
  };

  const onEmojiClick = (emojiObject) => {
    setNewMessage(prev => prev + emojiObject.emoji);
  };

  const highlightMentions = (text) => {
    // Highlight @mentions with gold background
    const mentionRegex = /@(\w+)/g;
    const parts = text.split(mentionRegex);
    
    return parts.map((part, index) => {
      if (index % 2 === 1) {
        // This is a mention
        return <span key={index} className="bg-yellow-200 px-1 rounded font-semibold">@{part}</span>;
      }
      return part;
    });
  };

  if (!isOpen) {
    return (
      <>
        {/* Notification Popup */}
        {showNotification && notificationData && (
          <div className="fixed top-20 right-6 bg-white border-2 border-[#D4AF37] shadow-2xl rounded-lg p-4 z-50 animate-slide-in max-w-sm">
            <div className="flex items-start gap-3">
              <MessageCircle className="w-6 h-6 text-[#D4AF37] flex-shrink-0 mt-1" />
              <div className="flex-1">
                <p className="font-bold text-black mb-1">Nuovo messaggio da {notificationData.sender}</p>
                <p className="text-sm text-gray-700 line-clamp-2">{notificationData.content}</p>
                <p className="text-xs text-gray-500 mt-1">{notificationData.time.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</p>
              </div>
              <button onClick={() => setShowNotification(false)} className="text-gray-400 hover:text-black">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
        
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 bg-[#D4AF37] text-black rounded-full p-4 shadow-lg hover:bg-[#C5A028] transition-all z-50"
        >
          <MessageCircle className="w-6 h-6" />
          {unreadCount > 0 && (
            <span className="absolute -top-2 -right-2 bg-red-600 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center animate-pulse">
              {unreadCount}
            </span>
          )}
        </button>
      </>
    );
  }

  return (
    <div className={`fixed bottom-6 right-6 bg-white border-2 border-gray-300 shadow-2xl z-50 transition-all ${isMinimized ? 'w-80 h-16' : 'w-96 h-[600px]'} flex flex-col`}>
      {/* Header */}
      <div className="bg-black text-white p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5" />
          <span className="font-bold">Chat CRM</span>
          {unreadCount > 0 && (
            <span className="bg-red-600 text-white text-xs px-2 py-1 rounded-full">{unreadCount}</span>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setIsMinimized(!isMinimized)} className="hover:bg-gray-800 p-1 rounded">
            {isMinimized ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <button onClick={() => setIsOpen(false)} className="hover:bg-gray-800 p-1 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* Tabs */}
          <div className="flex border-b border-gray-300">
            {(currentUser.team_id || currentUser.role === 'admin') && (
              <button
                onClick={() => {
                  setActiveTab('team');
                  setSelectedContact(null);
                  const teamId = currentUser.role === 'admin' ? selectedTeamId : currentUser.team_id;
                  if (teamId) fetchTeamMessages(teamId);
                }}
                className={`flex-1 py-3 px-4 font-semibold flex items-center justify-center gap-2 relative ${activeTab === 'team' ? 'bg-[#D4AF37] text-black' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                <Users className="w-4 h-4" />
                Team Chat
                {teamUnread > 0 && (
                  <span className="absolute top-1 right-2 bg-red-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {teamUnread}
                  </span>
                )}
              </button>
            )}
            <button
              onClick={() => {
                setActiveTab('direct');
                setMessages([]);
              }}
              className={`flex-1 py-3 px-4 font-semibold flex items-center justify-center gap-2 relative ${activeTab === 'direct' ? 'bg-[#D4AF37] text-black' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              <User className="w-4 h-4" />
              Messaggi Diretti
              {directUnread > 0 && (
                <span className="absolute top-1 right-2 bg-red-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {directUnread}
                </span>
              )}
            </button>
          </div>
          
          {/* Admin Team Selector */}
          {currentUser.role === 'admin' && activeTab === 'team' && allTeams.length > 0 && (
            <div className="p-3 bg-gray-50 border-b border-gray-300">
              <label className="text-xs font-semibold text-gray-600 block mb-1">Seleziona Team (Admin):</label>
              <select
                value={selectedTeamId || ''}
                onChange={(e) => {
                  setSelectedTeamId(e.target.value);
                  fetchTeamMessages(e.target.value);
                }}
                className="w-full p-2 border border-gray-300 rounded text-sm"
              >
                {allTeams.map(team => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Contact List (Direct Messages) */}
          {activeTab === 'direct' && !selectedContact && (
            <div className="flex-1 overflow-y-auto p-4">
              <p className="text-sm text-gray-600 mb-3">Seleziona un contatto:</p>
              {contacts.length === 0 ? (
                <p className="text-center text-gray-500 py-8">Nessun contatto disponibile</p>
              ) : (
                <div className="space-y-2">
                  {contacts.map(contact => (
                    <button
                      key={contact.id}
                      onClick={() => setSelectedContact(contact)}
                      className="w-full text-left p-3 border border-gray-200 hover:bg-gray-50 rounded"
                    >
                      <p className="font-semibold text-black">{contact.full_name}</p>
                      <p className="text-xs text-gray-600">{contact.role}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Messages Area */}
          {(activeTab === 'team' || (activeTab === 'direct' && selectedContact)) && (
            <>
              {/* Selected Contact Header (Direct) */}
              {activeTab === 'direct' && selectedContact && (
                <div className="p-3 border-b border-gray-300 flex items-center justify-between bg-gray-50">
                  <div>
                    <p className="font-semibold text-black">{selectedContact.full_name}</p>
                    <p className="text-xs text-gray-600">{selectedContact.role}</p>
                  </div>
                  <button onClick={() => setSelectedContact(null)} className="text-gray-600 hover:text-black">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 bg-gray-50 space-y-3">
                {messages.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">Nessun messaggio ancora</p>
                ) : (
                  messages.map((msg, idx) => {
                    const isOwn = msg.sender_id === currentUser.id;
                    const showDate = idx === 0 || formatDate(messages[idx - 1].created_at) !== formatDate(msg.created_at);
                    
                    return (
                      <div key={msg.id}>
                        {showDate && (
                          <div className="text-center text-xs text-gray-500 my-2">
                            {formatDate(msg.created_at)}
                          </div>
                        )}
                        <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[70%] ${isOwn ? 'bg-[#D4AF37] text-black' : 'bg-white text-black'} rounded-lg p-3 shadow`}>
                            {!isOwn && activeTab === 'team' && (
                              <p className="text-xs font-semibold text-gray-600 mb-1">{msg.sender_name}</p>
                            )}
                            <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                            {msg.file_url && (
                              <a href={`${API}${msg.file_url}`} target="_blank" rel="noopener noreferrer" className="text-xs underline mt-2 block">
                                📎 {msg.file_name}
                              </a>
                            )}
                            <p className="text-xs text-gray-600 mt-1">{formatTime(msg.created_at)}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input Area */}
              <div className="p-3 border-t border-gray-300 bg-white">
                {showEmojiPicker && (
                  <div className="absolute bottom-20 right-6">
                    <EmojiPicker onEmojiClick={onEmojiClick} />
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="p-2 hover:bg-gray-100 rounded"
                  >
                    <Paperclip className="w-5 h-5 text-gray-600" />
                  </button>
                  <button
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className="p-2 hover:bg-gray-100 rounded"
                  >
                    <Smile className="w-5 h-5 text-gray-600" />
                  </button>
                  <Input
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                    placeholder="Scrivi un messaggio..."
                    className="flex-1 rounded-none border-gray-300"
                  />
                  <Button
                    onClick={sendMessage}
                    disabled={!newMessage.trim() || uploading}
                    className="bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};

export default ChatBubble;
