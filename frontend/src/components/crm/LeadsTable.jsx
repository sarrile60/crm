import React, { useState, useEffect } from 'react';
import { Eye, Edit, UserPlus, Filter, Search, Upload, Download, Plus, MessageSquare, ChevronLeft, ChevronRight, CheckSquare, Square, Trash2, AlertTriangle } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Textarea } from '../ui/textarea';
import { Checkbox } from '../ui/checkbox';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import SmartDateTimePicker from './SmartDateTimePicker';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const LeadsTable = ({ currentUser, urgentCallbackLead }) => {
  const { t } = useTranslation();
  const [leads, setLeads] = useState([]);
  const [filteredLeads, setFilteredLeads] = useState([]);
  const [users, setUsers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedLeadIds, setSelectedLeadIds] = useState([]);
  const [showMassUpdateModal, setShowMassUpdateModal] = useState(false);

  // Handle urgent callback lead
  useEffect(() => {
    if (urgentCallbackLead) {
      handleViewDetails(urgentCallbackLead);
    }
  }, [urgentCallbackLead]);
  
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [filters, setFilters] = useState({
    status: '',
    priority: '',
    search: ''
  });
  const [editData, setEditData] = useState({});
  const [massUpdateData, setMassUpdateData] = useState({
    status: '',
    team_id: '',
    assigned_to: ''
  });
  const [showImportModal, setShowImportModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [csvFile, setCsvFile] = useState(null);
  const [newLead, setNewLead] = useState({
    fullName: '',
    email: '',
    phone: '',
    scammerCompany: '',
    amountLost: '',
    caseDetails: ''
  });
  const [leadNotes, setLeadNotes] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [currentLeadIndex, setCurrentLeadIndex] = useState(0);
  const [inlineEditLeadId, setInlineEditLeadId] = useState(null);
  const [inlineStatusData, setInlineStatusData] = useState({
    status: '',
    callback_date: '',
    callback_notes: ''
  });
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [leadToDelete, setLeadToDelete] = useState(null);

  useEffect(() => {
    fetchData();
  }, [filters]);

  useEffect(() => {
    setFilteredLeads(leads);
  }, [leads]);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      // Build query params only with non-empty values
      const queryParams = {};
      if (filters.status) queryParams.status = filters.status;
      if (filters.priority) queryParams.priority = filters.priority;
      if (filters.search) queryParams.search = filters.search;

      const [leadsRes, usersRes, statusesRes, teamsRes] = await Promise.all([
        axios.get(`${API}/crm/leads`, { headers, params: queryParams }),
        axios.get(`${API}/crm/users`, { headers }),
        axios.get(`${API}/crm/statuses`, { headers }),
        axios.get(`${API}/crm/teams`, { headers })
      ]);

      setLeads(leadsRes.data);
      setUsers(usersRes.data);
      setStatuses(statusesRes.data);
      setTeams(teamsRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Errore nel caricamento dei dati');
    } finally {
      setLoading(false);
    }
  };

  const formatCreatedDate = (dateString) => {
    const date = new Date(dateString);
    const months = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
    const day = date.getDate();
    const month = months[date.getMonth()];
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${day} ${month} ${hours}:${minutes}`;
  };

  const handleViewDetails = async (lead) => {
    // Find index in filteredLeads
    const index = filteredLeads.findIndex(l => l.id === lead.id);
    setCurrentLeadIndex(index >= 0 ? index : 0);
    
    setSelectedLead(lead);
    setShowDetailModal(true);
    
    // Fetch notes for this lead
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };
      const notesRes = await axios.get(`${API}/crm/leads/${lead.id}/notes`, { headers });
      setLeadNotes(notesRes.data);
    } catch (error) {
      console.error('Error fetching notes:', error);
    }
  };

  const navigateLead = async (direction) => {
    let newIndex = currentLeadIndex + direction;
    
    if (newIndex < 0) newIndex = 0;
    if (newIndex >= filteredLeads.length) newIndex = filteredLeads.length - 1;
    
    if (filteredLeads[newIndex]) {
      setCurrentLeadIndex(newIndex);
      const nextLead = filteredLeads[newIndex];
      setSelectedLead(nextLead);
      
      // Fetch notes for the new lead
      try {
        const token = localStorage.getItem('crmToken');
        const headers = { Authorization: `Bearer ${token}` };
        const notesRes = await axios.get(`${API}/crm/leads/${nextLead.id}/notes`, { headers });
        setLeadNotes(notesRes.data);
      } catch (error) {
        console.error('Error fetching notes:', error);
      }
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) {
      toast.error('La nota non può essere vuota');
      return;
    }

    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };
      
      await axios.post(`${API}/crm/leads/${selectedLead.id}/notes`, {
        lead_id: selectedLead.id,
        note: newNote,
        is_internal: true
      }, { headers });
      
      toast.success('Nota aggiunta con successo');
      setNewNote('');
      
      // Refresh notes
      const notesRes = await axios.get(`${API}/crm/leads/${selectedLead.id}/notes`, { headers });
      setLeadNotes(notesRes.data);
    } catch (error) {
      toast.error('Errore nell\'aggiunta della nota');
    }
  };

  const handleCreateLead = async () => {
    if (!newLead.fullName || !newLead.email || !newLead.phone || !newLead.scammerCompany || !newLead.amountLost || !newLead.caseDetails) {
      toast.error('Compila tutti i campi obbligatori');
      return;
    }

    // Validate email format - must contain @
    if (!newLead.email.includes('@')) {
      toast.error('Email non valida: deve contenere @');
      return;
    }

    // Validate phone - only digits, spaces, + and - allowed (no letters)
    const phoneDigitsOnly = newLead.phone.replace(/[\s\-\+\(\)]/g, '');
    if (!/^\d+$/.test(phoneDigitsOnly)) {
      toast.error('Telefono non valido: inserire solo numeri');
      return;
    }

    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };
      
      // Use CRM endpoint which auto-assigns to creator's team and user
      await axios.post(`${API}/crm/leads/create`, newLead, { headers });
      
      toast.success(`Lead creato con successo e assegnato a te${currentUser.team_id ? ' e al tuo team' : ''}`);
      setShowCreateModal(false);
      setNewLead({
        fullName: '',
        email: '',
        phone: '',
        scammerCompany: '',
        amountLost: '',
        caseDetails: ''
      });
      
      // Wait a bit for database to update, then refresh
      setTimeout(() => {
        fetchData();
      }, 500);
    } catch (error) {
      console.error('Error creating lead:', error);
      toast.error(error.response?.data?.detail || 'Errore nella creazione del lead');
    }
  };

  const handleDeleteClick = (lead) => {
    setLeadToDelete(lead);
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    if (!leadToDelete) return;
    
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      await axios.delete(`${API}/crm/leads/${leadToDelete.id}`, { headers });
      toast.success('Lead eliminato con successo');
      setShowDeleteModal(false);
      setLeadToDelete(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Errore nell\'eliminazione del lead');
    }
  };

  const handleExportCSV = () => {
    if (leads.length === 0) {
      toast.error('Nessun lead da esportare');
      return;
    }

    const csvContent = [
      ['Data Creazione', 'Nome', 'Email', 'Telefono', 'Azienda Truffatrice', 'Importo Perso', 'Stato', 'Priorità', 'Dettagli Caso'],
      ...leads.map(lead => [
        formatCreatedDate(lead.created_at),
        lead.fullName,
        lead.email,
        lead.phone,
        lead.scammerCompany,
        lead.amountLost,
        lead.status,
        lead.priority,
        lead.caseDetails
      ])
    ].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `leads_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast.success('Lead esportati con successo');
  };

  const handleImportCSV = async () => {
    if (!csvFile) {
      toast.error('Seleziona un file CSV');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target.result;
        const rows = text.split('\n').slice(1); // Skip header
        
        const token = localStorage.getItem('crmToken');
        const headers = { Authorization: `Bearer ${token}` };
        
        let imported = 0;
        for (const row of rows) {
          if (!row.trim()) continue;
          
          const [fullName, email, phone, scammerCompany, amountLost, caseDetails] = row.split(',').map(cell => cell.replace(/^"|"$/g, ''));
          
          try {
            await axios.post(`${API}/leads/submit`, {
              fullName,
              email,
              phone,
              scammerCompany,
              amountLost,
              caseDetails
            });
            imported++;
          } catch (error) {
            console.error('Error importing row:', error);
          }
        }
        
        toast.success(`${imported} lead importati con successo`);
        setShowImportModal(false);
        setCsvFile(null);
        fetchData();
      } catch (error) {
        toast.error('Errore nell\'importazione del CSV');
      }
    };
    
    reader.readAsText(csvFile);
  };

  const handleEdit = (lead) => {
    setSelectedLead(lead);
    setEditData({
      status: lead.status,
      priority: lead.priority,
      callback_date: lead.callback_date || '',
      callback_notes: lead.callback_notes || ''
    });
    setShowEditModal(true);
  };

  const handleAssign = (lead) => {
    setSelectedLead(lead);
    setShowAssignModal(true);
  };

  const handleInlineStatusChange = async (leadId, newStatus) => {
    const requiresCallback = newStatus === 'Callback' || 
                            newStatus === 'Potential Callback' || 
                            newStatus === 'Pharos in progress' ||
                            newStatus?.startsWith('Deposit');
    
    if (requiresCallback) {
      // Open a mini modal for callback date/time
      setInlineEditLeadId(leadId);
      setInlineStatusData({ status: newStatus, callback_date: '', callback_notes: '' });
    } else {
      // Update status directly
      try {
        const token = localStorage.getItem('crmToken');
        const headers = { Authorization: `Bearer ${token}` };
        await axios.put(`${API}/crm/leads/${leadId}`, { status: newStatus }, { headers });
        toast.success('Stato aggiornato');
        fetchData();
      } catch (error) {
        toast.error('Errore aggiornamento stato');
      }
    }
  };

  const handleSaveInlineCallback = async () => {
    if (!inlineStatusData.callback_date) {
      toast.error('Devi impostare data e ora');
      return;
    }

    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };
      await axios.put(`${API}/crm/leads/${inlineEditLeadId}`, inlineStatusData, { headers });
      localStorage.removeItem(`callback_alerted_${inlineEditLeadId}`);
      toast.success('Stato aggiornato con callback');
      setInlineEditLeadId(null);
      setInlineStatusData({ status: '', callback_date: '', callback_notes: '' });
      fetchData();
    } catch (error) {
      toast.error('Errore aggiornamento');
    }
  };

  const handleSaveEdit = async () => {
    // Validate callback date for callback statuses
    const requiresCallback = editData.status === 'Callback' || 
                            editData.status === 'Potential Callback' || 
                            editData.status === 'Pharos in progress' ||
                            editData.status?.startsWith('Deposit');
    
    if (requiresCallback && !editData.callback_date) {
      toast.error('Devi impostare data e ora per questo stato');
      return;
    }

    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      await axios.put(`${API}/crm/leads/${selectedLead.id}`, editData, { headers });
      
      // Clear the old alert flag so new callbacks can trigger alerts
      localStorage.removeItem(`callback_alerted_${selectedLead.id}`);
      
      toast.success('Lead aggiornato con successo');
      setShowEditModal(false);
      fetchData();
      
      // If we're in detail modal, update the selected lead
      if (showDetailModal) {
        setSelectedLead({...selectedLead, ...editData});
      }
    } catch (error) {
      toast.error('Errore nell\'aggiornamento del lead');
    }
  };

  const handleAssignLead = async (assignedTo) => {
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      await axios.post(
        `${API}/crm/leads/${selectedLead.id}/assign`,
        {
          lead_id: selectedLead.id,
          assigned_to: assignedTo,
          assigned_by: currentUser.id
        },
        { headers }
      );
      
      toast.success('Lead assegnato con successo');
      setShowAssignModal(false);
      fetchData();
    } catch (error) {
      toast.error('Errore nell\'assegnazione del lead');
    }
  };

  const toggleLeadSelection = (leadId) => {
    setSelectedLeadIds(prev => 
      prev.includes(leadId) 
        ? prev.filter(id => id !== leadId)
        : [...prev, leadId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedLeadIds.length === filteredLeads.length) {
      setSelectedLeadIds([]);
    } else {
      setSelectedLeadIds(filteredLeads.map(lead => lead.id));
    }
  };

  const handleMassUpdate = async () => {
    if (selectedLeadIds.length === 0) {
      toast.error('Nessun lead selezionato');
      return;
    }

    if (!massUpdateData.status && !massUpdateData.team_id && !massUpdateData.assigned_to) {
      toast.error('Seleziona almeno un campo da aggiornare');
      return;
    }

    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      const updatePayload = {
        lead_ids: selectedLeadIds,
        ...(massUpdateData.status && { status: massUpdateData.status }),
        ...(massUpdateData.team_id && { team_id: massUpdateData.team_id }),
        ...(massUpdateData.assigned_to && { assigned_to: massUpdateData.assigned_to })
      };

      const response = await axios.post(`${API}/crm/leads/mass-update`, updatePayload, { headers });
      
      toast.success(`${response.data.updated_count} lead aggiornati con successo`);
      setShowMassUpdateModal(false);
      setSelectedLeadIds([]);
      setMassUpdateData({ status: '', team_id: '', assigned_to: '' });
      fetchData();
    } catch (error) {
      toast.error('Errore nell\'aggiornamento massivo');
    }
  };

  const formatPhoneForCall = (phone) => {
    // Remove spaces and special chars, keep only digits
    const cleanPhone = phone.replace(/[^0-9x]/g, '');
    // If it's masked (contains x), extract just the visible digits for display purposes
    // For calling, we need the full number from backend
    if (cleanPhone.startsWith('39')) {
      return `tel:+${cleanPhone}`;
    }
    return `tel:+39${cleanPhone}`;
  };

  const formatPhoneDisplay = (phone) => {
    // If already has +39, don't add it again
    if (phone.startsWith('+39') || phone.startsWith('39')) {
      return phone.startsWith('+') ? phone : `+${phone}`;
    }
    // If it's just the number without country code
    return `+39 ${phone}`;
  };

  const getStatusColor = (status) => {
    const colors = {
      new: 'bg-blue-100 text-blue-800',
      contacted: 'bg-purple-100 text-purple-800',
      qualified: 'bg-green-100 text-green-800',
      callback: 'bg-yellow-100 text-yellow-800',
      in_progress: 'bg-orange-100 text-orange-800',
      won: 'bg-green-600 text-white',
      lost: 'bg-red-100 text-red-800',
      rejected: 'bg-gray-100 text-gray-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getPriorityColor = (priority) => {
    const colors = {
      low: 'text-gray-600',
      medium: 'text-blue-600',
      high: 'text-orange-600',
      urgent: 'text-red-600'
    };
    return colors[priority] || 'text-gray-600';
  };

  if (loading) {
    return <div className="text-center py-12">Caricamento lead...</div>;
  }

  const canMassUpdate = ['admin', 'supervisor'].includes(currentUser.role);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-3xl font-bold text-black">Gestione Lead</h2>
        <div className="flex gap-3">
          {canMassUpdate && selectedLeadIds.length > 0 && (
            <Button onClick={() => setShowMassUpdateModal(true)} className="bg-purple-600 text-white hover:bg-purple-700 rounded-none">
              <Edit className="w-4 h-4 mr-2" />
              Mass Update ({selectedLeadIds.length})
            </Button>
          )}
          <Button onClick={() => setShowCreateModal(true)} className="bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none">
            <Plus className="w-4 h-4 mr-2" />
            Crea Lead
          </Button>
          {currentUser.role === 'admin' && (
            <>
              <Button onClick={() => setShowImportModal(true)} className="bg-blue-600 text-white hover:bg-blue-700 rounded-none">
                <Upload className="w-4 h-4 mr-2" />
                Importa CSV
              </Button>
              <Button onClick={handleExportCSV} className="bg-green-600 text-white hover:bg-green-700 rounded-none">
                <Download className="w-4 h-4 mr-2" />
                Esporta CSV
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-gray-50 border-2 border-gray-200 p-6 mb-6">
        <div className="grid md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-semibold text-black mb-2">Cerca</label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Nome, email, azienda..."
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                className="pl-10 bg-white border-gray-300 rounded-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-black mb-2">Stato</label>
            <Select value={filters.status || "all"} onValueChange={(value) => setFilters({ ...filters, status: value === "all" ? "" : value })}>
              <SelectTrigger className="bg-white border-gray-300 rounded-none">
                <SelectValue placeholder="Tutti" />
              </SelectTrigger>
              <SelectContent className="bg-white">
                <SelectItem value="all">Tutti</SelectItem>
                {statuses.map(status => (
                  <SelectItem key={status.id} value={status.name}>{status.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-black mb-2">Priorità</label>
            <Select value={filters.priority || "all"} onValueChange={(value) => setFilters({ ...filters, priority: value === "all" ? "" : value })}>
              <SelectTrigger className="bg-white border-gray-300 rounded-none">
                <SelectValue placeholder="Tutte" />
              </SelectTrigger>
              <SelectContent className="bg-white">
                <SelectItem value="all">Tutte</SelectItem>
                <SelectItem value="low">Bassa</SelectItem>
                <SelectItem value="medium">Media</SelectItem>
                <SelectItem value="high">Alta</SelectItem>
                <SelectItem value="urgent">Urgente</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button onClick={() => setFilters({ status: '', priority: '', search: '' })} className="bg-gray-800 text-white hover:bg-black rounded-none w-full">
              Reset Filtri
            </Button>
          </div>
        </div>
      </div>

      {/* Leads Table */}
      <div className="bg-white border-2 border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-black">
            <tr>
              {canMassUpdate && (
                <th className="text-left text-white p-4 font-semibold w-12">
                  <button onClick={toggleSelectAll} className="text-white hover:text-[#D4AF37]">
                    {selectedLeadIds.length === filteredLeads.length && filteredLeads.length > 0 ? (
                      <CheckSquare className="w-5 h-5" />
                    ) : (
                      <Square className="w-5 h-5" />
                    )}
                  </button>
                </th>
              )}
              <th className="text-left text-white p-4 font-semibold">Created Date</th>
              <th className="text-left text-white p-4 font-semibold">Nome</th>
              <th className="text-left text-white p-4 font-semibold">Telefono</th>
              <th className="text-left text-white p-4 font-semibold">Email</th>
              <th className="text-left text-white p-4 font-semibold">Importo</th>
              <th className="text-left text-white p-4 font-semibold">Stato</th>
              <th className="text-left text-white p-4 font-semibold">Priorità</th>
              <th className="text-left text-white p-4 font-semibold">Team</th>
              <th className="text-left text-white p-4 font-semibold">Assegnato</th>
              <th className="text-left text-white p-4 font-semibold">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {filteredLeads.length === 0 ? (
              <tr>
                <td colSpan={canMassUpdate ? "10" : "9"} className="text-center p-8 text-gray-600">
                  Nessun lead trovato
                </td>
              </tr>
            ) : (
              filteredLeads.map((lead) => (
                <tr key={lead.id} className="border-t border-gray-200 hover:bg-gray-50">
                  {canMassUpdate && (
                    <td className="p-4">
                      <button onClick={() => toggleLeadSelection(lead.id)} className="text-gray-700 hover:text-[#D4AF37]">
                        {selectedLeadIds.includes(lead.id) ? (
                          <CheckSquare className="w-5 h-5" />
                        ) : (
                          <Square className="w-5 h-5" />
                        )}
                      </button>
                    </td>
                  )}
                  <td className="p-4 text-gray-700">
                    {formatCreatedDate(lead.created_at)}
                  </td>
                  <td className="p-4">
                    <button
                      onClick={() => handleViewDetails(lead)}
                      className="text-black font-semibold hover:text-[#D4AF37] underline"
                    >
                      {lead.fullName}
                    </button>
                  </td>
                  <td className="p-4">
                    {/* Phone visibility controlled by backend - respect empty string as "hidden" */}
                    {lead.phone_display !== undefined && lead.phone_display !== null ? (
                      lead.phone_display ? (
                        <a 
                          href={formatPhoneForCall(lead.phone_real || lead.phone)} 
                          className="text-blue-600 hover:text-blue-800 font-mono underline"
                          title="Click to call"
                        >
                          {lead.phone_display}
                        </a>
                      ) : (
                        <span className="text-gray-400 italic">Nascosto</span>
                      )
                    ) : (
                      <a 
                        href={formatPhoneForCall(lead.phone)} 
                        className="text-blue-600 hover:text-blue-800 font-mono underline"
                      >
                        {formatPhoneDisplay(lead.phone)}
                      </a>
                    )}
                  </td>
                  <td className="p-4 text-gray-700">
                    {/* Email visibility controlled by backend */}
                    {lead.email_display !== undefined && lead.email_display !== null ? (
                      lead.email_display || <span className="text-gray-400 italic">Nascosto</span>
                    ) : (
                      lead.email
                    )}
                  </td>
                  <td className="p-4 text-gray-700">{lead.amountLost}</td>
                  <td className="p-4">
                    <Select value={lead.status || undefined} onValueChange={(value) => handleInlineStatusChange(lead.id, value)}>
                      <SelectTrigger className="w-[180px] bg-white border-gray-300 rounded-none h-8">
                        <SelectValue placeholder="Seleziona stato">
                          {lead.status && (
                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getStatusColor(lead.status)}`}>
                              {lead.status}
                            </span>
                          )}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent className="bg-white">
                        {statuses.map(status => (
                          <SelectItem key={status.id} value={status.name}>
                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getStatusColor(status.name)}`}>
                              {status.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-4">
                    <span className={`font-semibold ${getPriorityColor(lead.priority)}`}>
                      {lead.priority}
                    </span>
                  </td>
                  <td className="p-4 text-gray-700">
                    {lead.team_id ? teams.find(t => t.id === lead.team_id)?.name || 'N/A' : 'Nessun team'}
                  </td>
                  <td className="p-4 text-gray-700">
                    {lead.assigned_to ? users.find(u => u.id === lead.assigned_to)?.full_name || 'N/A' : 'Non assegnato'}
                  </td>
                  <td className="p-4">
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleViewDetails(lead)}
                        size="sm"
                        className="bg-blue-600 text-white hover:bg-blue-700 rounded-none"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        onClick={() => handleEdit(lead)}
                        size="sm"
                        className="bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      {(currentUser.role === 'admin' || currentUser.role === 'supervisor') && (
                        <>
                          <Button
                            onClick={() => handleAssign(lead)}
                            size="sm"
                            className="bg-green-600 text-white hover:bg-green-700 rounded-none"
                          >
                            <UserPlus className="w-4 h-4" />
                          </Button>
                          <Button
                            onClick={() => handleDeleteClick(lead)}
                            size="sm"
                            className="bg-red-600 text-white hover:bg-red-700 rounded-none"
                            title="Elimina Lead"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Detail Modal with Navigation */}
      {showDetailModal && selectedLead && (
        <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
          <DialogContent className="max-w-4xl bg-white max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <DialogTitle className="text-2xl font-bold text-black">Dettagli Lead</DialogTitle>
                <div className="flex gap-2">
                  <Button
                    onClick={() => navigateLead(-1)}
                    disabled={currentLeadIndex === 0}
                    size="sm"
                    className="bg-gray-200 text-black hover:bg-gray-300 rounded-none disabled:opacity-50"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button
                    onClick={() => navigateLead(1)}
                    disabled={currentLeadIndex === filteredLeads.length - 1}
                    size="sm"
                    className="bg-gray-200 text-black hover:bg-gray-300 rounded-none disabled:opacity-50"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </DialogHeader>
            <div className="space-y-6">
              {/* Lead Info */}
              <div>
                <h3 className="text-lg font-bold text-black mb-4 border-b-2 border-[#D4AF37] pb-2">Informazioni Lead</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-semibold text-gray-600">Nome Completo</label>
                    <p className="text-black font-semibold">{selectedLead.fullName}</p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-600">Email</label>
                    <p className="text-black">{selectedLead.email}</p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-600">Telefono</label>
                    {/* Phone visibility controlled by backend - respect empty string as "hidden" */}
                    {selectedLead.phone_display !== undefined && selectedLead.phone_display !== null ? (
                      selectedLead.phone_display ? (
                        <a 
                          href={formatPhoneForCall(selectedLead.phone_real || selectedLead.phone)} 
                          className="text-blue-600 hover:text-blue-800 underline font-semibold block"
                          title="Click to call"
                        >
                          {selectedLead.phone_display}
                        </a>
                      ) : (
                        <span className="text-gray-400 italic block">Nascosto</span>
                      )
                    ) : (
                      <a 
                        href={formatPhoneForCall(selectedLead.phone)} 
                        className="text-blue-600 hover:text-blue-800 underline font-semibold block"
                      >
                        {formatPhoneDisplay(selectedLead.phone)}
                      </a>
                    )}
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-600">Importo Perso</label>
                    <p className="text-black font-semibold">{selectedLead.amountLost}</p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-600">Azienda Truffatrice</label>
                    <p className="text-black">{selectedLead.scammerCompany}</p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-600">Data Creazione</label>
                    <p className="text-black">{formatCreatedDate(selectedLead.created_at)}</p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-600">Stato</label>
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(selectedLead.status)}`}>
                      {selectedLead.status}
                    </span>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-600">Priorità</label>
                    <p className={`font-semibold ${getPriorityColor(selectedLead.priority)}`}>{selectedLead.priority}</p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-600">Team</label>
                    <p className="text-black">{selectedLead.team_id ? teams.find(t => t.id === selectedLead.team_id)?.name || 'N/A' : 'Nessun team'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-600">Assegnato a</label>
                    <p className="text-black">{selectedLead.assigned_to ? users.find(u => u.id === selectedLead.assigned_to)?.full_name || 'N/A' : 'Non assegnato'}</p>
                  </div>
                </div>
                <div className="mt-4">
                  <label className="text-sm font-semibold text-gray-600">Dettagli Caso</label>
                  <p className="text-black mt-2 p-4 bg-gray-50 border border-gray-200 whitespace-pre-wrap">{selectedLead.caseDetails}</p>
                </div>
              </div>

              {/* Quick Status Update Section */}
              <div>
                <h3 className="text-lg font-bold text-black mb-4 border-b-2 border-[#D4AF37] pb-2">Aggiorna Stato</h3>
                <div className="bg-gray-50 border-2 border-gray-200 p-4 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-black mb-2">Stato</label>
                      <Select value={editData.status || selectedLead.status} onValueChange={(value) => setEditData({ ...editData, status: value })}>
                        <SelectTrigger className="bg-white border-gray-300 rounded-none">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-white">
                          {statuses.map(status => (
                            <SelectItem key={status.id} value={status.name}>{status.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-black mb-2">Priorità</label>
                      <Select value={editData.priority || selectedLead.priority} onValueChange={(value) => setEditData({ ...editData, priority: value })}>
                        <SelectTrigger className="bg-white border-gray-300 rounded-none">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-white">
                          <SelectItem value="low">Bassa</SelectItem>
                          <SelectItem value="medium">Media</SelectItem>
                          <SelectItem value="high">Alta</SelectItem>
                          <SelectItem value="urgent">Urgente</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  {((editData.status || selectedLead.status) === 'Callback' || 
                    (editData.status || selectedLead.status) === 'Potential Callback' || 
                    (editData.status || selectedLead.status) === 'Pharos in progress' ||
                    (editData.status || selectedLead.status)?.startsWith('Deposit')) && (
                    <>
                      <div className="bg-yellow-50 border-2 border-yellow-400 p-3">
                        <p className="text-sm font-semibold text-black mb-1">⚠️ Callback/Deposit richiesto</p>
                        <p className="text-xs text-gray-700">Imposta data e ora. Riceverai notifica 1 minuto prima.</p>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-black mb-2">Data e Ora *</label>
                        <Input
                          type="datetime-local"
                          value={editData.callback_date || ''}
                          onChange={(e) => setEditData({ ...editData, callback_date: e.target.value })}
                          className="bg-white border-gray-300 rounded-none"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-black mb-2">Note (Opzionale)</label>
                        <Textarea
                          value={editData.callback_notes || ''}
                          onChange={(e) => setEditData({ ...editData, callback_notes: e.target.value })}
                          placeholder="Aggiungi note..."
                          className="bg-white border-gray-300 rounded-none"
                          rows={2}
                        />
                      </div>
                    </>
                  )}
                  
                  <Button onClick={handleSaveEdit} className="bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none font-semibold">
                    Salva Modifiche
                  </Button>
                </div>
              </div>

              {/* Comments Section */}
              <div>
                <h3 className="text-lg font-bold text-black mb-4 border-b-2 border-[#D4AF37] pb-2 flex items-center gap-2">
                  <MessageSquare className="w-5 h-5" />
                  Commenti e Note
                </h3>
                
                {/* Add New Comment */}
                <div className="bg-gray-50 border-2 border-gray-200 p-4 mb-4">
                  <label className="block text-sm font-semibold text-black mb-2">Aggiungi Nota</label>
                  <Textarea
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Scrivi una nota o commento su questo lead..."
                    rows={3}
                    className="bg-white border-gray-300 rounded-none mb-3"
                  />
                  <Button onClick={handleAddNote} className="bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none">
                    <Plus className="w-4 h-4 mr-2" />
                    Aggiungi Nota
                  </Button>
                </div>

                {/* Notes List */}
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {leadNotes.length === 0 ? (
                    <p className="text-center text-gray-600 py-4">Nessuna nota ancora</p>
                  ) : (
                    leadNotes.map((note) => (
                      <div key={note.id} className="bg-white border border-gray-200 p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="font-semibold text-black">{note.user_name}</p>
                            <p className="text-xs text-gray-600">{new Date(note.created_at).toLocaleString('it-IT')}</p>
                          </div>
                          {note.is_internal && (
                            <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">Interno</span>
                          )}
                        </div>
                        <p className="text-gray-700 whitespace-pre-wrap">{note.note}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Mass Update Modal */}
      {showMassUpdateModal && (
        <Dialog open={showMassUpdateModal} onOpenChange={setShowMassUpdateModal}>
          <DialogContent className="max-w-lg bg-white">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-black">Mass Update</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-gray-700">Aggiorna {selectedLeadIds.length} lead selezionati:</p>
              
              <div>
                <label className="block text-sm font-semibold text-black mb-2">Stato (opzionale)</label>
                <Select value={massUpdateData.status || "_none"} onValueChange={(value) => setMassUpdateData({ ...massUpdateData, status: value === "_none" ? "" : value })}>
                  <SelectTrigger className="bg-white border-gray-300 rounded-none">
                    <SelectValue placeholder="Nessun cambio" />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    <SelectItem value="_none">Nessun cambio</SelectItem>
                    {statuses.map(status => (
                      <SelectItem key={status.id} value={status.name}>{status.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-black mb-2">Team (opzionale)</label>
                <Select value={massUpdateData.team_id || "_none"} onValueChange={(value) => setMassUpdateData({ ...massUpdateData, team_id: value === "_none" ? "" : value })}>
                  <SelectTrigger className="bg-white border-gray-300 rounded-none">
                    <SelectValue placeholder="Nessun cambio" />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    <SelectItem value="_none">Nessun cambio</SelectItem>
                    {teams.map(team => (
                      <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-black mb-2">Assegna a Utente (opzionale)</label>
                <Select value={massUpdateData.assigned_to || "_none"} onValueChange={(value) => setMassUpdateData({ ...massUpdateData, assigned_to: value === "_none" ? "" : value })}>
                  <SelectTrigger className="bg-white border-gray-300 rounded-none">
                    <SelectValue placeholder="Nessun cambio" />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    <SelectItem value="_none">Nessun cambio</SelectItem>
                    {users.filter(u => u.is_active).map(user => (
                      <SelectItem key={user.id} value={user.id}>{user.full_name} ({user.role})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button onClick={handleMassUpdate} className="w-full bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none font-semibold">
                Aggiorna Lead
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Modal */}
      {showEditModal && selectedLead && (
        <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
          <DialogContent className="max-w-lg bg-white">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-black">Modifica Lead</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-black mb-2">Stato</label>
                <Select value={editData.status} onValueChange={(value) => setEditData({ ...editData, status: value })}>
                  <SelectTrigger className="bg-white border-gray-300 rounded-none">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    {statuses.map(status => (
                      <SelectItem key={status.id} value={status.name}>{status.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-black mb-2">Priorità</label>
                <Select value={editData.priority} onValueChange={(value) => setEditData({ ...editData, priority: value })}>
                  <SelectTrigger className="bg-white border-gray-300 rounded-none">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    <SelectItem value="low">Bassa</SelectItem>
                    <SelectItem value="medium">Media</SelectItem>
                    <SelectItem value="high">Alta</SelectItem>
                    <SelectItem value="urgent">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(editData.status === 'Callback' || editData.status === 'Potential Callback' || editData.status === 'Pharos in progress') && (
                <>
                  <div className="bg-yellow-50 border-2 border-yellow-400 p-4 mb-4">
                    <p className="text-sm font-semibold text-black mb-2">⚠️ Callback richiesto</p>
                    <p className="text-xs text-gray-700">Devi impostare data e ora per il callback. Riceverai una notifica 1 minuto prima.</p>
                  </div>
                  <div>
                    <SmartDateTimePicker
                      value={editData.callback_date}
                      onChange={(value) => setEditData({ ...editData, callback_date: value })}
                      currentUser={currentUser}
                      currentLeadId={selectedLead?.id}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-black mb-2">Note Callback (Opzionale)</label>
                    <Textarea
                      value={editData.callback_notes}
                      onChange={(e) => setEditData({ ...editData, callback_notes: e.target.value })}
                      placeholder="Aggiungi note sul callback..."
                      className="bg-white border-gray-300 rounded-none"
                      rows={3}
                    />
                  </div>
                </>
              )}
              {(editData.status?.startsWith('Deposit')) && (
                <>
                  <div className="bg-blue-50 border-2 border-blue-400 p-4 mb-4">
                    <p className="text-sm font-semibold text-black mb-2">💰 Deposit - Impostare Data</p>
                    <p className="text-xs text-gray-700">Imposta la data per questo deposito. Riceverai una notifica 1 minuto prima.</p>
                  </div>
                  <div>
                    <SmartDateTimePicker
                      value={editData.callback_date}
                      onChange={(value) => setEditData({ ...editData, callback_date: value })}
                      currentUser={currentUser}
                      currentLeadId={selectedLead?.id}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-black mb-2">Note Deposit (Opzionale)</label>
                    <Textarea
                      value={editData.callback_notes}
                      onChange={(e) => setEditData({ ...editData, callback_notes: e.target.value })}
                      placeholder="Aggiungi note sul deposito..."
                      className="bg-white border-gray-300 rounded-none"
                      rows={3}
                    />
                  </div>
                </>
              )}
              <Button onClick={handleSaveEdit} className="w-full bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none font-semibold">
                Salva Modifiche
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Assign Modal */}
      {showAssignModal && selectedLead && (
        <Dialog open={showAssignModal} onOpenChange={setShowAssignModal}>
          <DialogContent className="max-w-md bg-white">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-black">Assegna Lead</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-gray-700">Assegna questo lead a un agente:</p>
              <div className="space-y-2">
                {users.filter(u => u.is_active).map(user => (
                  <Button
                    key={user.id}
                    onClick={() => handleAssignLead(user.id)}
                    className="w-full bg-gray-100 text-black hover:bg-[#D4AF37] hover:text-black rounded-none justify-start"
                  >
                    {user.full_name} - {user.role}
                  </Button>
                ))}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Create Lead Modal */}
      {showCreateModal && (
        <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
          <DialogContent className="max-w-2xl bg-white">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-black">Crea Nuovo Lead</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-black mb-2">Nome Completo *</label>
                  <Input
                    value={newLead.fullName}
                    onChange={(e) => setNewLead({ ...newLead, fullName: e.target.value })}
                    placeholder="Mario Rossi"
                    className="bg-white border-gray-300 rounded-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-black mb-2">Email *</label>
                  <Input
                    type="email"
                    value={newLead.email}
                    onChange={(e) => setNewLead({ ...newLead, email: e.target.value })}
                    placeholder="mario@esempio.it"
                    className="bg-white border-gray-300 rounded-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-black mb-2">Telefono *</label>
                  <Input
                    value={newLead.phone}
                    onChange={(e) => setNewLead({ ...newLead, phone: e.target.value })}
                    placeholder="3XX XXX XXXX"
                    className="bg-white border-gray-300 rounded-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-black mb-2">Azienda Truffatrice *</label>
                  <Input
                    value={newLead.scammerCompany}
                    onChange={(e) => setNewLead({ ...newLead, scammerCompany: e.target.value })}
                    placeholder="Es. FakeInvest Ltd"
                    className="bg-white border-gray-300 rounded-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-black mb-2">Importo Perso *</label>
                <Select 
                  value={newLead.amountLost || undefined} 
                  onValueChange={(value) => setNewLead({ ...newLead, amountLost: value })}
                >
                  <SelectTrigger className="bg-white border-gray-300 rounded-none">
                    <SelectValue placeholder="Seleziona importo" />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    <SelectItem value="500-5000">€500 - €5.000</SelectItem>
                    <SelectItem value="5000-50000">€5.000 - €50.000</SelectItem>
                    <SelectItem value="50000-500000">€50.000 - €500.000</SelectItem>
                    <SelectItem value="500000+">€500.000+</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-black mb-2">Dettagli Caso *</label>
                <Textarea
                  value={newLead.caseDetails}
                  onChange={(e) => setNewLead({ ...newLead, caseDetails: e.target.value })}
                  placeholder="Descrivi i dettagli della truffa..."
                  rows={5}
                  className="bg-white border-gray-300 rounded-none"
                />
              </div>
              <Button onClick={handleCreateLead} className="w-full bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none font-semibold">
                Crea Lead
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Inline Callback Date Modal */}
      {inlineEditLeadId && (
        <Dialog open={!!inlineEditLeadId} onOpenChange={() => setInlineEditLeadId(null)}>
          <DialogContent className="max-w-md bg-white">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-black">Imposta Callback/Deposit</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-yellow-50 border-2 border-yellow-400 p-3">
                <p className="text-sm font-semibold text-black mb-1">⚠️ Callback richiesto</p>
                <p className="text-xs text-gray-700">Stato selezionato: <strong>{inlineStatusData.status}</strong></p>
              </div>
              <div>
                <SmartDateTimePicker
                  value={inlineStatusData.callback_date}
                  onChange={(value) => setInlineStatusData({ ...inlineStatusData, callback_date: value })}
                  currentUser={currentUser}
                  currentLeadId={selectedLead?.id}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-black mb-2">Note (Opzionale)</label>
                <Textarea
                  value={inlineStatusData.callback_notes}
                  onChange={(e) => setInlineStatusData({ ...inlineStatusData, callback_notes: e.target.value })}
                  placeholder="Aggiungi note..."
                  className="bg-white border-gray-300 rounded-none"
                  rows={3}
                />
              </div>
              <div className="flex gap-3">
                <Button onClick={handleSaveInlineCallback} className="flex-1 bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none font-semibold">
                  Salva
                </Button>
                <Button onClick={() => setInlineEditLeadId(null)} className="flex-1 bg-gray-300 text-black hover:bg-gray-400 rounded-none">
                  Annulla
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Import CSV Modal */}
      {showImportModal && (
        <Dialog open={showImportModal} onOpenChange={setShowImportModal}>
          <DialogContent className="max-w-3xl bg-white">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-black">Importa Lead da CSV</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-yellow-50 border-2 border-yellow-200 p-4">
                <h4 className="font-bold text-black mb-2">Formato CSV Richiesto:</h4>
                <p className="text-sm text-gray-700 mb-3">Il file CSV deve avere queste colonne nell'ordine esatto:</p>
                <div className="bg-white p-3 border border-gray-300 font-mono text-xs overflow-x-auto">
                  <div className="font-bold mb-1">Nome,Email,Telefono,Azienda Truffatrice,Importo Perso,Dettagli Caso</div>
                  <div className="text-gray-600">Mario Rossi,mario@email.com,3201234567,FakeInvest Ltd,€5.000 - €50.000,Descrizione della truffa...</div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-black mb-2">Seleziona File CSV</label>
                <Input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setCsvFile(e.target.files[0])}
                  className="bg-white border-gray-300 rounded-none"
                />
              </div>

              <div className="flex gap-3">
                <Button onClick={handleImportCSV} disabled={!csvFile} className="flex-1 bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none font-semibold">
                  <Upload className="w-4 h-4 mr-2" />
                  Importa Lead
                </Button>
                <Button onClick={() => setShowImportModal(false)} className="flex-1 bg-gray-300 text-black hover:bg-gray-400 rounded-none">
                  Annulla
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Lead Confirmation Modal */}
      {showDeleteModal && leadToDelete && (
        <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
          <DialogContent className="max-w-md bg-white">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-red-600 flex items-center gap-2">
                <AlertTriangle className="w-6 h-6" />
                Conferma Eliminazione
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-gray-700">
                Sei sicuro di voler eliminare il lead <strong>{leadToDelete.fullName}</strong>?
              </p>
              <div className="bg-red-50 border border-red-200 p-3 rounded">
                <p className="text-sm text-red-700">
                  <strong>⚠️ Attenzione:</strong> Questa azione è irreversibile. 
                  Tutte le note e l'attività del lead verranno eliminate.
                </p>
              </div>
              <div className="flex gap-3 pt-4">
                <Button
                  onClick={() => setShowDeleteModal(false)}
                  className="flex-1 bg-gray-200 text-black hover:bg-gray-300 rounded-none"
                >
                  Annulla
                </Button>
                <Button
                  onClick={handleConfirmDelete}
                  className="flex-1 bg-red-600 text-white hover:bg-red-700 rounded-none"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Elimina Lead
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default LeadsTable;
