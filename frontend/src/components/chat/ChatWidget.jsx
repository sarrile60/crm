import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MessageCircle, X, Send, Search, Users, ArrowLeft, Paperclip, Image, Check, CheckCheck, Smile, UsersRound } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// Notification sound - base64 encoded short beep
const NOTIFICATION_SOUND = '/sounds/notification.mp3';

const ChatWidget = ({ currentUser }) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [conversationFilter, setConversationFilter] = useState('');
  const [users, setUsers] = useState([]);
  const [showNewChat, setShowNewChat] = useState(false);
  const [showTeamChat, setShowTeamChat] = useState(false);
  const [availableTeams, setAvailableTeams] = useState([]);
  const [typingUsers, setTypingUsers] = useState({});
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const [lastPollTime, setLastPollTime] = useState(null);
  const [zoomedImage, setZoomedImage] = useState(null);
  const [isSending, setIsSending] = useState(false);
  
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const audioRef = useRef(null);

  // Initialize audio
  useEffect(() => {
    audioRef.current = new Audio(NOTIFICATION_SOUND);
    audioRef.current.volume = 0.5;
    
    // Request notification permission on mount
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Play notification sound and show browser notification
  const playNotificationSound = useCallback((senderName = 'New message') => {
    // Play sound
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch((err) => {
        console.log('[Chat] Audio play failed (browser autoplay policy):', err.message);
      });
    }
    
    // Show browser notification if page is not visible
    if (document.visibilityState === 'hidden' && 'Notification' in window && Notification.permission === 'granted') {
      new Notification('New Chat Message', {
        body: `You have a new message from ${senderName}`,
        icon: '/favicon.ico',
        tag: 'chat-notification' // Prevents duplicate notifications
      });
    }
  }, []);

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    try {
      const token = localStorage.getItem('crmToken');
      const response = await axios.get(`${BACKEND_URL}/api/chat/conversations`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setConversations(response.data.conversations);
      
      // Calculate total unread
      const total = response.data.conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);
      setUnreadTotal(total);
    } catch (error) {
      console.error('Error fetching conversations:', error);
    }
  }, []);

  // Fetch available teams for team chat (admin/supervisor only)
  const fetchTeams = useCallback(async () => {
    if (!currentUser || !['admin', 'supervisor'].includes(currentUser.role?.toLowerCase())) {
      return;
    }
    try {
      const token = localStorage.getItem('crmToken');
      const response = await axios.get(`${BACKEND_URL}/api/chat/teams`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAvailableTeams(response.data.teams || []);
    } catch (error) {
      console.error('Error fetching teams:', error);
    }
  }, [currentUser]);

  // Start or open team conversation
  const openTeamChat = async (team) => {
    try {
      const token = localStorage.getItem('crmToken');
      
      // Create or get team conversation
      const response = await axios.post(
        `${BACKEND_URL}/api/chat/teams/${team.id}/conversation`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      const conversation = response.data;
      
      // Add team info to conversation for display
      conversation.team_name = team.name;
      conversation.is_team_chat = true;
      
      setSelectedConversation(conversation);
      setShowTeamChat(false);
      fetchMessages(conversation.id);
      fetchConversations();
    } catch (error) {
      console.error('Error opening team chat:', error);
      toast.error(t('chat.errorOpeningTeamChat'));
    }
  };

  // Send message to team
  const sendTeamMessage = async () => {
    if (!newMessage.trim() || !selectedConversation?.team_id || isSending) return;
    
    const messageToSend = newMessage.trim();
    setIsSending(true);
    setNewMessage('');
    
    try {
      const token = localStorage.getItem('crmToken');
      const response = await axios.post(
        `${BACKEND_URL}/api/chat/teams/${selectedConversation.team_id}/messages`,
        { content: messageToSend, message_type: 'text' },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setMessages(prev => {
        if (prev.some(m => m.id === response.data.id)) return prev;
        return [...prev, response.data];
      });
      
      fetchConversations();
    } catch (error) {
      console.error('Error sending team message:', error);
      setNewMessage(messageToSend);
      toast.error(t('chat.errorSendingMessage'));
    } finally {
      setIsSending(false);
    }
  };

  // Track which message IDs we've already seen to prevent duplicate sounds
  const seenMessageIds = useRef(new Set());
  // Track if this is the initial poll (should not play sound)
  const isInitialPoll = useRef(true);
  
  // Fetch messages for selected conversation
  // onlyMarkReadIfVisible parameter controls whether to mark as read
  const fetchMessages = useCallback(async (conversationId, markAsRead = true) => {
    try {
      const token = localStorage.getItem('crmToken');
      const response = await axios.get(`${BACKEND_URL}/api/chat/conversations/${conversationId}/messages`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMessages(response.data.messages);
      
      // Add all fetched message IDs to seen set (so we don't play sounds for them)
      response.data.messages.forEach(m => seenMessageIds.current.add(m.id));
      
      // Only mark as read if explicitly requested AND document is visible
      if (markAsRead && document.visibilityState === 'visible') {
        await axios.put(`${BACKEND_URL}/api/chat/conversations/${conversationId}/read`, {}, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }
      
      // Update unread count
      fetchConversations();
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  }, [fetchConversations]);
  
  // Poll for new messages
  const pollMessages = useCallback(async () => {
    if (!currentUser) return;
    
    try {
      const token = localStorage.getItem('crmToken');
      // Include conversation_id if we're viewing one, to get read status updates
      let params = lastPollTime ? `?since=${lastPollTime}` : '';
      if (selectedConversation) {
        params += params ? `&conversation_id=${selectedConversation.id}` : `?conversation_id=${selectedConversation.id}`;
      }
      const response = await axios.get(`${BACKEND_URL}/api/chat/poll${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data.messages.length > 0) {
        // Update last poll time FIRST to prevent re-fetching same messages
        const lastMsg = response.data.messages[response.data.messages.length - 1];
        setLastPollTime(lastMsg.created_at);
        
        // Filter out messages we've already seen and our own messages
        const trulyNewMessages = response.data.messages.filter(m => 
          !seenMessageIds.current.has(m.id) && m.sender_id !== currentUser.id
        );
        
        // Add all message IDs to seen set
        response.data.messages.forEach(m => seenMessageIds.current.add(m.id));
        
        // Only play sound if:
        // 1. There are truly new messages from OTHER users
        // 2. This is NOT the initial poll (first load should be silent)
        // 3. Messages are not already read by current user
        if (trulyNewMessages.length > 0 && !isInitialPoll.current) {
          // Only play sound for messages that are NOT already read by current user
          const unreadNewMessages = trulyNewMessages.filter(m => 
            !m.read_by || !m.read_by.includes(currentUser.id)
          );
          
          if (unreadNewMessages.length > 0) {
            // Get sender name for notification
            const senderName = unreadNewMessages[0]?.sender?.full_name || 'Someone';
            const messagePreview = unreadNewMessages[0]?.content?.substring(0, 50) || '';
            
            // Play notification sound
            playNotificationSound(senderName);
            
            // Always show toast notification for new chat messages
            toast.info(`💬 ${senderName}`, {
              description: messagePreview + (messagePreview.length >= 50 ? '...' : ''),
              duration: 6000,
              action: {
                label: t('chat.view') || 'View',
                onClick: () => {
                  setIsOpen(true);
                  // Find the conversation for this message
                  const conv = conversations.find(c => 
                    c.participant_ids?.includes(unreadNewMessages[0]?.sender_id)
                  );
                  if (conv) {
                    setSelectedConversation(conv);
                    fetchMessages(conv.id);
                  }
                }
              }
            });
          }
          
          // Check for system alert messages and show toast notification
          // IMPORTANT: Only show toast for UNREAD system alerts (not already in read_by array)
          const systemAlerts = trulyNewMessages.filter(m => 
            (m.sender_id === 'system_notifications' || m.message_type === 'system_alert') &&
            // Check if current user has NOT already read this message
            (!m.read_by || !m.read_by.includes(currentUser.id))
          );
          
          systemAlerts.forEach(alert => {
            toast.warning('⚠️ System Alert', {
              description: alert.content?.substring(0, 100) + '...',
              duration: 10000,
              action: {
                label: 'View',
                onClick: () => {
                  // Open chat widget and select system conversation
                  setIsOpen(true);
                  const systemConv = conversations.find(c => c.is_system_chat);
                  if (systemConv) {
                    setSelectedConversation(systemConv);
                    fetchMessages(systemConv.id);
                  }
                }
              }
            });
          });
        }
        
        // If we're viewing the conversation, add messages
        if (selectedConversation) {
          const newMsgs = response.data.messages.filter(m => m.conversation_id === selectedConversation.id);
          if (newMsgs.length > 0) {
            // Add only messages that don't already exist
            setMessages(prev => {
              const existingIds = new Set(prev.map(m => m.id));
              const trulyNewMsgs = newMsgs.filter(m => !existingIds.has(m.id));
              if (trulyNewMsgs.length === 0) return prev;
              return [...prev, ...trulyNewMsgs];
            });
            // Only mark as read if chat widget is open AND we're viewing this conversation
            // AND the document is visible (user is actually looking at it)
            if (isOpen && document.visibilityState === 'visible') {
              axios.put(`${BACKEND_URL}/api/chat/conversations/${selectedConversation.id}/read`, {}, {
                headers: { Authorization: `Bearer ${token}` }
              });
            }
          }
        }
        
        // Refresh conversations
        fetchConversations();
      }
      
      // Mark initial poll as complete (subsequent polls can play sounds)
      if (isInitialPoll.current) {
        isInitialPoll.current = false;
      }
      
      // Update read status for messages we sent (live "seen" updates)
      if (response.data.read_updates && response.data.read_updates.length > 0) {
        setMessages(prev => prev.map(msg => {
          const update = response.data.read_updates.find(u => u.id === msg.id);
          if (update && update.read_by) {
            return { ...msg, read_by: update.read_by };
          }
          return msg;
        }));
      }
      
      // Update typing indicators
      setTypingUsers(response.data.typing || {});
      
    } catch (error) {
      console.error('Error polling messages:', error);
    }
  }, [currentUser, lastPollTime, selectedConversation, playNotificationSound, fetchConversations, isOpen, t, conversations, fetchMessages]);

  // Initial load - don't set lastPollTime yet, let first poll catch recent messages
  useEffect(() => {
    if (currentUser) {
      fetchConversations();
      fetchTeams();
      // Don't set lastPollTime here - let first poll get any recent messages
    }
  }, [currentUser, fetchConversations, fetchTeams]);

  // Polling interval - faster when chat is open (3s), slower when closed (15s)
  useEffect(() => {
    if (!currentUser) return;
    
    const pollInterval = isOpen ? 3000 : 15000;
    pollMessages(); // Poll immediately
    const interval = setInterval(pollMessages, pollInterval);
    return () => clearInterval(interval);
  }, [currentUser, pollMessages, isOpen]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Fetch users for new chat
  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('crmToken');
      const response = await axios.get(`${BACKEND_URL}/api/chat/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUsers(response.data.users);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  // Start new conversation
  const startConversation = async (userId) => {
    try {
      const token = localStorage.getItem('crmToken');
      const response = await axios.post(`${BACKEND_URL}/api/chat/conversations`, {
        participant_ids: [userId],
        is_group: false
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setSelectedConversation(response.data);
      fetchMessages(response.data.id);
      setShowNewChat(false);
      fetchConversations();
    } catch (error) {
      console.error('Error starting conversation:', error);
    }
  };

  // Send message
  const sendMessage = async () => {
    // Prevent duplicate sends
    if (!newMessage.trim() || !selectedConversation || isSending) return;
    
    // If this is a team chat, use the team message endpoint
    if (selectedConversation.is_team_chat && selectedConversation.team_id) {
      return sendTeamMessage();
    }
    
    const messageToSend = newMessage.trim();
    setIsSending(true);
    
    try {
      const token = localStorage.getItem('crmToken');
      const response = await axios.post(`${BACKEND_URL}/api/chat/conversations/${selectedConversation.id}/messages`, {
        content: messageToSend,
        message_type: 'text'
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Clear message only after successful send
      setNewMessage('');
      
      // Add message only if it doesn't already exist
      setMessages(prev => {
        if (prev.some(m => m.id === response.data.id)) return prev;
        return [...prev, response.data];
      });
      
      // Stop typing indicator
      sendTypingIndicator(false);
      
      fetchConversations();
    } catch (error) {
      console.error('Error sending message:', error);
      // Restore message on error
      setNewMessage(messageToSend);
    } finally {
      setIsSending(false);
    }
  };

  // Handle typing
  const handleTyping = (e) => {
    setNewMessage(e.target.value);
    
    if (!isTyping && e.target.value) {
      setIsTyping(true);
      sendTypingIndicator(true);
    }
    
    // Clear previous timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    // Set new timeout to stop typing
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      sendTypingIndicator(false);
    }, 2000);
  };

  // Send typing indicator
  const sendTypingIndicator = async (typing) => {
    if (!selectedConversation) return;
    
    try {
      const token = localStorage.getItem('crmToken');
      await axios.post(`${BACKEND_URL}/api/chat/conversations/${selectedConversation.id}/typing`, {
        is_typing: typing
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (error) {
      // Ignore typing indicator errors
    }
  };

  // Upload file
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !selectedConversation) return;
    
    try {
      const token = localStorage.getItem('crmToken');
      const formData = new FormData();
      formData.append('file', file);
      
      const uploadResponse = await axios.post(`${BACKEND_URL}/api/chat/upload`, formData, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      
      // Send message with file
      const response = await axios.post(`${BACKEND_URL}/api/chat/conversations/${selectedConversation.id}/messages`, {
        content: file.name,
        message_type: uploadResponse.data.file_type,
        file_url: uploadResponse.data.file_url,
        file_name: uploadResponse.data.file_name
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setMessages(prev => [...prev, response.data]);
      fetchConversations();
    } catch (error) {
      console.error('Error uploading file:', error);
    }
    
    // Reset file input
    e.target.value = '';
  };

  // Search messages - can be called directly or via debounce
  const performSearch = async (query) => {
    if (!query || !query.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    
    // Only search if at least 2 characters
    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    
    setIsSearching(true);
    try {
      const token = localStorage.getItem('crmToken');
      const response = await axios.get(`${BACKEND_URL}/api/chat/search?q=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSearchResults(response.data.messages);
    } catch (error) {
      console.error('Error searching:', error);
    }
    setIsSearching(false);
  };

  // Ref for search debounce timeout
  const searchTimeoutRef = useRef(null);

  // Handle search input change - search automatically as user types
  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchQuery(value);
    
    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    if (!value.trim()) {
      setSearchResults([]);
      return;
    }
    
    // Debounce search - wait 300ms after user stops typing
    searchTimeoutRef.current = setTimeout(() => {
      performSearch(value);
    }, 300);
  };
  
  // Manual search (for Enter key or button click)
  const handleSearch = () => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    performSearch(searchQuery);
  };

  // Navigate to a message from search results
  const navigateToMessage = async (msg) => {
    // Find the conversation this message belongs to
    const conversationId = msg.conversation_id;
    
    // Find the conversation in our list
    let targetConversation = conversations.find(c => c.id === conversationId);
    
    // If not found in current state, try to get fresh conversations
    if (!targetConversation) {
      try {
        const token = localStorage.getItem('crmToken');
        const response = await axios.get(`${BACKEND_URL}/api/chat/conversations`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const freshConversations = response.data.conversations;
        setConversations(freshConversations);
        targetConversation = freshConversations.find(c => c.id === conversationId);
      } catch (error) {
        console.error('Error fetching conversations:', error);
      }
    }
    
    // Clear search first
    setSearchQuery('');
    setSearchResults([]);
    
    // Set the conversation (use the found one or create a minimal object)
    const convToUse = targetConversation || { id: conversationId, ...msg.conversation };
    setSelectedConversation(convToUse);
    
    // Fetch messages for this conversation
    await fetchMessages(conversationId);
    
    // Wait for messages to render, then scroll to the message
    setTimeout(() => {
      const messageElement = document.getElementById(`message-${msg.id}`);
      if (messageElement) {
        messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Highlight the message briefly
        messageElement.classList.add('ring-2', 'ring-[#D4AF37]', 'ring-offset-2');
        setTimeout(() => {
          messageElement.classList.remove('ring-2', 'ring-[#D4AF37]', 'ring-offset-2');
        }, 2000);
      }
    }, 200);
  };

  // Get conversation display name
  const getConversationName = (conv) => {
    if (conv.is_group) return conv.name;
    const otherUser = conv.participants?.find(p => p.id !== currentUser?.id);
    return otherUser?.full_name || 'Unknown User';
  };

  // Format time
  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return t('chat.yesterday');
    } else {
      return date.toLocaleDateString();
    }
  };

  // Render read status
  const renderReadStatus = (msg) => {
    if (msg.sender_id !== currentUser?.id) return null;
    
    const isRead = msg.read_by?.length > 1;
    return isRead ? (
      <CheckCheck className="w-4 h-4 text-blue-500" />
    ) : (
      <Check className="w-4 h-4 text-gray-400" />
    );
  };

  const widgetClasses = isFullScreen 
    ? "fixed inset-4 z-50 bg-white rounded-lg shadow-2xl flex flex-col"
    : "fixed bottom-4 right-4 z-50 w-96 h-[500px] bg-white rounded-lg shadow-2xl flex flex-col";

  if (!isOpen) {
    return (
      <button
        onClick={() => { setIsOpen(true); fetchConversations(); }}
        className="fixed bottom-4 right-4 z-50 bg-[#D4AF37] hover:bg-[#C4A030] text-white p-4 rounded-full shadow-lg transition-all"
      >
        <MessageCircle className="w-6 h-6" />
        {unreadTotal > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
            {unreadTotal > 9 ? '9+' : unreadTotal}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className={widgetClasses}>
      {/* Header */}
      <div className="bg-[#1a1a2e] text-white p-4 rounded-t-lg flex items-center justify-between">
        {selectedConversation ? (
          <>
            <div className="flex items-center gap-3">
              <button onClick={() => setSelectedConversation(null)} className="hover:bg-white/10 p-1 rounded">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <div className="font-semibold">{getConversationName(selectedConversation)}</div>
                {typingUsers[selectedConversation.id]?.length > 0 && (
                  <div className="text-xs text-green-400 animate-pulse">{t('chat.typing')}</div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5" />
            <span className="font-semibold">{t('chat.title')}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsFullScreen(!isFullScreen)}
            className="hover:bg-white/10 p-1 rounded text-sm"
          >
            {isFullScreen ? '↙' : '↗'}
          </button>
          <button onClick={() => setIsOpen(false)} className="hover:bg-white/10 p-1 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {!selectedConversation ? (
          // Conversation List
          <div className="flex-1 overflow-y-auto">
            {/* Search Section */}
            <div className="p-3 border-b space-y-2">
              {/* Conversation Filter */}
              <div className="relative">
                <Users className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder={t('chat.filterConversations')}
                  value={conversationFilter}
                  onChange={(e) => setConversationFilter(e.target.value)}
                  className="pl-9 text-sm"
                />
                {conversationFilter && (
                  <button 
                    onClick={() => setConversationFilter('')}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              
              {/* Message Search */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <Input
                    placeholder={t('chat.searchMessages')}
                    value={searchQuery}
                    onChange={handleSearchChange}
                    onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                    className="pl-9 text-sm"
                  />
                </div>
                <Button size="sm" onClick={handleSearch} disabled={isSearching}>
                  <Search className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* New Chat Button */}
            <button
              onClick={() => { setShowNewChat(true); fetchUsers(); }}
              className="w-full p-3 text-left hover:bg-gray-50 border-b flex items-center gap-3 text-[#D4AF37]"
            >
              <Users className="w-5 h-5" />
              <span>{t('chat.newConversation')}</span>
            </button>

            {/* Team Chat Button (Admin/Supervisor only) */}
            {['admin', 'supervisor'].includes(currentUser?.role?.toLowerCase()) && availableTeams.length > 0 && (
              <button
                onClick={() => { setShowTeamChat(true); fetchTeams(); }}
                className="w-full p-3 text-left hover:bg-gray-50 border-b flex items-center gap-3 text-[#1a1a2e]"
              >
                <UsersRound className="w-5 h-5" />
                <span>{t('chat.teamChat')}</span>
                <span className="ml-auto text-xs text-gray-500">
                  {availableTeams.length} {availableTeams.length === 1 ? 'team' : 'teams'}
                </span>
              </button>
            )}

            {/* Search Results */}
            {searchResults.length > 0 && (
              <div className="border-b">
                <div className="px-3 py-2 text-xs text-gray-500 bg-gray-50 flex justify-between items-center">
                  <span>{t('chat.searchResults')} ({searchResults.length})</span>
                  <button 
                    onClick={() => { setSearchQuery(''); setSearchResults([]); }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {searchResults.map(msg => (
                  <div 
                    key={msg.id} 
                    className="p-3 hover:bg-gray-100 cursor-pointer border-b transition-colors"
                    onClick={() => navigateToMessage(msg)}
                  >
                    <div className="text-sm font-medium text-[#1a1a2e]">{msg.sender?.full_name}</div>
                    <div className="text-sm text-gray-600 truncate">{msg.content}</div>
                    <div className="text-xs text-gray-400 mt-1">{formatTime(msg.created_at)}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Show users for new chat */}
            {showNewChat && (
              <div className="border-b">
                <div className="px-3 py-2 text-xs text-gray-500 bg-gray-50 flex justify-between">
                  <span>{t('chat.selectUser')}</span>
                  <button onClick={() => setShowNewChat(false)} className="text-gray-400 hover:text-gray-600">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {users.map(user => (
                  <button
                    key={user.id}
                    onClick={() => startConversation(user.id)}
                    className="w-full p-3 text-left hover:bg-gray-50 border-b flex items-center gap-3"
                  >
                    <div className="w-10 h-10 bg-[#D4AF37] rounded-full flex items-center justify-center text-white font-semibold">
                      {user.full_name?.charAt(0) || '?'}
                    </div>
                    <div>
                      <div className="font-medium">{user.full_name}</div>
                      <div className="text-xs text-gray-500">{user.role}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Team Chat Selection */}
            {showTeamChat && (
              <div className="border-b">
                <div className="px-3 py-2 text-xs text-gray-500 bg-[#1a1a2e] text-white flex justify-between">
                  <span className="flex items-center gap-2">
                    <UsersRound className="w-4 h-4" />
                    {t('chat.selectTeam')}
                  </span>
                  <button onClick={() => setShowTeamChat(false)} className="text-gray-300 hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {availableTeams.length === 0 ? (
                  <div className="p-4 text-center text-gray-500 text-sm">
                    {t('chat.noTeamsAvailable')}
                  </div>
                ) : (
                  availableTeams.map(team => (
                    <button
                      key={team.id}
                      onClick={() => openTeamChat(team)}
                      className="w-full p-3 text-left hover:bg-gray-50 border-b flex items-center gap-3"
                    >
                      <div className="w-10 h-10 bg-[#1a1a2e] rounded-full flex items-center justify-center text-white">
                        <UsersRound className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <div className="font-medium">{team.name}</div>
                        <div className="text-xs text-gray-500">
                          {team.member_count} {team.member_count === 1 ? t('chat.member') : t('chat.members')}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}

            {/* Conversations */}
            {conversations
              .filter(conv => {
                // Hide system chats from agents - only supervisors and admins should see them
                if (conv.is_system_chat && currentUser?.role?.toLowerCase() === 'agent') {
                  return false;
                }
                if (!conversationFilter.trim()) return true;
                const name = getConversationName(conv).toLowerCase();
                return name.includes(conversationFilter.toLowerCase());
              })
              .map(conv => (
              <button
                key={conv.id}
                onClick={() => { setSelectedConversation(conv); fetchMessages(conv.id); setConversationFilter(''); }}
                className="w-full p-3 text-left hover:bg-gray-50 border-b flex items-center gap-3"
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold ${
                  conv.is_team_chat ? 'bg-[#1a1a2e]' : 
                  conv.is_system_chat ? 'bg-orange-500' : 'bg-[#D4AF37]'
                }`}>
                  {conv.is_team_chat ? (
                    <UsersRound className="w-5 h-5" />
                  ) : conv.is_system_chat ? (
                    '⚠️'
                  ) : (
                    getConversationName(conv).charAt(0)
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between">
                    <span className={`font-medium truncate ${conv.is_team_chat ? 'text-[#1a1a2e]' : ''}`}>
                      {conv.is_team_chat && <span className="text-xs text-gray-500 mr-1">{t('chat.team')}:</span>}
                      {getConversationName(conv)}
                    </span>
                    {conv.last_message_at && (
                      <span className="text-xs text-gray-400">{formatTime(conv.last_message_at)}</span>
                    )}
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500 truncate">{conv.last_message || t('chat.noMessages')}</span>
                    {conv.unread_count > 0 && (
                      <span className="bg-[#D4AF37] text-white text-xs px-2 py-0.5 rounded-full">
                        {conv.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}

            {/* No conversations or no filter results */}
            {conversations.length === 0 && !showNewChat && (
              <div className="p-8 text-center text-gray-500">
                <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>{t('chat.noConversations')}</p>
              </div>
            )}
            
            {conversations.length > 0 && conversationFilter && 
              conversations.filter(conv => getConversationName(conv).toLowerCase().includes(conversationFilter.toLowerCase())).length === 0 && (
              <div className="p-6 text-center text-gray-500">
                <Users className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">{t('chat.noMatchingConversations')}</p>
                <button 
                  onClick={() => setConversationFilter('')}
                  className="text-[#D4AF37] text-sm mt-2 hover:underline"
                >
                  {t('common.clearFilters')}
                </button>
              </div>
            )}
          </div>
        ) : (
          // Messages View
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
              {messages.map(msg => (
                <div
                  key={msg.id}
                  id={`message-${msg.id}`}
                  className={`flex transition-all duration-300 ${msg.sender_id === currentUser?.id ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[70%] ${msg.sender_id === currentUser?.id ? 'order-1' : ''}`}>
                    {msg.sender_id !== currentUser?.id && (
                      <div className="text-xs text-gray-500 mb-1">{msg.sender?.full_name}</div>
                    )}
                    <div className={`rounded-lg p-3 ${
                      msg.sender_id === currentUser?.id 
                        ? 'bg-[#D4AF37] text-white' 
                        : 'bg-white border'
                    }`}>
                      {msg.message_type === 'image' ? (
                        <img 
                          src={msg.file_url} 
                          alt={msg.file_name} 
                          className="max-w-full rounded cursor-pointer hover:opacity-90 transition-opacity" 
                          onClick={() => setZoomedImage(msg.file_url)}
                        />
                      ) : msg.message_type === 'file' ? (
                        <a href={msg.file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 underline">
                          <Paperclip className="w-4 h-4" />
                          {msg.file_name}
                        </a>
                      ) : (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      )}
                    </div>
                    <div className={`flex items-center gap-1 mt-1 text-xs text-gray-400 ${
                      msg.sender_id === currentUser?.id ? 'justify-end' : ''
                    }`}>
                      <span>{formatTime(msg.created_at)}</span>
                      {renderReadStatus(msg)}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <div className="p-3 border-t bg-white">
              {/* Check if user can send messages in team chat - only admin/supervisor can */}
              {selectedConversation?.is_team_chat && !['admin', 'supervisor'].includes(currentUser?.role?.toLowerCase()) ? (
                <div className="flex items-center justify-center gap-2 text-gray-500 py-2">
                  <UsersRound className="w-4 h-4" />
                  <span className="text-sm">{t('chat.teamChatReadOnly')}</span>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    className="hidden"
                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2 hover:bg-gray-100 rounded"
                  >
                    <Paperclip className="w-5 h-5 text-gray-500" />
                  </button>
                  <Input
                    placeholder={isSending ? 'Sending...' : t('chat.typeMessage')}
                    value={newMessage}
                    onChange={handleTyping}
                    onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && !isSending && sendMessage()}
                    className={`flex-1 ${isSending ? 'opacity-50' : ''}`}
                    disabled={isSending}
                  />
                  <Button onClick={sendMessage} disabled={!newMessage.trim() || isSending} className={isSending ? 'opacity-50' : ''}>
                    <Send className={`w-4 h-4 ${isSending ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
      
      {/* Image Zoom Modal */}
      {zoomedImage && (
        <div 
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setZoomedImage(null)}
        >
          <button
            onClick={() => setZoomedImage(null)}
            className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors"
          >
            <X className="w-8 h-8" />
          </button>
          <img 
            src={zoomedImage} 
            alt="Zoomed" 
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
};

export default ChatWidget;
