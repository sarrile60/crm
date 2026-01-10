import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Eye, Edit, UserPlus, Filter, Search, Upload, Download, Plus, MessageSquare, ChevronLeft, ChevronRight, CheckSquare, Square, Trash2, AlertTriangle, Phone, Loader2 } from 'lucide-react';
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
import i18n from '../../i18n/i18n';
import * as XLSX from 'xlsx';
import PerformanceMonitor from '../../utils/performance';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Memoized LeadRow component to prevent unnecessary re-renders
const LeadRow = React.memo(({ 
  lead, 
  isSelected,
  canMassUpdate, 
  onToggleSelection, 
  onViewDetails, 
  onEdit, 
  onAssign, 
  onDelete,
  onStatusChange,
  formatCreatedDate, 
  formatPhoneDisplay, 
  formatPhoneForCall, 
  getStatusColor, 
  users,
  teams,
  statuses,
  currentUserRole,
  t 
}) => {
  const handleCheckboxClick = useCallback(() => {
    onToggleSelection(lead.id);
  }, [lead.id, onToggleSelection]);

  return (
    <tr className="border-t border-gray-200 hover:bg-gray-50">
      {canMassUpdate && (
        <td className="p-3">
          <button onClick={handleCheckboxClick} className="text-gray-700 hover:text-[#D4AF37]">
            {isSelected ? (
              <CheckSquare className="w-5 h-5" />
            ) : (
              <Square className="w-5 h-5" />
            )}
          </button>
        </td>
      )}
      <td className="p-3 text-gray-700 text-sm overflow-hidden text-ellipsis whitespace-nowrap">
        {formatCreatedDate(lead.created_at)}
      </td>
      <td className="p-3 overflow-hidden text-ellipsis whitespace-nowrap">
        <button
          onClick={() => onViewDetails(lead)}
          className="text-black font-semibold hover:text-[#D4AF37] underline text-sm"
        >
          {lead.fullName}
        </button>
      </td>
      <td className="p-3 overflow-hidden text-ellipsis whitespace-nowrap">
        {lead.phone_display !== undefined && lead.phone_display !== null ? (
          lead.phone_display ? (
            <span className="text-gray-700 font-mono text-sm">
              {lead.phone_display}
            </span>
          ) : (
            <span className="text-gray-400 italic text-sm">{t('visibility.hidden')}</span>
          )
        ) : (
          <span className="text-gray-700 font-mono text-sm">
            {formatPhoneDisplay(lead.phone)}
          </span>
        )}
      </td>
      <td className="p-3 text-gray-700 text-sm overflow-hidden text-ellipsis whitespace-nowrap">
        {lead.email_display !== undefined && lead.email_display !== null ? (
          lead.email_display || <span className="text-gray-400 italic">{t('visibility.hidden')}</span>
        ) : (
          lead.email
        )}
      </td>
      <td className="p-3 text-gray-700 text-sm overflow-hidden text-ellipsis whitespace-nowrap">{lead.amountLost}</td>
      <td className="p-3">
        <Select value={lead.status || undefined} onValueChange={(value) => onStatusChange(lead.id, value)}>
          <SelectTrigger className="w-full bg-white border-gray-300 rounded-none h-8 text-sm">
            <SelectValue placeholder={t('leads.selectStatus')}>
              {lead.status && (
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${getStatusColor(lead.status)}`}>
                  {lead.status}
                </span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="bg-white">
            {statuses.map(status => (
              <SelectItem key={status.id} value={status.name}>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${getStatusColor(status.name)}`}>
                  {status.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className="p-3 text-gray-700 text-sm overflow-hidden text-ellipsis whitespace-nowrap">
        {lead.team_id ? teams.find(t => t.id === lead.team_id)?.name || 'N/A' : t('common.noTeam')}
      </td>
      <td className="p-3 text-gray-700 text-sm overflow-hidden text-ellipsis whitespace-nowrap">
        {lead.assigned_to ? users.find(u => u.id === lead.assigned_to)?.full_name || 'N/A' : t('crm.notAssigned')}
      </td>
      <td className="p-3">
        <div className="flex gap-1">
          <Button
            onClick={() => onViewDetails(lead)}
            size="sm"
            className="bg-blue-600 text-white hover:bg-blue-700 rounded-none h-8 w-8 p-0"
          >
            <Eye className="w-3.5 h-3.5" />
          </Button>
          <Button
            onClick={() => onEdit(lead)}
            size="sm"
            className="bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none h-8 w-8 p-0"
          >
            <Edit className="w-3.5 h-3.5" />
          </Button>
          {(currentUserRole === 'admin' || currentUserRole === 'supervisor') && (
            <>
              <Button
                onClick={() => onAssign(lead)}
                size="sm"
                className="bg-green-600 text-white hover:bg-green-700 rounded-none h-8 w-8 p-0"
              >
                <UserPlus className="w-3.5 h-3.5" />
              </Button>
              <Button
                onClick={() => onDelete(lead)}
                size="sm"
                className="bg-red-600 text-white hover:bg-red-700 rounded-none h-8 w-8 p-0"
                title={t('leads.deleteLead')}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
});

const LeadsTable = ({ currentUser, urgentCallbackLead, onClearCallbackLead }) => {
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
  
  // Pagination state
  const [totalLeads, setTotalLeads] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);

  // Handle urgent callback lead - only trigger once, then clear
  useEffect(() => {
    if (urgentCallbackLead) {
      handleViewDetails(urgentCallbackLead);
      // Clear the callback lead after opening so it doesn't re-trigger
      if (onClearCallbackLead) {
        onClearCallbackLead();
      }
    }
  }, [urgentCallbackLead]);
  
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [filters, setFilters] = useState({
    status: '',
    search: ''
  });
  const [searchInput, setSearchInput] = useState(''); // Separate state for input
  const searchRef = React.useRef(''); // Track actual search to avoid unnecessary updates
  
  // Debounce search with 300ms delay
  useEffect(() => {
    const timer = setTimeout(() => {
      // Only update if search actually changed
      if (searchRef.current !== searchInput) {
        searchRef.current = searchInput;
        setFilters(prev => ({ ...prev, search: searchInput }));
        setCurrentPage(1); // Reset to first page on search
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);
  const [editData, setEditData] = useState({});
  const [massUpdateData, setMassUpdateData] = useState({
    status: '',
    team_id: '',
    assigned_to: ''
  });
  const [massActionMode, setMassActionMode] = useState('update'); // 'update' or 'delete'
  const [showMassDeleteConfirm, setShowMassDeleteConfirm] = useState(false);
  const [isMassDeleting, setIsMassDeleting] = useState(false);
  const [showSelectAllModal, setShowSelectAllModal] = useState(false);
  const [isSelectingAll, setIsSelectingAll] = useState(false);
  const [allMatchingSelected, setAllMatchingSelected] = useState(false); // true when "all matching" is selected
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
  const [isCallingLead, setIsCallingLead] = useState(false);

  useEffect(() => {
    fetchData();
  }, [filters, currentPage, pageSize]);

  useEffect(() => {
    setFilteredLeads(leads);
  }, [leads]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      // Build query params with pagination
      const offset = (currentPage - 1) * pageSize;
      const queryParams = {
        limit: pageSize,
        offset: offset,
        sort: 'created_at',
        order: 'desc'
      };
      if (filters.status) queryParams.status = filters.status;
      if (filters.search) queryParams.search = filters.search;

      const [leadsRes, usersRes, statusesRes, teamsRes] = await Promise.all([
        axios.get(`${API}/crm/leads`, { headers, params: queryParams }),
        axios.get(`${API}/crm/users`, { headers }),
        axios.get(`${API}/crm/statuses`, { headers }),
        axios.get(`${API}/crm/teams`, { headers })
      ]);

      // Handle both old array format and new paginated format
      const leadsData = Array.isArray(leadsRes.data) ? leadsRes.data : (leadsRes.data.data || []);
      const total = leadsRes.data.total || leadsData.length;
      
      setLeads(leadsData);
      setTotalLeads(total);
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
      
      // Refresh notes
      const notesRes = await axios.get(`${API}/crm/leads/${selectedLead.id}/notes`, { headers });
      setLeadNotes(notesRes.data);
    } catch (error) {
      toast.error(t('crm.errorAddingNote'));
    }
  };

  const handleCreateLead = async () => {
    if (!newLead.fullName || !newLead.email || !newLead.phone || !newLead.scammerCompany || !newLead.amountLost || !newLead.caseDetails) {
      toast.error(t('common.fillAllFields'));
      return;
    }

    // Validate email format - must contain @
    if (!newLead.email.includes('@')) {
      toast.error(t('crm.invalidEmailFormat'));
      return;
    }

    // Validate phone - only digits, spaces, + and - allowed (no letters)
    const phoneDigitsOnly = newLead.phone.replace(/[\s\-\+\(\)]/g, '');
    if (!/^\d+$/.test(phoneDigitsOnly)) {
      toast.error(t('crm.invalidPhoneFormat'));
      return;
    }

    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };
      
      // Use CRM endpoint which auto-assigns to creator's team and user
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
      
      // Wait a bit for database to update, then refresh
      setTimeout(() => {
        fetchData();
      }, 500);
    } catch (error) {
      console.error('Error creating lead:', error);
      toast.error(error.response?.data?.detail || t('crm.errorCreatingLead'));
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

  const handleExportCSV = async () => {
    try {
      toast.info(t('crm.exportingAllLeads'));
      
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      // Build query params with same filters but NO pagination (fetch all)
      const queryParams = {
        limit: 50000, // High limit to get all leads
        offset: 0,
        sort: 'created_at',
        order: 'desc'
      };
      if (filters.status) queryParams.status = filters.status;
      if (filters.search) queryParams.search = filters.search;

      const response = await axios.get(`${API}/crm/leads`, { headers, params: queryParams });
      const allLeads = Array.isArray(response.data) ? response.data : (response.data.data || []);

      if (allLeads.length === 0) {
        toast.error(t('crm.noLeadsToExport'));
        return;
      }

      const csvContent = [
        [t('crm.createdDate'), t('common.name'), t('common.email'), t('common.phone'), t('crm.scammerCompany'), t('crm.amountLost'), t('common.status'), t('crm.caseDetails')],
        ...allLeads.map(lead => [
          formatCreatedDate(lead.created_at),
          lead.fullName || '',
          lead.email || '',
          lead.phone || '',
          lead.scammerCompany || '',
          lead.amountLost || '',
          lead.status || '',
          lead.caseDetails || ''
        ])
      ].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `leads_export_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success(t('crm.leadsExportedSuccess', { count: allLeads.length }));
    } catch (error) {
      console.error('Export error:', error);
      toast.error(t('crm.errorExportingLeads'));
    }
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
        
        // Check if it's an Excel file (starts with PK - ZIP header)
        const arr = new Uint8Array(data);
        const isExcel = arr[0] === 0x50 && arr[1] === 0x4B;
        
        if (isExcel) {
          // Parse Excel file
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          
          // Skip header row
          rows = jsonData.slice(1);
          console.log('Excel rows:', rows.length);
        } else {
          // Parse CSV file
          const text = new TextDecoder('utf-8').decode(data);
          const lines = text.split('\n').slice(1); // Skip header
          rows = lines.map(line => {
            // Handle CSV with potential commas inside quoted fields
            const cells = line.match(/(".*?"|[^,;]+)(?=\s*[,;]|\s*$)/g) || [];
            return cells.map(cell => cell.replace(/^"|"$/g, '').trim());
          });
        }
        
        const token = localStorage.getItem('crmToken');
        const headers = { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        };
        
        // Parse all leads
        const leads = [];
        for (const row of rows) {
          if (!row || row.length === 0) continue;
          
          const [fullName, email, phone, scammerCompany, amountLost, caseDetails] = row.map(cell => 
            cell ? String(cell).trim() : ''
          );
          
          // Validate email format
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
        
        console.log('Valid leads to import:', leads.length);
        
        if (leads.length === 0) {
          toast.error(t('crm.noValidLeadsInCSV'));
          return;
        }
        
        toast.info(t('crm.importingLeads', { total: leads.length }));
        
        // Send bulk import request
        const response = await axios.post(`${API}/crm/leads/bulk-import`, { leads }, { headers });
        
        if (response.data.imported > 0) {
          toast.success(t('crm.leadsImportedSuccess', { count: response.data.imported }));
        }
        if (response.data.failed > 0) {
          toast.warning(t('crm.leadsImportFailed', { count: response.data.failed }));
          console.log('Import errors:', response.data.errors);
        }
        
        setShowImportModal(false);
        setCsvFile(null);
        fetchData();
      } catch (error) {
        console.error('Import error:', error);
        toast.error(error.response?.data?.detail || t('crm.errorImportingCSV'));
      }
    };
    
    // Read as ArrayBuffer to detect file type
    reader.readAsArrayBuffer(csvFile);
  };

  const handleEdit = (lead) => {
    setSelectedLead(lead);
    // For admin, include all editable fields
    if (currentUser.role === 'admin') {
      setEditData({
        fullName: lead.fullName || '',
        email: lead.email || '',
        phone: lead.phone || '',
        scammerCompany: lead.scammerCompany || '',
        amountLost: lead.amountLost || '',
        caseDetails: lead.caseDetails || '',
        status: lead.status,
        callback_date: lead.callback_date || '',
        callback_notes: lead.callback_notes || ''
      });
    } else {
      setEditData({
        status: lead.status,
        callback_date: lead.callback_date || '',
        callback_notes: lead.callback_notes || ''
      });
    }
    setShowEditModal(true);
  };

  const handleAssign = (lead) => {
    setSelectedLead(lead);
    setShowAssignModal(true);
  };

  const handleInlineStatusChange = async (leadId, newStatus) => {
    const requiresCallback = newStatus === 'Callback' || 
                            newStatus === 'Potential Callback' || 
                            newStatus === 'Pharos in progress';
    
    if (requiresCallback) {
      // Open a mini modal for callback date/time
      setInlineEditLeadId(leadId);
      setInlineStatusData({ status: newStatus, callback_date: '', callback_notes: '' });
    } else {
      // Update status directly (including Deposit statuses)
      try {
        const token = localStorage.getItem('crmToken');
        const headers = { Authorization: `Bearer ${token}` };
        await axios.put(`${API}/crm/leads/${leadId}`, { status: newStatus }, { headers });
        toast.success(t('crm.statusUpdated'));
        fetchData();
      } catch (error) {
        toast.error(t('crm.errorUpdatingStatus'));
      }
    }
  };

  const handleSaveInlineCallback = async () => {
    if (!inlineStatusData.callback_date) {
      toast.error(t('crm.mustSetDateTime'));
      return;
    }

    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };
      await axios.put(`${API}/crm/leads/${inlineEditLeadId}`, inlineStatusData, { headers });
      localStorage.removeItem(`callback_alerted_${inlineEditLeadId}`);
      toast.success(t('crm.statusUpdatedWithCallback'));
      setInlineEditLeadId(null);
      setInlineStatusData({ status: '', callback_date: '', callback_notes: '' });
      fetchData();
    } catch (error) {
      toast.error(t('crm.errorUpdating'));
    }
  };

  const handleSaveEdit = async () => {
    // Validate admin-required fields
    if (currentUser.role === 'admin') {
      if (!editData.fullName || !editData.email || !editData.phone || !editData.scammerCompany || !editData.amountLost || !editData.caseDetails) {
        toast.error(t('common.fillAllFields'));
        return;
      }
      // Validate email format
      if (!editData.email.includes('@')) {
        toast.error(t('crm.invalidEmailFormat'));
        return;
      }
    }

    // Validate callback date for callback statuses (NOT for Deposit statuses)
    const requiresCallback = editData.status === 'Callback' || 
                            editData.status === 'Potential Callback' || 
                            editData.status === 'Pharos in progress';
    
    if (requiresCallback && !editData.callback_date) {
      toast.error(t('crm.mustSetDateTimeForStatus'));
      return;
    }

    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      // Clean up empty callback fields to avoid backend validation issues
      const cleanedData = { ...editData };
      if (!cleanedData.callback_date) {
        delete cleanedData.callback_date;
      }
      if (!cleanedData.callback_notes) {
        delete cleanedData.callback_notes;
      }

      await axios.put(`${API}/crm/leads/${selectedLead.id}`, cleanedData, { headers });
      
      // Clear the old alert flag so new callbacks can trigger alerts
      localStorage.removeItem(`callback_alerted_${selectedLead.id}`);
      
      toast.success(t('leads.leadUpdated'));
      setShowEditModal(false);
      fetchData();
      
      // If we're in detail modal, update the selected lead
      if (showDetailModal) {
        setSelectedLead({...selectedLead, ...editData});
      }
    } catch (error) {
      toast.error(t('crm.errorUpdatingLead'));
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
      
      toast.success(t('crm.leadAssignedSuccess'));
      setShowAssignModal(false);
      fetchData();
    } catch (error) {
      toast.error(t('crm.errorAssigningLead'));
    }
  };

  const toggleLeadSelection = useCallback((leadId) => {
    setSelectedLeadIds(prev => 
      prev.includes(leadId) 
        ? prev.filter(id => id !== leadId)
        : [...prev, leadId]
    );
  }, []);

  const toggleSelectAll = useCallback(() => {
    // If all are selected, deselect all
    if (selectedLeadIds.length === filteredLeads.length && !allMatchingSelected) {
      setSelectedLeadIds([]);
      setAllMatchingSelected(false);
    } else if (allMatchingSelected) {
      // If "all matching" was selected, clear everything
      setSelectedLeadIds([]);
      setAllMatchingSelected(false);
    } else {
      // Show modal to choose between current page or all matching
      setShowSelectAllModal(true);
    }
  }, [selectedLeadIds.length, filteredLeads.length, allMatchingSelected]);

  const handleSelectCurrentPage = useCallback(() => {
    setSelectedLeadIds(filteredLeads.map(lead => lead.id));
    setAllMatchingSelected(false);
    setShowSelectAllModal(false);
  }, [filteredLeads]);

  const handleSelectAllMatching = useCallback(async () => {
    setIsSelectingAll(true);
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };
      
      // Build query params with same filters
      const queryParams = {};
      if (filters.status) queryParams.status = filters.status;
      if (filters.search) queryParams.search = filters.search;

      const response = await axios.post(`${API}/crm/leads/select-all`, null, { headers, params: queryParams });
      
      if (response.data.lead_ids) {
        setSelectedLeadIds(response.data.lead_ids);
        setAllMatchingSelected(true);
        toast.success(t('crm.selectedAllMatching', { count: response.data.count }));
      }
    } catch (error) {
      console.error('Error selecting all leads:', error);
      toast.error(t('crm.errorSelectingAll'));
    } finally {
      setIsSelectingAll(false);
      setShowSelectAllModal(false);
    }
  }, [filters, t]);

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
      setMassActionMode('update');
      fetchData();
    } catch (error) {
      toast.error(t('crm.errorMassUpdate'));
    }
  };

  const handleMassDelete = async () => {
    if (selectedLeadIds.length === 0) {
      toast.error(t('crm.noLeadsSelected'));
      return;
    }

    setIsMassDeleting(true);
    
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      const response = await axios.post(`${API}/crm/leads/mass-delete`, {
        lead_ids: selectedLeadIds
      }, { headers });
      
      toast.success(t('crm.leadsDeletedSuccess', { count: response.data.deleted_count }));
      setShowMassUpdateModal(false);
      setShowMassDeleteConfirm(false);
      setSelectedLeadIds([]);
      setMassActionMode('update');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('crm.errorMassDelete'));
    } finally {
      setIsMassDeleting(false);
    }
  };

  // Click-to-Call function - initiates call via FreePBX
  const handleMakeCall = async (leadId) => {
    if (isCallingLead) return; // Prevent double-clicks
    
    setIsCallingLead(true);
    
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { 
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      };

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

  if (loading) {
    return <div className="text-center py-12">{t('leads.loadingLeads')}</div>;
  }

  const canMassUpdate = ['admin', 'supervisor'].includes(currentUser.role);
  
  // Calculate pagination info
  const startRecord = totalLeads === 0 ? 0 : ((currentPage - 1) * pageSize) + 1;
  const endRecord = Math.min(currentPage * pageSize, totalLeads);
  const totalPages = Math.ceil(totalLeads / pageSize);
  
  const handlePageSizeChange = (newSize) => {
    setPageSize(parseInt(newSize));
    setCurrentPage(1); // Reset to first page
  };
  
  const handlePrevPage = () => {
    if (currentPage > 1) setCurrentPage(currentPage - 1);
  };
  
  const handleNextPage = () => {
    if (currentPage < totalPages) setCurrentPage(currentPage + 1);
  };

  return (
    <div className="flex flex-col h-full max-w-[1600px] mx-auto">
      {/* Sticky Toolbar */}
      <div className="sticky top-0 z-20 bg-white pb-4 mb-4">{/* Changed z-10 to z-20 to be above table header */}
        {/* Title and Action Buttons */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-3xl font-bold text-black">{t('leads.title')}</h2>
          <div className="flex gap-3">
          {canMassUpdate && selectedLeadIds.length > 0 && (
            <Button onClick={() => setShowMassUpdateModal(true)} className="bg-purple-600 text-white hover:bg-purple-700 rounded-none">
              <Edit className="w-4 h-4 mr-2" />
              {t('crm.massUpdate')} ({selectedLeadIds.length})
            </Button>
          )}
          <Button onClick={() => setShowCreateModal(true)} className="bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none">
            <Plus className="w-4 h-4 mr-2" />
            {t('leads.createLead')}
          </Button>
          {currentUser.role === 'admin' && (
            <>
              <Button onClick={() => setShowImportModal(true)} className="bg-blue-600 text-white hover:bg-blue-700 rounded-none">
                <Upload className="w-4 h-4 mr-2" />
                {t('common.import')} CSV
              </Button>
              <Button onClick={handleExportCSV} className="bg-green-600 text-white hover:bg-green-700 rounded-none">
                <Download className="w-4 h-4 mr-2" />
                {t('common.export')} CSV
              </Button>
            </>
          )}
        </div>
        </div>

        {/* Pagination Info and Controls */}
        <div className="flex items-center justify-between text-sm mb-4">
          <div className="text-gray-700 font-semibold">
            {t('common.showing')} {startRecord}–{endRecord} / {totalLeads}
          </div>
          <div className="flex items-center gap-3">
            <label className="text-gray-700 font-semibold">{t('common.rowsPerPage')}:</label>
            <Select value={pageSize.toString()} onValueChange={handlePageSizeChange}>
              <SelectTrigger className="w-[80px] h-8 bg-white border-gray-300 rounded-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white">
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
                <SelectItem value="200">200</SelectItem>
                {currentUser.role === 'admin' && <SelectItem value="500">500</SelectItem>}
              </SelectContent>
            </Select>
            <Button 
              onClick={handlePrevPage} 
              disabled={currentPage === 1}
              size="sm"
              className="h-8 bg-gray-800 text-white hover:bg-black rounded-none disabled:opacity-50"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-gray-700 font-semibold min-w-[100px] text-center">
              {t('common.page')} {currentPage} / {totalPages}
            </span>
            <Button 
              onClick={handleNextPage} 
              disabled={currentPage >= totalPages}
              size="sm"
              className="h-8 bg-gray-800 text-white hover:bg-black rounded-none disabled:opacity-50"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-gray-50 border-2 border-gray-200 p-6 mb-6">
        <div className="grid md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-semibold text-black mb-2">{t('common.search')}</label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder={t('leads.searchPlaceholder')}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-10 bg-white border-gray-300 rounded-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-black mb-2">{t('common.status')}</label>
            <Select value={filters.status || "all"} onValueChange={(value) => setFilters({ ...filters, status: value === "all" ? "" : value })}>
              <SelectTrigger className="bg-white border-gray-300 rounded-none">
                <SelectValue placeholder={t('common.all')} />
              </SelectTrigger>
              <SelectContent className="bg-white">
                <SelectItem value="all">{t('common.all')}</SelectItem>
                {statuses.map(status => (
                  <SelectItem key={status.id} value={status.name}>{status.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button onClick={() => { setFilters({ status: '', search: '' }); setSearchInput(''); setCurrentPage(1); }} className="bg-gray-800 text-white hover:bg-black rounded-none w-full">
              {t('common.clearFilters')}
            </Button>
          </div>
        </div>
      </div>

      {/* Leads Table - Desktop View */}
      <div className="hidden md:block bg-white border-2 border-gray-200 overflow-x-auto">
        <table className="w-full table-fixed" style={{ minWidth: '1500px' }}>
          <thead className="bg-black sticky top-0 z-10">
            <tr>
              {canMassUpdate && (
                <th className="text-left text-white p-3 font-semibold w-12">
                  <button onClick={toggleSelectAll} className="text-white hover:text-[#D4AF37]">
                    {selectedLeadIds.length === filteredLeads.length && filteredLeads.length > 0 ? (
                      <CheckSquare className="w-5 h-5" />
                    ) : (
                      <Square className="w-5 h-5" />
                    )}
                  </button>
                </th>
              )}
              <th className="text-left text-white p-3 font-semibold" style={{ width: '140px' }}>{t('common.date')}</th>
              <th className="text-left text-white p-3 font-semibold" style={{ width: '180px' }}>{t('common.name')}</th>
              <th className="text-left text-white p-3 font-semibold" style={{ width: '150px' }}>{t('common.phone')}</th>
              <th className="text-left text-white p-3 font-semibold" style={{ width: '200px' }}>{t('common.email')}</th>
              <th className="text-left text-white p-3 font-semibold" style={{ width: '110px' }}>{t('common.amount')}</th>
              <th className="text-left text-white p-3 font-semibold" style={{ width: '140px' }}>{t('common.status')}</th>
              <th className="text-left text-white p-3 font-semibold" style={{ width: '100px' }}>{t('leads.priority')}</th>
              <th className="text-left text-white p-3 font-semibold" style={{ width: '110px' }}>{t('users.team')}</th>
              <th className="text-left text-white p-3 font-semibold" style={{ width: '130px' }}>{t('leads.assignedTo')}</th>
              <th className="text-left text-white p-3 font-semibold" style={{ width: '180px' }}>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {filteredLeads.length === 0 ? (
              <tr>
                <td colSpan={canMassUpdate ? "11" : "10"} className="text-center p-8 text-gray-600">
                  {t('leads.noLeadsFound')}
                </td>
              </tr>
            ) : (
              filteredLeads.map((lead) => (
                <LeadRow
                  key={lead.id}
                  lead={lead}
                  isSelected={selectedLeadIds.includes(lead.id)}
                  canMassUpdate={canMassUpdate}
                  onToggleSelection={toggleLeadSelection}
                  onViewDetails={handleViewDetails}
                  onEdit={handleEdit}
                  onAssign={handleAssign}
                  onDelete={handleDeleteClick}
                  onStatusChange={handleInlineStatusChange}
                  formatCreatedDate={formatCreatedDate}
                  formatPhoneDisplay={formatPhoneDisplay}
                  formatPhoneForCall={formatPhoneForCall}
                  getStatusColor={getStatusColor}
                  getPriorityColor={getPriorityColor}
                  users={users}
                  teams={teams}
                  statuses={statuses}
                  currentUserRole={currentUser.role}
                  t={t}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {filteredLeads.length === 0 ? (
          <div className="text-center p-8 text-gray-600 bg-white border-2 border-gray-200">
            {t('leads.noLeadsFound')}
          </div>
        ) : (
          filteredLeads.map((lead) => (
            <div key={lead.id} className="bg-white border-2 border-gray-200 p-4 rounded-none">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <button
                    onClick={() => handleViewDetails(lead)}
                    className="text-lg font-bold text-black hover:text-[#D4AF37] underline mb-1 block"
                  >
                    {lead.fullName}
                  </button>
                  <div className="text-sm text-gray-600">{formatCreatedDate(lead.created_at)}</div>
                </div>
                {canMassUpdate && (
                  <button onClick={() => toggleLeadSelection(lead.id)} className="text-gray-700 hover:text-[#D4AF37]">
                    {selectedLeadIds.includes(lead.id) ? (
                      <CheckSquare className="w-5 h-5" />
                    ) : (
                      <Square className="w-5 h-5" />
                    )}
                  </button>
                )}
              </div>
              
              <div className="space-y-2 mb-3">
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-gray-500" />
                  <span className="text-gray-700 text-sm">
                    {formatPhoneDisplay(lead.phone)}
                  </span>
                </div>
                <div className="text-sm text-gray-700">{lead.email}</div>
                <div className="flex gap-2 flex-wrap">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${getStatusColor(lead.status)}`}>
                    {lead.status}
                  </span>
                  <span className={`text-xs font-semibold ${getPriorityColor(lead.priority)}`}>
                    {lead.priority}
                  </span>
                </div>
                <div className="text-sm text-gray-600">
                  {lead.assigned_to ? users.find(u => u.id === lead.assigned_to)?.full_name : t('crm.notAssigned')}
                </div>
              </div>
              
              <div className="flex gap-2 pt-3 border-t border-gray-200">
                <Button onClick={() => handleViewDetails(lead)} size="sm" className="flex-1 bg-blue-600 text-white hover:bg-blue-700 rounded-none">
                  <Eye className="w-4 h-4 mr-1" /> {t('common.view')}
                </Button>
                <Button onClick={() => handleEdit(lead)} size="sm" className="flex-1 bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none">
                  <Edit className="w-4 h-4 mr-1" /> {t('common.edit')}
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Detail Modal with Navigation */}
      {showDetailModal && selectedLead && (
        <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
          <DialogContent className="max-w-4xl bg-white max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <DialogTitle className="text-2xl font-bold text-black">{t('crm.leadDetails')}</DialogTitle>
                <div className="flex gap-2">
                  {/* Click-to-Call Button - Only shown if lead has phone */}
                  {selectedLead.phone && (
                    <Button
                      onClick={() => handleMakeCall(selectedLead.id)}
                      disabled={isCallingLead}
                      size="sm"
                      className="bg-green-600 text-white hover:bg-green-700 rounded-none disabled:opacity-50"
                      title={t('call.clickToCall')}
                    >
                      {isCallingLead ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Phone className="w-4 h-4" />
                      )}
                      <span className="ml-1">{t('call.call')}</span>
                    </Button>
                  )}
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
                <h3 className="text-lg font-bold text-black mb-4 border-b-2 border-[#D4AF37] pb-2">{t('crm.leadInfo')}</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-semibold text-gray-600">{t('leads.fullName')}</label>
                    <p className="text-black font-semibold">{selectedLead.fullName}</p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-600">{t('common.email')}</label>
                    <p className="text-black">{selectedLead.email}</p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-600">{t('common.phone')}</label>
                    {/* Phone visibility controlled by backend - respect empty string as "hidden" */}
                    {selectedLead.phone_display !== undefined && selectedLead.phone_display !== null ? (
                      selectedLead.phone_display ? (
                        <span className="text-gray-700 font-semibold block">
                          {selectedLead.phone_display}
                        </span>
                      ) : (
                        <span className="text-gray-400 italic block">{t('visibility.hidden')}</span>
                      )
                    ) : (
                      <span className="text-gray-700 font-semibold block">
                        {formatPhoneDisplay(selectedLead.phone)}
                      </span>
                    )}
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-600">{t('crm.amountLost')}</label>
                    <p className="text-black font-semibold">{selectedLead.amountLost}</p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-600">{t('crm.scammerCompany')}</label>
                    <p className="text-black">{selectedLead.scammerCompany}</p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-600">{t('crm.createdDate')}</label>
                    <p className="text-black">{formatCreatedDate(selectedLead.created_at)}</p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-600">{t('common.status')}</label>
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(selectedLead.status)}`}>
                      {selectedLead.status}
                    </span>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-600">{t('leads.priority')}</label>
                    <p className={`font-semibold ${getPriorityColor(selectedLead.priority)}`}>{selectedLead.priority}</p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-600">{t('users.team')}</label>
                    <p className="text-black">{selectedLead.team_id ? teams.find(t => t.id === selectedLead.team_id)?.name || 'N/A' : t('common.noTeam')}</p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-600">{t('leads.assignedTo')}</label>
                    <p className="text-black">{selectedLead.assigned_to ? users.find(u => u.id === selectedLead.assigned_to)?.full_name || 'N/A' : t('crm.notAssigned')}</p>
                  </div>
                </div>
                <div className="mt-4">
                  <label className="text-sm font-semibold text-gray-600">{t('crm.caseDetails')}</label>
                  <p className="text-black mt-2 p-4 bg-gray-50 border border-gray-200 whitespace-pre-wrap">{selectedLead.caseDetails}</p>
                </div>
              </div>

              {/* Quick Status Update Section */}
              <div>
                <h3 className="text-lg font-bold text-black mb-4 border-b-2 border-[#D4AF37] pb-2">{t('crm.updateStatus')}</h3>
                <div className="bg-gray-50 border-2 border-gray-200 p-4 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-black mb-2">{t('common.status')}</label>
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
                      <label className="block text-sm font-semibold text-black mb-2">{t('leads.priority')}</label>
                      <Select value={editData.priority || selectedLead.priority} onValueChange={(value) => setEditData({ ...editData, priority: value })}>
                        <SelectTrigger className="bg-white border-gray-300 rounded-none">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-white">
                          <SelectItem value="low">{t('leads.low')}</SelectItem>
                          <SelectItem value="medium">{t('leads.medium')}</SelectItem>
                          <SelectItem value="high">{t('leads.high')}</SelectItem>
                          <SelectItem value="urgent">{t('leads.urgent')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  {((editData.status || selectedLead.status) === 'Callback' || 
                    (editData.status || selectedLead.status) === 'Potential Callback' || 
                    (editData.status || selectedLead.status) === 'Pharos in progress') && (
                    <>
                      <div className="bg-yellow-50 border-2 border-yellow-400 p-3">
                        <p className="text-sm font-semibold text-black mb-1">⚠️ {t('crm.callbackDepositRequired')}</p>
                        <p className="text-xs text-gray-700">{t('crm.setDateTimeNotification')}</p>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-black mb-2">{t('crm.dateTime')} *</label>
                        <Input
                          type="datetime-local"
                          value={editData.callback_date || ''}
                          onChange={(e) => setEditData({ ...editData, callback_date: e.target.value })}
                          className="bg-white border-gray-300 rounded-none"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-black mb-2">{t('crm.notesOptional')}</label>
                        <Textarea
                          value={editData.callback_notes || ''}
                          onChange={(e) => setEditData({ ...editData, callback_notes: e.target.value })}
                          placeholder={t('crm.addNotes')}
                          className="bg-white border-gray-300 rounded-none"
                          rows={2}
                        />
                      </div>
                    </>
                  )}
                  
                  <Button onClick={handleSaveEdit} className="bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none font-semibold">
                    {t('common.saveChanges')}
                  </Button>
                </div>
              </div>

              {/* Comments Section */}
              <div>
                <h3 className="text-lg font-bold text-black mb-4 border-b-2 border-[#D4AF37] pb-2 flex items-center gap-2">
                  <MessageSquare className="w-5 h-5" />
                  {t('crm.commentsAndNotes')}
                </h3>
                
                {/* Add New Comment */}
                <div className="bg-gray-50 border-2 border-gray-200 p-4 mb-4">
                  <label className="block text-sm font-semibold text-black mb-2">{t('crm.addNote')}</label>
                  <Textarea
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder={t('crm.writeNoteOrComment')}
                    rows={3}
                    className="bg-white border-gray-300 rounded-none mb-3"
                  />
                  <Button onClick={handleAddNote} className="bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none">
                    <Plus className="w-4 h-4 mr-2" />
                    {t('crm.addNote')}
                  </Button>
                </div>

                {/* Notes List */}
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {leadNotes.length === 0 ? (
                    <p className="text-center text-gray-600 py-4">{t('crm.noNotesYet')}</p>
                  ) : (
                    leadNotes.map((note) => (
                      <div key={note.id} className="bg-white border border-gray-200 p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="font-semibold text-black">{note.user_name}</p>
                            <p className="text-xs text-gray-600">{new Date(note.created_at).toLocaleString()}</p>
                          </div>
                          {note.is_internal && (
                            <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">{t('crm.internal')}</span>
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

      {/* Select All Modal */}
      {showSelectAllModal && (
        <Dialog open={showSelectAllModal} onOpenChange={setShowSelectAllModal}>
          <DialogContent className="max-w-md bg-white">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-black">{t('crm.selectLeads')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-gray-700">{t('crm.selectLeadsDescription')}</p>
              
              {/* Option 1: Current Page */}
              <button
                onClick={handleSelectCurrentPage}
                className="w-full p-4 border-2 border-gray-200 hover:border-[#D4AF37] rounded-none text-left transition-colors group"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-black group-hover:text-[#D4AF37]">
                      {t('crm.selectCurrentPage')}
                    </p>
                    <p className="text-sm text-gray-600">
                      {t('crm.selectCurrentPageDesc', { count: filteredLeads.length })}
                    </p>
                  </div>
                  <CheckSquare className="w-6 h-6 text-gray-400 group-hover:text-[#D4AF37]" />
                </div>
              </button>

              {/* Option 2: All Matching */}
              <button
                onClick={handleSelectAllMatching}
                disabled={isSelectingAll}
                className="w-full p-4 border-2 border-gray-200 hover:border-[#D4AF37] rounded-none text-left transition-colors group disabled:opacity-50"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-black group-hover:text-[#D4AF37]">
                      {t('crm.selectAllMatching')}
                    </p>
                    <p className="text-sm text-gray-600">
                      {t('crm.selectAllMatchingDesc', { count: totalLeads })}
                    </p>
                  </div>
                  {isSelectingAll ? (
                    <Loader2 className="w-6 h-6 text-[#D4AF37] animate-spin" />
                  ) : (
                    <CheckSquare className="w-6 h-6 text-gray-400 group-hover:text-[#D4AF37]" />
                  )}
                </div>
              </button>

              <Button 
                onClick={() => setShowSelectAllModal(false)} 
                variant="outline"
                className="w-full rounded-none"
              >
                {t('common.cancel')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Mass Update/Delete Modal */}
      {showMassUpdateModal && (
        <Dialog open={showMassUpdateModal} onOpenChange={(open) => {
          if (!open) {
            setMassActionMode('update');
            setShowMassDeleteConfirm(false);
          }
          setShowMassUpdateModal(open);
        }}>
          <DialogContent className="max-w-lg bg-white">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-black">{t('crm.massActions')}</DialogTitle>
            </DialogHeader>
            
            {/* Tab Buttons */}
            <div className="flex border-b border-gray-200 mb-4">
              <button
                onClick={() => { setMassActionMode('update'); setShowMassDeleteConfirm(false); }}
                className={`flex-1 py-2 px-4 text-sm font-semibold border-b-2 transition-colors ${
                  massActionMode === 'update' 
                    ? 'border-[#D4AF37] text-[#D4AF37]' 
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Edit className="w-4 h-4 inline mr-2" />
                {t('crm.updateTab')}
              </button>
              <button
                onClick={() => { setMassActionMode('delete'); setShowMassDeleteConfirm(false); }}
                className={`flex-1 py-2 px-4 text-sm font-semibold border-b-2 transition-colors ${
                  massActionMode === 'delete' 
                    ? 'border-red-500 text-red-500' 
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Trash2 className="w-4 h-4 inline mr-2" />
                {t('crm.deleteTab')}
              </button>
            </div>

            <div className="space-y-4">
              <p className="text-gray-700">
                {massActionMode === 'update' 
                  ? t('crm.updateSelectedLeads', { count: selectedLeadIds.length })
                  : t('crm.deleteSelectedLeads', { count: selectedLeadIds.length })
                }
              </p>
              
              {/* Update Mode Content */}
              {massActionMode === 'update' && (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-black mb-2">{t('crm.statusOptional')}</label>
                    <Select value={massUpdateData.status || "_none"} onValueChange={(value) => setMassUpdateData({ ...massUpdateData, status: value === "_none" ? "" : value })}>
                      <SelectTrigger className="bg-white border-gray-300 rounded-none">
                        <SelectValue placeholder={t('crm.noChange')} />
                      </SelectTrigger>
                      <SelectContent className="bg-white">
                        <SelectItem value="_none">{t('crm.noChange')}</SelectItem>
                        {statuses.map(status => (
                          <SelectItem key={status.id} value={status.name}>{status.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-black mb-2">{t('crm.teamOptional')}</label>
                    <Select value={massUpdateData.team_id || "_none"} onValueChange={(value) => setMassUpdateData({ ...massUpdateData, team_id: value === "_none" ? "" : value })}>
                      <SelectTrigger className="bg-white border-gray-300 rounded-none">
                        <SelectValue placeholder={t('crm.noChange')} />
                      </SelectTrigger>
                      <SelectContent className="bg-white">
                        <SelectItem value="_none">{t('crm.noChange')}</SelectItem>
                        {teams.map(team => (
                          <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-black mb-2">{t('crm.assignToUserOptional')}</label>
                    <Select value={massUpdateData.assigned_to || "_none"} onValueChange={(value) => setMassUpdateData({ ...massUpdateData, assigned_to: value === "_none" ? "" : value })}>
                      <SelectTrigger className="bg-white border-gray-300 rounded-none">
                        <SelectValue placeholder={t('crm.noChange')} />
                      </SelectTrigger>
                      <SelectContent className="bg-white">
                        <SelectItem value="_none">{t('crm.noChange')}</SelectItem>
                        {users.filter(u => u.is_active).map(user => (
                          <SelectItem key={user.id} value={user.id}>{user.full_name} ({user.role})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button onClick={handleMassUpdate} className="w-full bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none font-semibold">
                    {t('crm.updateLeads')}
                  </Button>
                </>
              )}

              {/* Delete Mode Content */}
              {massActionMode === 'delete' && (
                <>
                  {!showMassDeleteConfirm ? (
                    <>
                      <div className="bg-red-50 border-l-4 border-red-500 p-4">
                        <div className="flex items-start">
                          <AlertTriangle className="w-5 h-5 text-red-500 mr-3 mt-0.5" />
                          <div>
                            <p className="text-sm font-semibold text-red-800">{t('crm.warningDeletePermanent')}</p>
                            <p className="text-sm text-red-700 mt-1">{t('crm.warningDeleteDescription')}</p>
                          </div>
                        </div>
                      </div>
                      <Button 
                        onClick={() => setShowMassDeleteConfirm(true)} 
                        className="w-full bg-red-600 text-white hover:bg-red-700 rounded-none font-semibold"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        {t('crm.proceedToDelete')}
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="bg-red-100 border-2 border-red-500 p-4 text-center">
                        <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-2" />
                        <p className="text-lg font-bold text-red-800">{t('crm.confirmMassDelete')}</p>
                        <p className="text-sm text-red-700 mt-2">
                          {t('crm.aboutToDelete', { count: selectedLeadIds.length })}
                        </p>
                      </div>
                      <div className="flex gap-3">
                        <Button 
                          onClick={() => setShowMassDeleteConfirm(false)} 
                          className="flex-1 bg-gray-200 text-gray-800 hover:bg-gray-300 rounded-none font-semibold"
                          disabled={isMassDeleting}
                        >
                          {t('common.cancel')}
                        </Button>
                        <Button 
                          onClick={handleMassDelete} 
                          className="flex-1 bg-red-600 text-white hover:bg-red-700 rounded-none font-semibold"
                          disabled={isMassDeleting}
                        >
                          {isMassDeleting ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              {t('common.deleting')}
                            </>
                          ) : (
                            <>
                              <Trash2 className="w-4 h-4 mr-2" />
                              {t('crm.deleteForever')}
                            </>
                          )}
                        </Button>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Modal */}
      {showEditModal && selectedLead && (
        <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
          <DialogContent className="max-w-2xl bg-white max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-black">
                {currentUser.role === 'admin' ? t('leads.editLeadFull') : t('leads.editLead')}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {/* Admin-only editable fields */}
              {currentUser.role === 'admin' && (
                <>
                  <div className="bg-amber-50 border-l-4 border-[#D4AF37] p-3 mb-4">
                    <p className="text-sm font-semibold text-black">🔑 {t('leads.adminEditMode')}</p>
                    <p className="text-xs text-gray-600">{t('leads.adminEditModeDesc')}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-black mb-2">{t('leads.fullName')} *</label>
                      <Input
                        value={editData.fullName}
                        onChange={(e) => setEditData({ ...editData, fullName: e.target.value })}
                        className="bg-white border-gray-300 rounded-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-black mb-2">{t('common.email')} *</label>
                      <Input
                        type="email"
                        value={editData.email}
                        onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                        className="bg-white border-gray-300 rounded-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-black mb-2">{t('common.phone')} *</label>
                      <Input
                        value={editData.phone}
                        onChange={(e) => setEditData({ ...editData, phone: e.target.value })}
                        className="bg-white border-gray-300 rounded-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-black mb-2">{t('crm.scammerCompany')} *</label>
                      <Input
                        value={editData.scammerCompany}
                        onChange={(e) => setEditData({ ...editData, scammerCompany: e.target.value })}
                        className="bg-white border-gray-300 rounded-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-black mb-2">{t('crm.amountLost')} *</label>
                      <Input
                        value={editData.amountLost}
                        onChange={(e) => setEditData({ ...editData, amountLost: e.target.value })}
                        placeholder={t('crm.enterAmountLost')}
                        className="bg-white border-gray-300 rounded-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-black mb-2">{t('crm.caseDetails')} *</label>
                    <Textarea
                      value={editData.caseDetails}
                      onChange={(e) => setEditData({ ...editData, caseDetails: e.target.value })}
                      className="bg-white border-gray-300 rounded-none"
                      rows={3}
                    />
                  </div>
                  <hr className="border-gray-200 my-4" />
                </>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-black mb-2">{t('common.status')}</label>
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
                  <label className="block text-sm font-semibold text-black mb-2">{t('leads.priority')}</label>
                  <Select value={editData.priority} onValueChange={(value) => setEditData({ ...editData, priority: value })}>
                    <SelectTrigger className="bg-white border-gray-300 rounded-none">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white">
                      <SelectItem value="low">{t('leads.low')}</SelectItem>
                      <SelectItem value="medium">{t('leads.medium')}</SelectItem>
                      <SelectItem value="high">{t('leads.high')}</SelectItem>
                      <SelectItem value="urgent">{t('leads.urgent')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {(editData.status === 'Callback' || editData.status === 'Potential Callback' || editData.status === 'Pharos in progress') && (
                <>
                  <div className="bg-yellow-50 border-2 border-yellow-400 p-4 mb-4">
                    <p className="text-sm font-semibold text-black mb-2">⚠️ {t('crm.callbackRequired')}</p>
                    <p className="text-xs text-gray-700">{t('crm.setDateTimeNotificationRequired')}</p>
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
                    <label className="block text-sm font-semibold text-black mb-2">{t('crm.callbackNotesOptional')}</label>
                    <Textarea
                      value={editData.callback_notes}
                      onChange={(e) => setEditData({ ...editData, callback_notes: e.target.value })}
                      placeholder={t('crm.addCallbackNotes')}
                      className="bg-white border-gray-300 rounded-none"
                      rows={3}
                    />
                  </div>
                </>
              )}
              {/* For Deposit statuses - no date required, just show info */}
              {(editData.status?.startsWith('Deposit')) && (
                <>
                  <div className="bg-blue-50 border-2 border-blue-400 p-4">
                    <p className="text-sm font-semibold text-black mb-2">💰 {t('deposits.depositInfo')}</p>
                    <p className="text-xs text-gray-700">{t('deposits.supervisorWillBeNotified')}</p>
                  </div>
                </>
              )}
              <Button onClick={handleSaveEdit} className="w-full bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none font-semibold">
                {t('common.saveChanges')}
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
              <DialogTitle className="text-2xl font-bold text-black">{t('crm.assignLead')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-gray-700">{t('crm.assignLeadToAgent')}</p>
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
              <DialogTitle className="text-2xl font-bold text-black">{t('leads.createLead')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-black mb-2">{t('leads.fullName')} *</label>
                  <Input
                    value={newLead.fullName}
                    onChange={(e) => setNewLead({ ...newLead, fullName: e.target.value })}
                    placeholder="Mario Rossi"
                    className="bg-white border-gray-300 rounded-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-black mb-2">{t('common.email')} *</label>
                  <Input
                    type="email"
                    value={newLead.email}
                    onChange={(e) => setNewLead({ ...newLead, email: e.target.value })}
                    placeholder="mario@esempio.it"
                    className="bg-white border-gray-300 rounded-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-black mb-2">{t('common.phone')} *</label>
                  <Input
                    value={newLead.phone}
                    onChange={(e) => setNewLead({ ...newLead, phone: e.target.value })}
                    placeholder="3XX XXX XXXX"
                    className="bg-white border-gray-300 rounded-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-black mb-2">{t('crm.scammerCompany')} *</label>
                  <Input
                    value={newLead.scammerCompany}
                    onChange={(e) => setNewLead({ ...newLead, scammerCompany: e.target.value })}
                    placeholder="Es. FakeInvest Ltd"
                    className="bg-white border-gray-300 rounded-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-black mb-2">{t('crm.amountLost')} *</label>
                <Select 
                  value={newLead.amountLost || undefined} 
                  onValueChange={(value) => setNewLead({ ...newLead, amountLost: value })}
                >
                  <SelectTrigger className="bg-white border-gray-300 rounded-none">
                    <SelectValue placeholder={t('crm.selectAmount')} />
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
                <label className="block text-sm font-semibold text-black mb-2">{t('crm.caseDetails')} *</label>
                <Textarea
                  value={newLead.caseDetails}
                  onChange={(e) => setNewLead({ ...newLead, caseDetails: e.target.value })}
                  placeholder={t('crm.describeFraud')}
                  rows={5}
                  className="bg-white border-gray-300 rounded-none"
                />
              </div>
              <Button onClick={handleCreateLead} className="w-full bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none font-semibold">
                {t('leads.createLead')}
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
              <DialogTitle className="text-2xl font-bold text-black">{t('crm.setCallbackDeposit')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-yellow-50 border-2 border-yellow-400 p-3">
                <p className="text-sm font-semibold text-black mb-1">⚠️ {t('crm.callbackRequired')}</p>
                <p className="text-xs text-gray-700">{t('crm.selectedStatus')}: <strong>{inlineStatusData.status}</strong></p>
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
                <label className="block text-sm font-semibold text-black mb-2">{t('crm.notesOptional')}</label>
                <Textarea
                  value={inlineStatusData.callback_notes}
                  onChange={(e) => setInlineStatusData({ ...inlineStatusData, callback_notes: e.target.value })}
                  placeholder={t('crm.addNotes')}
                  className="bg-white border-gray-300 rounded-none"
                  rows={3}
                />
              </div>
              <div className="flex gap-3">
                <Button onClick={handleSaveInlineCallback} className="flex-1 bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none font-semibold">
                  {t('common.save')}
                </Button>
                <Button onClick={() => setInlineEditLeadId(null)} className="flex-1 bg-gray-300 text-black hover:bg-gray-400 rounded-none">
                  {t('common.cancel')}
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
              <DialogTitle className="text-2xl font-bold text-black">{t('crm.importFromCSV')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-yellow-50 border-2 border-yellow-200 p-4">
                <h4 className="font-bold text-black mb-2">{t('crm.requiredCSVFormat')}</h4>
                <p className="text-sm text-gray-700 mb-3">{t('crm.csvMustHaveColumns')}</p>
                <div className="bg-white p-3 border border-gray-300 font-mono text-xs overflow-x-auto">
                  <div className="font-bold mb-1">{t('common.name')},{t('common.email')},{t('common.phone')},{t('crm.scammerCompany')},{t('crm.amountLost')},{t('crm.caseDetails')}</div>
                  <div className="text-gray-600">Mario Rossi,mario@email.com,3201234567,FakeInvest Ltd,€5.000 - €50.000,{t('crm.fraudDescription')}...</div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-black mb-2">{t('crm.selectCSVFileLabel')}</label>
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
                  {t('crm.importLeads')}
                </Button>
                <Button onClick={() => setShowImportModal(false)} className="flex-1 bg-gray-300 text-black hover:bg-gray-400 rounded-none">
                  {t('common.cancel')}
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
                {t('leads.confirmDelete')}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-gray-700">
                {t('leads.confirmDeleteMessage', { name: leadToDelete.fullName })}
              </p>
              <div className="bg-red-50 border border-red-200 p-3 rounded">
                <p className="text-sm text-red-700">
                  <strong>⚠️ {t('common.warning')}:</strong> {t('leads.deleteWarning')}
                </p>
              </div>
              <div className="flex gap-3 pt-4">
                <Button
                  onClick={() => setShowDeleteModal(false)}
                  className="flex-1 bg-gray-200 text-black hover:bg-gray-300 rounded-none"
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  onClick={handleConfirmDelete}
                  className="flex-1 bg-red-600 text-white hover:bg-red-700 rounded-none"
                >
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

export default LeadsTable;
