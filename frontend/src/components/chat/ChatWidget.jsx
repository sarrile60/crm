import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MessageCircle, X, Send, Search, Users, ArrowLeft, Paperclip, Image, Check, CheckCheck, Smile } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { useTranslation } from 'react-i18next';
import axios from 'axios';

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
  const [typingUsers, setTypingUsers] = useState({});
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const [lastPollTime, setLastPollTime] = useState(null);
  const [zoomedImage, setZoomedImage] = useState(null);
  
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const audioRef = useRef(null);

  // Initialize audio
  useEffect(() => {
    audioRef.current = new Audio(NOTIFICATION_SOUND);
    audioRef.current.volume = 0.5;
  }, []);

  // Play notification sound
  const playNotificationSound = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
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

  // Fetch messages for selected conversation
  const fetchMessages = useCallback(async (conversationId) => {
    try {
      const token = localStorage.getItem('crmToken');
      const response = await axios.get(`${BACKEND_URL}/api/chat/conversations/${conversationId}/messages`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMessages(response.data.messages);
      
      // Mark as read
      await axios.put(`${BACKEND_URL}/api/chat/conversations/${conversationId}/read`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
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
      const params = lastPollTime ? `?since=${lastPollTime}` : '';
      const response = await axios.get(`${BACKEND_URL}/api/chat/poll${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data.messages.length > 0) {
        // Play sound for new messages
        playNotificationSound();
        
        // Update last poll time
        const lastMsg = response.data.messages[response.data.messages.length - 1];
        setLastPollTime(lastMsg.created_at);
        
        // If we're viewing the conversation, add messages
        if (selectedConversation) {
          const newMsgs = response.data.messages.filter(m => m.conversation_id === selectedConversation.id);
          if (newMsgs.length > 0) {
            setMessages(prev => [...prev, ...newMsgs]);
            // Mark as read
            axios.put(`${BACKEND_URL}/api/chat/conversations/${selectedConversation.id}/read`, {}, {
              headers: { Authorization: `Bearer ${token}` }
            });
          }
        }
        
        // Refresh conversations
        fetchConversations();
      }
      
      // Update typing indicators
      setTypingUsers(response.data.typing || {});
      
    } catch (error) {
      console.error('Error polling messages:', error);
    }
  }, [currentUser, lastPollTime, selectedConversation, playNotificationSound, fetchConversations]);

  // Initial load
  useEffect(() => {
    if (currentUser) {
      fetchConversations();
      setLastPollTime(new Date().toISOString());
    }
  }, [currentUser, fetchConversations]);

  // Polling interval
  useEffect(() => {
    if (!currentUser) return;
    
    const interval = setInterval(pollMessages, 3000);
    return () => clearInterval(interval);
  }, [currentUser, pollMessages]);

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
    if (!newMessage.trim() || !selectedConversation) return;
    
    try {
      const token = localStorage.getItem('crmToken');
      const response = await axios.post(`${BACKEND_URL}/api/chat/conversations/${selectedConversation.id}/messages`, {
        content: newMessage,
        message_type: 'text'
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setMessages(prev => [...prev, response.data]);
      setNewMessage('');
      
      // Stop typing indicator
      sendTypingIndicator(false);
      
      fetchConversations();
    } catch (error) {
      console.error('Error sending message:', error);
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

  // Search messages
  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    
    setIsSearching(true);
    try {
      const token = localStorage.getItem('crmToken');
      const response = await axios.get(`${BACKEND_URL}/api/chat/search?q=${encodeURIComponent(searchQuery)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSearchResults(response.data.messages);
    } catch (error) {
      console.error('Error searching:', error);
    }
    setIsSearching(false);
  };

  // Handle search input change - clear results when input is cleared
  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchQuery(value);
    if (!value.trim()) {
      setSearchResults([]);
    }
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

            {/* Conversations */}
            {conversations.map(conv => (
              <button
                key={conv.id}
                onClick={() => { setSelectedConversation(conv); fetchMessages(conv.id); }}
                className="w-full p-3 text-left hover:bg-gray-50 border-b flex items-center gap-3"
              >
                <div className="w-10 h-10 bg-[#1a1a2e] rounded-full flex items-center justify-center text-white font-semibold">
                  {getConversationName(conv).charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between">
                    <span className="font-medium truncate">{getConversationName(conv)}</span>
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

            {conversations.length === 0 && !showNewChat && (
              <div className="p-8 text-center text-gray-500">
                <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>{t('chat.noConversations')}</p>
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
                  placeholder={t('chat.typeMessage')}
                  value={newMessage}
                  onChange={handleTyping}
                  onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                  className="flex-1"
                />
                <Button onClick={sendMessage} disabled={!newMessage.trim()}>
                  <Send className="w-4 h-4" />
                </Button>
              </div>
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
