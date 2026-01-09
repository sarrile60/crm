import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Eye, Edit, UserPlus, Filter, Search, Upload, Download, Plus, MessageSquare, ChevronLeft, ChevronRight, Trash2, AlertTriangle, Phone, Loader2, MoreVertical } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Textarea } from '../ui/textarea';
import { Checkbox } from '../ui/checkbox';
import { Badge } from '../ui/badge';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { DataTable } from '../ui/data-table';
import axios from 'axios';
import SmartDateTimePicker from './SmartDateTimePicker';
import i18n from '../../i18n/i18n';
import * as XLSX from 'xlsx';
import { cn } from '@/lib/utils';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const LeadsTable = ({ currentUser, urgentCallbackLead, onClearCallbackLead }) => {
  const { t } = useTranslation();
  
  // Data state
  const [leads, setLeads] = useState([]);
  const [total, setTotal] = useState(0);
  const [users, setUsers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Pagination state
  const [pagination, setPagination] = useState({
    limit: 200,
    offset: 0
  });
  
  // Filter state with debouncing
  const [filters, setFilters] = useState({
    status: '',
    priority: '',
    search: '',
    assignedTo: '',
    teamId: ''
  });
  
  const [debouncedSearch, setDebouncedSearch] = useState('');
  
  // Modal states
  const [selectedLead, setSelectedLead] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showMassUpdateModal, setShowMassUpdateModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [inlineEditLeadId, setInlineEditLeadId] = useState(null);
  
  // Form data
  const [editData, setEditData] = useState({});
  const [massUpdateData, setMassUpdateData] = useState({ status: '', team_id: '', assigned_to: '' });
  const [newLead, setNewLead] = useState({
    fullName: '',
    email: '',
    phone: '',
    scammerCompany: '',
    amountLost: '',
    caseDetails: ''
  });
  const [inlineStatusData, setInlineStatusData] = useState({ status: '', callback_date: '', callback_notes: '' });
  const [leadToDelete, setLeadToDelete] = useState(null);
  const [csvFile, setCsvFile] = useState(null);
  const [leadNotes, setLeadNotes] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [currentLeadIndex, setCurrentLeadIndex] = useState(0);
  
  // Selection state
  const [selectedLeadIds, setSelectedLeadIds] = useState([]);
  
  // Call state
  const [isCallingLead, setIsCallingLead] = useState(false);
  
  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(filters.search);
    }, 300);
    return () => clearTimeout(timer);
  }, [filters.search]);
  
  // Fetch data when filters or pagination changes
  useEffect(() => {
    fetchData();
  }, [debouncedSearch, filters.status, filters.priority, filters.assignedTo, filters.teamId, pagination]);
  
  // Handle urgent callback lead
  useEffect(() => {
    if (urgentCallbackLead) {
      handleViewDetails(urgentCallbackLead);
      if (onClearCallbackLead) {
        onClearCallbackLead();
      }
    }
  }, [urgentCallbackLead]);
  
  const fetchData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };
      
      // Build query params
      const queryParams = {
        limit: pagination.limit,
        offset: pagination.offset,
        sort: 'created_at',
        order: 'desc'
      };
      
      if (filters.status) queryParams.status = filters.status;
      if (filters.priority) queryParams.priority = filters.priority;
      if (debouncedSearch) queryParams.search = debouncedSearch;
      if (filters.assignedTo) queryParams.assigned_to = filters.assignedTo;
      if (filters.teamId) queryParams.team_id = filters.teamId;
      
      const [leadsRes, usersRes, statusesRes, teamsRes] = await Promise.all([
        axios.get(`${API}/crm/leads`, { headers, params: queryParams }),
        axios.get(`${API}/crm/users`, { headers }),
        axios.get(`${API}/crm/statuses`, { headers }),
        axios.get(`${API}/crm/teams`, { headers })
      ]);
      
      // Handle response - check if data is in correct format
      const leadsData = leadsRes.data;
      if (Array.isArray(leadsData)) {
        // Old format: direct array
        setLeads(leadsData);
        setTotal(leadsData.length);
      } else if (leadsData && Array.isArray(leadsData.data)) {
        // New format: { data, total, limit, offset }
        setLeads(leadsData.data);
        setTotal(leadsData.total || 0);
      } else {
        setLeads([]);
        setTotal(0);
      }
      setUsers(usersRes.data);
      setStatuses(statusesRes.data);
      setTeams(teamsRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error(t('users.errorLoadingData'));
    } finally {
      setLoading(false);
    }
  };
  
  const formatCreatedDate = (dateString) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat(i18n.language, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
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
      low: 'text-muted-foreground',
      medium: 'text-blue-600',
      high: 'text-orange-600',
      urgent: 'text-red-600'
    };
    return colors[priority] || 'text-muted-foreground';
  };
  
  const formatPhoneForCall = (phone) => {
    const cleanPhone = phone.replace(/[^0-9x]/g, '');
    if (cleanPhone.startsWith('39')) {
      return `tel:+${cleanPhone}`;
    }
    return `tel:+39${cleanPhone}`;
  };
  
  const formatPhoneDisplay = (phone) => {
    if (phone.startsWith('+39') || phone.startsWith('39')) {
      return phone.startsWith('+') ? phone : `+${phone}`;
    }
    return `+39 ${phone}`;
  };
  
  // Table columns configuration
  const columns = useMemo(() => [
    {
      header: t('common.date'),
      accessorKey: 'created_at',
      width: '160px',
      cell: (lead) => (
        <span className="text-sm text-muted-foreground">{formatCreatedDate(lead.created_at)}</span>
      )
    },
    {
      header: t('common.name'),
      accessorKey: 'fullName',
      width: '220px',
      cell: (lead) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleViewDetails(lead);
          }}
          className="text-sm font-semibold text-foreground hover:text-primary underline text-left"
        >
          {lead.fullName}
        </button>
      )
    },
    {
      header: t('common.phone'),
      accessorKey: 'phone',
      width: '160px',
      cell: (lead) => {
        if (lead.phone_display !== undefined && lead.phone_display !== null) {
          return lead.phone_display ? (
            <a
              href={formatPhoneForCall(lead.phone_real || lead.phone)}
              className="text-sm text-blue-600 hover:text-blue-800 underline"
              onClick={(e) => e.stopPropagation()}
            >
              {lead.phone_display}
            </a>
          ) : (
            <span className="text-sm text-muted-foreground italic">{t('visibility.hidden')}</span>
          );
        }
        return (
          <a
            href={formatPhoneForCall(lead.phone)}
            className="text-sm text-blue-600 hover:text-blue-800 underline"
            onClick={(e) => e.stopPropagation()}
          >
            {formatPhoneDisplay(lead.phone)}
          </a>
        );
      }
    },
    {
      header: t('common.email'),
      accessorKey: 'email',
      width: '220px',
      cell: (lead) => {
        if (lead.email_display !== undefined && lead.email_display !== null) {
          return lead.email_display ? (
            <span className="text-sm text-foreground">{lead.email_display}</span>
          ) : (
            <span className="text-sm text-muted-foreground italic">{t('visibility.hidden')}</span>
          );
        }
        return <span className="text-sm text-foreground">{lead.email}</span>;
      }
    },
    {
      header: t('common.status'),
      accessorKey: 'status',
      width: '140px',
      cell: (lead) => (
        <Badge className={cn('text-xs', getStatusColor(lead.status))}>
          {lead.status}
        </Badge>
      )
    },
    {
      header: t('leads.priority'),
      accessorKey: 'priority',
      width: '120px',
      cell: (lead) => (
        <span className={cn('text-sm font-semibold', getPriorityColor(lead.priority))}>
          {lead.priority}
        </span>
      )
    },
    {
      header: t('leads.assignedTo'),
      accessorKey: 'assigned_to',
      width: '180px',
      cell: (lead) => {
        const user = users.find(u => u.id === lead.assigned_to);
        return (
          <span className="text-sm text-foreground">
            {user?.full_name || t('crm.notAssigned')}
          </span>
        );
      }
    },
    {
      header: t('users.team'),
      accessorKey: 'team_id',
      width: '140px',
      cell: (lead) => {
        const team = teams.find(t => t.id === lead.team_id);
        return (
          <span className="text-sm text-foreground">
            {team?.name || t('common.noTeam')}
          </span>
        );
      }
    },
    {
      header: t('common.actions'),
      width: '140px',
      cell: (lead) => (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            onClick={() => handleViewDetails(lead)}
            size="sm"
            variant="outline"
            className="h-8 w-8 p-0"
          >
            <Eye className="h-3.5 w-3.5" />
          </Button>
          <Button
            onClick={() => handleEdit(lead)}
            size="sm"
            variant="outline"
            className="h-8 w-8 p-0"
          >
            <Edit className="h-3.5 w-3.5" />
          </Button>
          {(currentUser.role === 'admin' || currentUser.role === 'supervisor') && (
            <Button
              onClick={() => handleDeleteClick(lead)}
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0 text-destructive hover:bg-destructive hover:text-destructive-foreground"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      )
    }
  ], [users, teams, statuses, t, currentUser.role]);
  
  // Handlers
  const handleViewDetails = async (lead) => {
    const index = leads.findIndex(l => l.id === lead.id);
    setCurrentLeadIndex(index >= 0 ? index : 0);
    setSelectedLead(lead);
    setShowDetailModal(true);
    
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
    if (newIndex >= leads.length) newIndex = leads.length - 1;
    
    if (leads[newIndex]) {
      setCurrentLeadIndex(newIndex);
      const nextLead = leads[newIndex];
      setSelectedLead(nextLead);
      
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
  
  const handleEdit = (lead) => {
    setSelectedLead(lead);
    if (currentUser.role === 'admin') {
      setEditData({
        fullName: lead.fullName || '',
        email: lead.email || '',
        phone: lead.phone || '',
        scammerCompany: lead.scammerCompany || '',
        amountLost: lead.amountLost || '',
        caseDetails: lead.caseDetails || '',
        status: lead.status,
        priority: lead.priority,
        callback_date: lead.callback_date || '',
        callback_notes: lead.callback_notes || ''
      });
    } else {
      setEditData({
        status: lead.status,
        priority: lead.priority,
        callback_date: lead.callback_date || '',
        callback_notes: lead.callback_notes || ''
      });
    }
    setShowEditModal(true);
  };
  
  const handleSaveEdit = async () => {
    if (currentUser.role === 'admin') {
      if (!editData.fullName || !editData.email || !editData.phone || !editData.scammerCompany || !editData.amountLost || !editData.caseDetails) {
        toast.error(t('common.fillAllFields'));
        return;
      }
      if (!editData.email.includes('@')) {
        toast.error(t('crm.invalidEmailFormat'));
        return;
      }
    }
    
    const requiresCallback = editData.status === 'Callback' || editData.status === 'Potential Callback' || editData.status === 'Pharos in progress';
    if (requiresCallback && !editData.callback_date) {
      toast.error(t('crm.mustSetDateTimeForStatus'));
      return;
    }
    
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };
      const cleanedData = { ...editData };
      if (!cleanedData.callback_date) delete cleanedData.callback_date;
      if (!cleanedData.callback_notes) delete cleanedData.callback_notes;
      
      await axios.put(`${API}/crm/leads/${selectedLead.id}`, cleanedData, { headers });
      localStorage.removeItem(`callback_alerted_${selectedLead.id}`);
      toast.success(t('leads.leadUpdated'));
      setShowEditModal(false);
      fetchData();
      
      if (showDetailModal) {
        setSelectedLead({ ...selectedLead, ...editData });
      }
    } catch (error) {
      toast.error(t('crm.errorUpdatingLead'));
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
      toast.success(t('leads.leadDeleted'));
      setShowDeleteModal(false);
      setLeadToDelete(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('crm.errorDeletingLead'));
    }
  };
  
  const handleCreateLead = async () => {
    if (!newLead.fullName || !newLead.email || !newLead.phone || !newLead.scammerCompany || !newLead.amountLost || !newLead.caseDetails) {
      toast.error(t('common.fillAllFields'));
      return;
    }
    if (!newLead.email.includes('@')) {
      toast.error(t('crm.invalidEmailFormat'));
      return;
    }
    const phoneDigitsOnly = newLead.phone.replace(/[\s\-\+\(\)]/g, '');
    if (!/^\d+$/.test(phoneDigitsOnly)) {
      toast.error(t('crm.invalidPhoneFormat'));
      return;
    }
    
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };
      await axios.post(`${API}/crm/leads/create`, newLead, { headers });
      toast.success(t('crm.leadCreatedSuccess'));
      setShowCreateModal(false);
      setNewLead({
        fullName: '',
        email: '',
        phone: '',
        scammerCompany: '',
        amountLost: '',
        caseDetails: ''
      });
      setTimeout(() => fetchData(), 500);
    } catch (error) {
      toast.error(error.response?.data?.detail || t('crm.errorCreatingLead'));
    }
  };
  
  const handleExportCSV = () => {
    if (leads.length === 0) {
      toast.error(t('crm.noLeadsToExport'));
      return;
    }
    const csvContent = [
      [t('crm.createdDate'), t('common.name'), t('common.email'), t('common.phone'), t('crm.scammerCompany'), t('crm.amountLost'), t('common.status'), t('leads.priority'), t('crm.caseDetails')],
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
    toast.success(t('crm.leadsExportedSuccess'));
  };
  
  const handleImportCSV = async () => {
    if (!csvFile) {
      toast.error(t('crm.selectCSVFile'));
      return;
    }
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = e.target.result;
        let rows = [];
        
        const arr = new Uint8Array(data);
        const isExcel = arr[0] === 0x50 && arr[1] === 0x4B;
        
        if (isExcel) {
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          rows = jsonData.slice(1);
        } else {
          const text = new TextDecoder('utf-8').decode(data);
          const lines = text.split('\n').slice(1);
          rows = lines.map(line => {
            const cells = line.match(/(".*?"|[^,;]+)(?=\s*[,;]|\s*$)/g) || [];
            return cells.map(cell => cell.replace(/^"|"$/g, '').trim());
          });
        }
        
        const token = localStorage.getItem('crmToken');
        const headers = {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        };
        
        const leads = [];
        for (const row of rows) {
          if (!row || row.length === 0) continue;
          const [fullName, email, phone, scammerCompany, amountLost, caseDetails] = row.map(cell => cell ? String(cell).trim() : '');
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (fullName && email && emailRegex.test(email) && phone) {
            leads.push({
              fullName: fullName.substring(0, 100),
              email: email.toLowerCase().trim(),
              phone: String(phone).replace(/[^\d+\-\s()]/g, ''),
              scammerCompany: (scammerCompany || 'Unknown').substring(0, 100),
              amountLost: (amountLost || 'Unknown').substring(0, 50),
              caseDetails: (caseDetails || 'Imported from CSV').substring(0, 500)
            });
          }
        }
        
        if (leads.length === 0) {
          toast.error(t('crm.noValidLeadsInCSV'));
          return;
        }
        
        toast.info(t('crm.importingLeads', { total: leads.length }));
        const response = await axios.post(`${API}/crm/leads/bulk-import`, { leads }, { headers });
        
        if (response.data.imported > 0) {
          toast.success(t('crm.leadsImportedSuccess', { count: response.data.imported }));
        }
        if (response.data.failed > 0) {
          toast.warning(t('crm.leadsImportFailed', { count: response.data.failed }));
        }
        
        setShowImportModal(false);
        setCsvFile(null);
        fetchData();
      } catch (error) {
        toast.error(error.response?.data?.detail || t('crm.errorImportingCSV'));
      }
    };
    reader.readAsArrayBuffer(csvFile);
  };
  
  const handleMassUpdate = async () => {
    if (selectedLeadIds.length === 0) {
      toast.error(t('crm.noLeadsSelected'));
      return;
    }
    if (!massUpdateData.status && !massUpdateData.team_id && !massUpdateData.assigned_to) {
      toast.error(t('crm.selectAtLeastOneField'));
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
      toast.success(t('crm.leadsUpdatedSuccess', { count: response.data.updated_count }));
      setShowMassUpdateModal(false);
      setSelectedLeadIds([]);
      setMassUpdateData({ status: '', team_id: '', assigned_to: '' });
      fetchData();
    } catch (error) {
      toast.error(t('crm.errorMassUpdate'));
    }
  };
  
  const handleAddNote = async () => {
    if (!newNote.trim()) {
      toast.error(t('crm.noteCannotBeEmpty'));
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
      toast.success(t('crm.noteAddedSuccess'));
      setNewNote('');
      const notesRes = await axios.get(`${API}/crm/leads/${selectedLead.id}/notes`, { headers });
      setLeadNotes(notesRes.data);
    } catch (error) {
      toast.error(t('crm.errorAddingNote'));
    }
  };
  
  const handleMakeCall = async (leadId) => {
    if (isCallingLead) return;
    setIsCallingLead(true);
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      const response = await axios.post(`${API}/crm/make-call`, { lead_id: leadId }, { headers });
      if (response.data.success) {
        toast.success(t('call.initiatedSuccess'));
      } else {
        toast.error(response.data.message || t('call.initiatedError'));
      }
    } catch (error) {
      const errorMessage = error.response?.data?.detail || t('call.systemError');
      toast.error(errorMessage);
    } finally {
      setIsCallingLead(false);
    }
  };
  
  // Pagination controls
  const handlePageChange = (direction) => {
    if (direction === 'next' && pagination.offset + pagination.limit < total) {
      setPagination(prev => ({ ...prev, offset: prev.offset + prev.limit }));
    } else if (direction === 'prev' && pagination.offset > 0) {
      setPagination(prev => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }));
    }
  };
  
  const handlePageSizeChange = (newSize) => {
    setPagination({ limit: parseInt(newSize), offset: 0 });
  };
  
  const canMassUpdate = ['admin', 'supervisor'].includes(currentUser.role);
  const currentPage = Math.floor(pagination.offset / pagination.limit) + 1;
  const totalPages = Math.ceil(total / pagination.limit);
  const startRecord = total === 0 ? 0 : pagination.offset + 1;
  const endRecord = Math.min(pagination.offset + pagination.limit, total);
  
  // Determine if virtualization should be enabled (for page sizes > 100)
  const useVirtualization = pagination.limit > 100;
  
  return (
    <div className="flex flex-col h-full">
      {/* Sticky Toolbar */}
      <div className="sticky top-0 z-20 bg-background border-b pb-4 mb-4">
        {/* Title and Actions Row */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold">{t('leads.title')}</h2>
          <div className="flex gap-2">
            {canMassUpdate && selectedLeadIds.length > 0 && (
              <Button onClick={() => setShowMassUpdateModal(true)} variant="secondary" size="sm">
                <Edit className="w-4 h-4 mr-2" />
                {t('crm.massUpdate')} ({selectedLeadIds.length})
              </Button>
            )}
            <Button onClick={() => setShowCreateModal(true)} size="sm">
              <Plus className="w-4 h-4 mr-2" />
              {t('leads.createLead')}
            </Button>
            {currentUser.role === 'admin' && (
              <>
                <Button onClick={() => setShowImportModal(true)} variant="secondary" size="sm">
                  <Upload className="w-4 h-4 mr-2" />
                  {t('common.import')}
                </Button>
                <Button onClick={handleExportCSV} variant="secondary" size="sm">
                  <Download className="w-4 h-4 mr-2" />
                  {t('common.export')}
                </Button>
              </>
            )}
          </div>
        </div>
        
        {/* Filters Row */}
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="text-sm font-medium mb-1.5 block">{t('common.search')}</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('leads.searchPlaceholder')}
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                className="pl-9"
              />
            </div>
          </div>
          <div className="w-[160px]">
            <label className="text-sm font-medium mb-1.5 block">{t('common.status')}</label>
            <Select value={filters.status || "all"} onValueChange={(value) => setFilters({ ...filters, status: value === "all" ? "" : value })}>
              <SelectTrigger>
                <SelectValue placeholder={t('common.all')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('common.all')}</SelectItem>
                {statuses.map(status => (
                  <SelectItem key={status.id} value={status.name}>{status.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-[140px]">
            <label className="text-sm font-medium mb-1.5 block">{t('leads.priority')}</label>
            <Select value={filters.priority || "all"} onValueChange={(value) => setFilters({ ...filters, priority: value === "all" ? "" : value })}>
              <SelectTrigger>
                <SelectValue placeholder={t('common.all')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('common.all')}</SelectItem>
                <SelectItem value="low">{t('leads.low')}</SelectItem>
                <SelectItem value="medium">{t('leads.medium')}</SelectItem>
                <SelectItem value="high">{t('leads.high')}</SelectItem>
                <SelectItem value="urgent">{t('leads.urgent')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={() => setFilters({ status: '', priority: '', search: '', assignedTo: '', teamId: '' })}
            variant="outline"
            size="sm"
          >
            {t('common.clearFilters')}
          </Button>
        </div>
        
        {/* Pagination Info Row */}
        <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
          <div>
            {t('common.showing')} {startRecord}–{endRecord} / {total}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm">{t('common.rowsPerPage')}:</span>
            <Select value={pagination.limit.toString()} onValueChange={handlePageSizeChange}>
              <SelectTrigger className="h-8 w-[70px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
                <SelectItem value="200">200</SelectItem>
                {currentUser.role === 'admin' && <SelectItem value="500">500</SelectItem>}
              </SelectContent>
            </Select>
            <Button
              onClick={() => handlePageChange('prev')}
              disabled={pagination.offset === 0}
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm min-w-[80px] text-center">
              {t('common.page')} {currentPage} / {totalPages}
            </span>
            <Button
              onClick={() => handlePageChange('next')}
              disabled={pagination.offset + pagination.limit >= total}
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      
      {/* Data Table */}
      <div className="flex-1 overflow-hidden">
        <DataTable
          columns={columns}
          data={leads}
          loading={loading}
          onRowClick={handleViewDetails}
          selectable={canMassUpdate}
          selectedIds={selectedLeadIds}
          onSelectionChange={setSelectedLeadIds}
          virtualized={useVirtualization}
          rowHeight={44}
          containerHeight={500}
          emptyMessage={t('leads.noLeadsFound')}
        />
      </div>
      
      {/* All Modals - keeping existing modal implementations */}
      {/* Detail Modal */}
      {showDetailModal && selectedLead && (
        <DetailModal
          lead={selectedLead}
          users={users}
          teams={teams}
          statuses={statuses}
          leadNotes={leadNotes}
          newNote={newNote}
          setNewNote={setNewNote}
          currentLeadIndex={currentLeadIndex}
          totalLeads={leads.length}
          onClose={() => setShowDetailModal(false)}
          onNavigate={navigateLead}
          onAddNote={handleAddNote}
          onMakeCall={handleMakeCall}
          isCallingLead={isCallingLead}
          editData={editData}
          setEditData={setEditData}
          onSaveEdit={handleSaveEdit}
          currentUser={currentUser}
          formatCreatedDate={formatCreatedDate}
          formatPhoneDisplay={formatPhoneDisplay}
          formatPhoneForCall={formatPhoneForCall}
          getStatusColor={getStatusColor}
          getPriorityColor={getPriorityColor}
          t={t}
        />
      )}
      
      {/* Edit Modal - same as before but simplified */}
      {showEditModal && selectedLead && (
        <EditModal
          lead={selectedLead}
          editData={editData}
          setEditData={setEditData}
          statuses={statuses}
          onClose={() => setShowEditModal(false)}
          onSave={handleSaveEdit}
          currentUser={currentUser}
          t={t}
        />
      )}
      
      {/* Create Modal - same as before */}
      {showCreateModal && (
        <CreateModal
          newLead={newLead}
          setNewLead={setNewLead}
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateLead}
          t={t}
        />
      )}
      
      {/* Import Modal - same as before */}
      {showImportModal && (
        <ImportModal
          csvFile={csvFile}
          setCsvFile={setCsvFile}
          onClose={() => setShowImportModal(false)}
          onImport={handleImportCSV}
          t={t}
        />
      )}
      
      {/* Mass Update Modal - same as before */}
      {canMassUpdate && showMassUpdateModal && (
        <MassUpdateModal
          massUpdateData={massUpdateData}
          setMassUpdateData={setMassUpdateData}
          statuses={statuses}
          users={users}
          teams={teams}
          selectedCount={selectedLeadIds.length}
          onClose={() => setShowMassUpdateModal(false)}
          onUpdate={handleMassUpdate}
          t={t}
        />
      )}
      
      {/* Delete Modal */}
      {showDeleteModal && leadToDelete && (
        <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                {t('leads.confirmDelete')}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p>{t('leads.confirmDeleteMessage', { name: leadToDelete.fullName })}</p>
              <div className="bg-destructive/10 border border-destructive/20 p-3 rounded">
                <p className="text-sm text-destructive">
                  <strong>⚠️ {t('common.warning')}:</strong> {t('leads.deleteWarning')}
                </p>
              </div>
              <div className="flex gap-3 pt-4">
                <Button onClick={() => setShowDeleteModal(false)} variant="outline" className="flex-1">
                  {t('common.cancel')}
                </Button>
                <Button onClick={handleConfirmDelete} variant="destructive" className="flex-1">
                  <Trash2 className="w-4 h-4 mr-2" />
                  {t('leads.deleteLead')}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

// Separate modal components to keep code clean
const DetailModal = ({ lead, users, teams, statuses, leadNotes, newNote, setNewNote, currentLeadIndex, totalLeads, onClose, onNavigate, onAddNote, onMakeCall, isCallingLead, editData, setEditData, onSaveEdit, currentUser, formatCreatedDate, formatPhoneDisplay, formatPhoneForCall, getStatusColor, getPriorityColor, t }) => (
  <Dialog open={true} onOpenChange={onClose}>
    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <div className="flex items-center justify-between">
          <DialogTitle>{t('crm.leadDetails')}</DialogTitle>
          <div className="flex gap-2">
            {lead.phone && (
              <Button onClick={() => onMakeCall(lead.id)} disabled={isCallingLead} size="sm" variant="secondary">
                {isCallingLead ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
                <span className="ml-1">{t('call.call')}</span>
              </Button>
            )}
            <Button onClick={() => onNavigate(-1)} disabled={currentLeadIndex === 0} size="sm" variant="outline">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button onClick={() => onNavigate(1)} disabled={currentLeadIndex === totalLeads - 1} size="sm" variant="outline">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </DialogHeader>
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-4 pb-2 border-b">{t('crm.leadInfo')}</h3>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-sm font-medium text-muted-foreground">{t('leads.fullName')}</label><p className="font-semibold">{lead.fullName}</p></div>
            <div><label className="text-sm font-medium text-muted-foreground">{t('common.email')}</label><p>{lead.email}</p></div>
            <div><label className="text-sm font-medium text-muted-foreground">{t('common.phone')}</label><p>{formatPhoneDisplay(lead.phone)}</p></div>
            <div><label className="text-sm font-medium text-muted-foreground">{t('crm.amountLost')}</label><p className="font-semibold">{lead.amountLost}</p></div>
            <div><label className="text-sm font-medium text-muted-foreground">{t('crm.scammerCompany')}</label><p>{lead.scammerCompany}</p></div>
            <div><label className="text-sm font-medium text-muted-foreground">{t('crm.createdDate')}</label><p>{formatCreatedDate(lead.created_at)}</p></div>
            <div><label className="text-sm font-medium text-muted-foreground">{t('common.status')}</label><Badge className={getStatusColor(lead.status)}>{lead.status}</Badge></div>
            <div><label className="text-sm font-medium text-muted-foreground">{t('leads.priority')}</label><p className={getPriorityColor(lead.priority)}>{lead.priority}</p></div>
          </div>
          <div className="mt-4"><label className="text-sm font-medium text-muted-foreground">{t('crm.caseDetails')}</label><p className="mt-2 p-4 bg-muted rounded whitespace-pre-wrap">{lead.caseDetails}</p></div>
        </div>
        <div>
          <h3 className="text-lg font-semibold mb-4 pb-2 border-b">{t('crm.commentsAndNotes')}</h3>
          <div className="bg-muted p-4 mb-4 rounded">
            <label className="text-sm font-medium mb-2 block">{t('crm.addNote')}</label>
            <Textarea value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder={t('crm.writeNoteOrComment')} rows={3} className="mb-3" />
            <Button onClick={onAddNote} size="sm"><Plus className="w-4 h-4 mr-2" />{t('crm.addNote')}</Button>
          </div>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {leadNotes.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">{t('crm.noNotesYet')}</p>
            ) : (
              leadNotes.map((note) => (
                <div key={note.id} className="border p-4 rounded">
                  <div className="flex justify-between mb-2"><span className="font-semibold">{note.user_name}</span><span className="text-sm text-muted-foreground">{formatCreatedDate(note.created_at)}</span></div>
                  <p className="text-sm whitespace-pre-wrap">{note.note}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
);

const EditModal = ({ lead, editData, setEditData, statuses, onClose, onSave, currentUser, t }) => (
  <Dialog open={true} onOpenChange={onClose}>
    <DialogContent className="max-w-2xl">
      <DialogHeader><DialogTitle>{t('leads.editLead')}</DialogTitle></DialogHeader>
      <div className="space-y-4">
        {currentUser.role === 'admin' && (
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-sm font-medium mb-2 block">{t('leads.fullName')} *</label><Input value={editData.fullName} onChange={(e) => setEditData({ ...editData, fullName: e.target.value })} /></div>
            <div><label className="text-sm font-medium mb-2 block">{t('common.email')} *</label><Input type="email" value={editData.email} onChange={(e) => setEditData({ ...editData, email: e.target.value })} /></div>
            <div><label className="text-sm font-medium mb-2 block">{t('common.phone')} *</label><Input value={editData.phone} onChange={(e) => setEditData({ ...editData, phone: e.target.value })} /></div>
            <div><label className="text-sm font-medium mb-2 block">{t('crm.scammerCompany')} *</label><Input value={editData.scammerCompany} onChange={(e) => setEditData({ ...editData, scammerCompany: e.target.value })} /></div>
            <div><label className="text-sm font-medium mb-2 block">{t('crm.amountLost')} *</label><Input value={editData.amountLost} onChange={(e) => setEditData({ ...editData, amountLost: e.target.value })} /></div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <div><label className="text-sm font-medium mb-2 block">{t('common.status')}</label><Select value={editData.status} onValueChange={(value) => setEditData({ ...editData, status: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{statuses.map(status => (<SelectItem key={status.id} value={status.name}>{status.name}</SelectItem>))}</SelectContent></Select></div>
          <div><label className="text-sm font-medium mb-2 block">{t('leads.priority')}</label><Select value={editData.priority} onValueChange={(value) => setEditData({ ...editData, priority: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">{t('leads.low')}</SelectItem><SelectItem value="medium">{t('leads.medium')}</SelectItem><SelectItem value="high">{t('leads.high')}</SelectItem><SelectItem value="urgent">{t('leads.urgent')}</SelectItem></SelectContent></Select></div>
        </div>
        {currentUser.role === 'admin' && (
          <div><label className="text-sm font-medium mb-2 block">{t('crm.caseDetails')} *</label><Textarea value={editData.caseDetails} onChange={(e) => setEditData({ ...editData, caseDetails: e.target.value })} rows={5} /></div>
        )}
        <Button onClick={onSave} className="w-full">{t('common.saveChanges')}</Button>
      </div>
    </DialogContent>
  </Dialog>
);

const CreateModal = ({ newLead, setNewLead, onClose, onCreate, t }) => (
  <Dialog open={true} onOpenChange={onClose}>
    <DialogContent className="max-w-2xl">
      <DialogHeader><DialogTitle>{t('leads.createLead')}</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div><label className="text-sm font-medium mb-2 block">{t('leads.fullName')} *</label><Input value={newLead.fullName} onChange={(e) => setNewLead({ ...newLead, fullName: e.target.value })} placeholder="Mario Rossi" /></div>
          <div><label className="text-sm font-medium mb-2 block">{t('common.email')} *</label><Input type="email" value={newLead.email} onChange={(e) => setNewLead({ ...newLead, email: e.target.value })} placeholder="mario@esempio.it" /></div>
          <div><label className="text-sm font-medium mb-2 block">{t('common.phone')} *</label><Input value={newLead.phone} onChange={(e) => setNewLead({ ...newLead, phone: e.target.value })} placeholder="3XX XXX XXXX" /></div>
          <div><label className="text-sm font-medium mb-2 block">{t('crm.scammerCompany')} *</label><Input value={newLead.scammerCompany} onChange={(e) => setNewLead({ ...newLead, scammerCompany: e.target.value })} placeholder="Es. FakeInvest Ltd" /></div>
        </div>
        <div><label className="text-sm font-medium mb-2 block">{t('crm.amountLost')} *</label><Select value={newLead.amountLost || undefined} onValueChange={(value) => setNewLead({ ...newLead, amountLost: value })}><SelectTrigger><SelectValue placeholder={t('crm.selectAmount')} /></SelectTrigger><SelectContent><SelectItem value="500-5000">€500 - €5.000</SelectItem><SelectItem value="5000-50000">€5.000 - €50.000</SelectItem><SelectItem value="50000-500000">€50.000 - €500.000</SelectItem><SelectItem value="500000+">€500.000+</SelectItem></SelectContent></Select></div>
        <div><label className="text-sm font-medium mb-2 block">{t('crm.caseDetails')} *</label><Textarea value={newLead.caseDetails} onChange={(e) => setNewLead({ ...newLead, caseDetails: e.target.value })} placeholder={t('crm.describeFraud')} rows={5} /></div>
        <Button onClick={onCreate} className="w-full">{t('leads.createLead')}</Button>
      </div>
    </DialogContent>
  </Dialog>
);

const ImportModal = ({ csvFile, setCsvFile, onClose, onImport, t }) => (
  <Dialog open={true} onOpenChange={onClose}>
    <DialogContent className="max-w-3xl">
      <DialogHeader><DialogTitle>{t('crm.importFromCSV')}</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <div className="bg-muted border p-4 rounded">
          <h4 className="font-semibold mb-2">{t('crm.requiredCSVFormat')}</h4>
          <p className="text-sm text-muted-foreground mb-3">{t('crm.csvMustHaveColumns')}</p>
          <div className="bg-background p-3 border rounded font-mono text-xs overflow-x-auto">
            <div className="font-bold mb-1">{t('common.name')},{t('common.email')},{t('common.phone')},{t('crm.scammerCompany')},{t('crm.amountLost')},{t('crm.caseDetails')}</div>
            <div className="text-muted-foreground">Mario Rossi,mario@email.com,3201234567,FakeInvest Ltd,€5.000 - €50.000,{t('crm.fraudDescription')}...</div>
          </div>
        </div>
        <div><label className="text-sm font-medium mb-2 block">{t('crm.selectCSVFileLabel')}</label><Input type="file" accept=".csv,.xlsx" onChange={(e) => setCsvFile(e.target.files[0])} /></div>
        <div className="flex gap-3"><Button onClick={onImport} disabled={!csvFile} className="flex-1"><Upload className="w-4 h-4 mr-2" />{t('crm.importLeads')}</Button><Button onClick={onClose} variant="outline" className="flex-1">{t('common.cancel')}</Button></div>
      </div>
    </DialogContent>
  </Dialog>
);

const MassUpdateModal = ({ massUpdateData, setMassUpdateData, statuses, users, teams, selectedCount, onClose, onUpdate, t }) => (
  <Dialog open={true} onOpenChange={onClose}>
    <DialogContent>
      <DialogHeader><DialogTitle>{t('crm.massUpdate')} ({selectedCount} {t('leads.leads')})</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <div><label className="text-sm font-medium mb-2 block">{t('common.status')}</label><Select value={massUpdateData.status || ""} onValueChange={(value) => setMassUpdateData({ ...massUpdateData, status: value })}><SelectTrigger><SelectValue placeholder={t('common.noChange')} /></SelectTrigger><SelectContent>{statuses.map(status => (<SelectItem key={status.id} value={status.name}>{status.name}</SelectItem>))}</SelectContent></Select></div>
        <div><label className="text-sm font-medium mb-2 block">{t('leads.assignedTo')}</label><Select value={massUpdateData.assigned_to || ""} onValueChange={(value) => setMassUpdateData({ ...massUpdateData, assigned_to: value })}><SelectTrigger><SelectValue placeholder={t('common.noChange')} /></SelectTrigger><SelectContent>{users.map(user => (<SelectItem key={user.id} value={user.id}>{user.full_name}</SelectItem>))}</SelectContent></Select></div>
        <div><label className="text-sm font-medium mb-2 block">{t('users.team')}</label><Select value={massUpdateData.team_id || ""} onValueChange={(value) => setMassUpdateData({ ...massUpdateData, team_id: value })}><SelectTrigger><SelectValue placeholder={t('common.noChange')} /></SelectTrigger><SelectContent>{teams.map(team => (<SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>))}</SelectContent></Select></div>
        <div className="flex gap-3 pt-4"><Button onClick={onUpdate} className="flex-1">{t('common.update')}</Button><Button onClick={onClose} variant="outline" className="flex-1">{t('common.cancel')}</Button></div>
      </div>
    </DialogContent>
  </Dialog>
);

export default LeadsTable;