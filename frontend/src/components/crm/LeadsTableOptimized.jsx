import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Eye, Edit, UserPlus, Search, Upload, Download, Plus, ChevronLeft, ChevronRight, CheckSquare, Square, Trash2, AlertTriangle } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Badge } from '../ui/badge';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useLeads, useUsers, useTeams, useStatuses, usePrefetchLeads, useUpdateLead } from '../../hooks/useLeadsData';
import { useQueryClient } from '@tanstack/react-query';
import { List } from 'react-window';
import axios from 'axios';
import * as XLSX from 'xlsx';
import PerformanceMonitor from '../../utils/performance';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Lightweight LeadRow for virtualization - NO inline Select components
const LeadRow = React.memo(({ 
  lead, 
  isSelected,
  style,
  onClick,
  onCheckbox,
  users,
  teams,
  canShowCheckbox
}) => {
  const statusColors = {
    'New': 'bg-blue-100 text-blue-800',
    'Callback': 'bg-yellow-100 text-yellow-800',
    'Deposit 1': 'bg-green-100 text-green-800',
    'Deposit 2': 'bg-green-200 text-green-900',
    'Deposit 3': 'bg-green-300 text-green-900',
  };
  
  const priorityColors = {
    low: 'text-gray-600',
    medium: 'text-blue-600',
    high: 'text-orange-600',
    urgent: 'text-red-600'
  };
  
  const assignedUser = users.find(u => u.id === lead.assigned_to);
  const team = teams.find(t => t.id === lead.team_id);
  
  return (
    <div style={style} className="flex border-b border-gray-200 hover:bg-gray-50 items-center text-sm">
      {canShowCheckbox && (
        <div className="w-12 flex-shrink-0 p-3">
          <button onClick={(e) => { e.stopPropagation(); onCheckbox(lead.id); }}>
            {isSelected ? <CheckSquare className="w-5 h-5 text-gray-700" /> : <Square className="w-5 h-5 text-gray-400" />}
          </button>
        </div>
      )}
      <div className="flex-1 flex items-center cursor-pointer" onClick={() => onClick(lead)}>
        <div className="w-[140px] flex-shrink-0 p-3 text-gray-700 truncate">
          {new Date(lead.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </div>
        <div className="w-[180px] flex-shrink-0 p-3 font-semibold text-black truncate hover:text-[#D4AF37] underline">
          {lead.fullName}
        </div>
        <div className="w-[150px] flex-shrink-0 p-3 text-blue-600 truncate">
          {lead.phone || 'N/A'}
        </div>
        <div className="w-[200px] flex-shrink-0 p-3 text-gray-700 truncate">
          {lead.email}
        </div>
        <div className="w-[110px] flex-shrink-0 p-3 text-gray-700 truncate">
          {lead.amountLost || 'Unknown'}
        </div>
        <div className="w-[140px] flex-shrink-0 p-3">
          <Badge className={`text-xs ${statusColors[lead.status] || 'bg-gray-100 text-gray-800'}`}>
            {lead.status}
          </Badge>
        </div>
        <div className="w-[100px] flex-shrink-0 p-3 font-semibold truncate">
          <span className={priorityColors[lead.priority] || 'text-gray-600'}>
            {lead.priority}
          </span>
        </div>
        <div className="w-[110px] flex-shrink-0 p-3 text-gray-700 truncate">
          {team?.name || 'No Team'}
        </div>
        <div className="w-[130px] flex-shrink-0 p-3 text-gray-700 truncate">
          {assignedUser?.full_name || 'Not assigned'}
        </div>
        <div className="w-[180px] flex-shrink-0 p-3">
          <div className="flex gap-1">
            <Button size="sm" className="h-8 w-8 p-0 bg-blue-600 hover:bg-blue-700" onClick={(e) => { e.stopPropagation(); onClick(lead); }}>
              <Eye className="w-3.5 h-3.5" />
            </Button>
            <Button size="sm" className="h-8 w-8 p-0 bg-[#D4AF37] hover:bg-[#C5A028]" onClick={(e) => { e.stopPropagation(); /* Edit handler */ }}>
              <Edit className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
});

const LeadsTableOptimized = ({ currentUser, urgentCallbackLead, onClearCallbackLead }) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  
  // Pagination & filter state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(200);
  const [filters, setFilters] = useState({ status: '', priority: '', search: '' });
  const [searchInput, setSearchInput] = useState('');
  const [selectedLeadIds, setSelectedLeadIds] = useState([]);
  const [selectAllMode, setSelectAllMode] = useState(false); // Server-side select all
  
  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters(prev => ({ ...prev, search: searchInput }));
      setCurrentPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);
  
  // React Query hooks - with caching!
  PerformanceMonitor.start('useLeadsQuery');
  const { data: leadsData, isLoading, isFetching, isPreviousData } = useLeads({
    page: currentPage,
    pageSize,
    filters,
    sort: 'created_at',
    order: 'desc'
  });
  useEffect(() => {
    if (!isLoading) PerformanceMonitor.end('useLeadsQuery');
  }, [isLoading]);
  
  const { data: users = [] } = useUsers(); // Cached globally
  const { data: teams = [] } = useTeams(); // Cached globally
  const { data: statuses = [] } = useStatuses(); // Cached globally
  
  const prefetchNext = usePrefetchLeads();
  
  // Prefetch next page when data loads
  useEffect(() => {
    if (leadsData && currentPage < Math.ceil((leadsData.total || 0) / pageSize)) {
      prefetchNext({ page: currentPage + 1, pageSize, filters, sort: 'created_at', order: 'desc' });
    }
  }, [leadsData, currentPage, pageSize, filters, prefetchNext]);
  
  const leads = leadsData?.data || [];
  const total = leadsData?.total || 0;
  
  // Modals (keeping existing implementation)
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [csvFile, setCsvFile] = useState(null);
  const [newLead, setNewLead] = useState({ fullName: '', email: '', phone: '', scammerCompany: '', amountLost: '', caseDetails: '' });
  
  // Handlers
  const handleLeadClick = useCallback((lead) => {
    PerformanceMonitor.start('openLeadDetail');
    setSelectedLead(lead);
    setShowDetailModal(true);
    PerformanceMonitor.end('openLeadDetail');
  }, []);
  
  const handleCheckbox = useCallback((leadId) => {
    setSelectedLeadIds(prev => 
      prev.includes(leadId) ? prev.filter(id => id !== leadId) : [...prev, leadId]
    );
    setSelectAllMode(false); // Disable server-side mode when manually selecting
  }, []);
  
  const handleSelectAll = useCallback(async () => {
    if (selectAllMode || selectedLeadIds.length > 0) {
      // Deselect all
      setSelectedLeadIds([]);
      setSelectAllMode(false);
    } else {
      // Select all matching current filters (server-side)
      try {
        const token = localStorage.getItem('crmToken');
        const params = Object.fromEntries(Object.entries(filters).filter(([_, v]) => v));
        const response = await axios.post(`${API}/crm/leads/select-all`, params, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setSelectedLeadIds(response.data.lead_ids);
        setSelectAllMode(true);
        toast.success(`Selected ${response.data.count} leads matching filters`);
      } catch (error) {
        toast.error('Error selecting all leads');
      }
    }
  }, [selectAllMode, selectedLeadIds.length, filters]);
  
  const canMassUpdate = ['admin', 'supervisor'].includes(currentUser.role);
  const startRecord = total === 0 ? 0 : ((currentPage - 1) * pageSize) + 1;
  const endRecord = Math.min(currentPage * pageSize, total);
  const totalPages = Math.ceil(total / pageSize);
  
  // Virtualized row renderer
  const Row = useCallback(({ index, style }) => {
    const lead = leads[index];
    if (!lead) return null;
    
    return (
      <LeadRow
        style={style}
        lead={lead}
        isSelected={selectedLeadIds.includes(lead.id)}
        onClick={handleLeadClick}
        onCheckbox={handleCheckbox}
        users={users}
        teams={teams}
        canShowCheckbox={canMassUpdate}
      />
    );
  }, [leads, selectedLeadIds, handleLeadClick, handleCheckbox, users, teams, canMassUpdate]);
  
  const handleExportCSV = () => {
    if (leads.length === 0) {
      toast.error('No leads to export');
      return;
    }
    const csvContent = [
      ['Date', 'Name', 'Email', 'Phone', 'Company', 'Amount', 'Status', 'Priority'],
      ...leads.map(lead => [
        new Date(lead.created_at).toLocaleDateString(),
        lead.fullName,
        lead.email,
        lead.phone,
        lead.scammerCompany || '',
        lead.amountLost,
        lead.status,
        lead.priority
      ])
    ].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `leads_export_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    toast.success('Leads exported successfully');
  };
  
  return (
    <div className="flex flex-col h-full max-w-[1600px] mx-auto">
      {/* Performance indicator */}
      {isFetching && !isPreviousData && (
        <div className="fixed top-4 right-4 bg-blue-600 text-white px-4 py-2 rounded shadow-lg z-50 text-sm">
          Loading...
        </div>
      )}
      
      {/* Sticky Toolbar */}
      <div className="sticky top-0 z-20 bg-white pb-4 mb-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-3xl font-bold text-black">{t('leads.title')}</h2>
          <div className="flex gap-3">
            {canMassUpdate && selectedLeadIds.length > 0 && (
              <Button onClick={() => {}} variant="secondary" size="sm">
                <Edit className="w-4 h-4 mr-2" />
                Mass Update ({selectAllMode ? `All ${total}` : selectedLeadIds.length})
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
        
        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-end mb-4">
          <div className="flex-1 min-w-[200px]">
            <label className="text-sm font-semibold text-black mb-2 block">{t('common.search')}</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search leads..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9 bg-white border-gray-300"
              />
            </div>
          </div>
          <div className="w-[160px]">
            <label className="text-sm font-semibold text-black mb-2 block">{t('common.status')}</label>
            <Select value={filters.status || "all"} onValueChange={(value) => { setFilters(prev => ({ ...prev, status: value === "all" ? "" : value })); setCurrentPage(1); }}>
              <SelectTrigger className="bg-white border-gray-300">
                <SelectValue placeholder={t('common.all')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('common.all')}</SelectItem>
                {statuses.map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="w-[140px]">
            <label className="text-sm font-semibold text-black mb-2 block">{t('leads.priority')}</label>
            <Select value={filters.priority || "all"} onValueChange={(value) => { setFilters(prev => ({ ...prev, priority: value === "all" ? "" : value })); setCurrentPage(1); }}>
              <SelectTrigger className="bg-white border-gray-300">
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
          <Button onClick={() => { setFilters({ status: '', priority: '', search: '' }); setSearchInput(''); setCurrentPage(1); }} variant="outline" size="sm">
            Clear Filters
          </Button>
        </div>
        
        {/* Pagination */}
        <div className="flex items-center justify-between text-sm">
          <div className="text-gray-700 font-semibold">
            {t('common.showing')} {startRecord}–{endRecord} / {total}
            {isPreviousData && <span className="ml-2 text-blue-600">(loading...)</span>}
          </div>
          <div className="flex items-center gap-3">
            <label className="text-gray-700 font-semibold">{t('common.rowsPerPage')}:</label>
            <Select value={pageSize.toString()} onValueChange={(v) => { setPageSize(parseInt(v)); setCurrentPage(1); }}>
              <SelectTrigger className="w-[80px] h-8 bg-white border-gray-300">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
                <SelectItem value="200">200</SelectItem>
                {currentUser.role === 'admin' && <SelectItem value="500">500</SelectItem>}
              </SelectContent>
            </Select>
            <Button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} size="sm" variant="outline" className="h-8">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-gray-700 font-semibold min-w-[100px] text-center">
              Page {currentPage} / {totalPages}
            </span>
            <Button onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage >= totalPages || isPreviousData} size="sm" variant="outline" className="h-8">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
      
      {/* Virtualized Table */}
      <div className="flex-1 bg-white border-2 border-gray-200 overflow-hidden">
        {/* Table Header */}
        <div className="bg-black text-white flex items-center text-sm font-semibold sticky top-0 z-10">
          {canMassUpdate && (
            <div className="w-12 flex-shrink-0 p-3">
              <button onClick={handleSelectAll}>
                {(selectAllMode || selectedLeadIds.length === leads.length) && leads.length > 0 ? (
                  <CheckSquare className="w-5 h-5" />
                ) : (
                  <Square className="w-5 h-5" />
                )}
              </button>
            </div>
          )}
          <div className="w-[140px] flex-shrink-0 p-3">Date</div>
          <div className="w-[180px] flex-shrink-0 p-3">Name</div>
          <div className="w-[150px] flex-shrink-0 p-3">Phone</div>
          <div className="w-[200px] flex-shrink-0 p-3">Email</div>
          <div className="w-[110px] flex-shrink-0 p-3">Amount</div>
          <div className="w-[140px] flex-shrink-0 p-3">Status</div>
          <div className="w-[100px] flex-shrink-0 p-3">Priority</div>
          <div className="w-[110px] flex-shrink-0 p-3">Team</div>
          <div className="w-[130px] flex-shrink-0 p-3">Assigned To</div>
          <div className="w-[180px] flex-shrink-0 p-3">Actions</div>
        </div>
        
        {/* Virtualized List */}
        {isLoading ? (
          <div className="text-center py-12 text-gray-600">Loading leads...</div>
        ) : leads.length === 0 ? (
          <div className="text-center py-12 text-gray-600">No leads found</div>
        ) : (
          <List
            height={600}
            itemCount={leads.length}
            itemSize={44} // Fixed row height for best performance
            width="100%"
          >
            {Row}
          </List>
        )}
      </div>
      
      {/* Detail Modal - Simple placeholder */}
      {showDetailModal && selectedLead && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowDetailModal(false)}>
          <div className="bg-white p-6 rounded max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-2xl font-bold mb-4">{selectedLead.fullName}</h3>
            <div className="grid grid-cols-2 gap-4">
              <div><strong>Email:</strong> {selectedLead.email}</div>
              <div><strong>Phone:</strong> {selectedLead.phone}</div>
              <div><strong>Status:</strong> {selectedLead.status}</div>
              <div><strong>Priority:</strong> {selectedLead.priority}</div>
            </div>
            <Button onClick={() => setShowDetailModal(false)} className="mt-6">Close</Button>
          </div>
        </div>
      )}
      
      {/* Performance Badge - Shows optimization is active */}
      <div className="fixed bottom-4 right-4 bg-green-600 text-white px-3 py-1 rounded text-xs font-semibold shadow-lg">
        ⚡ PERF MODE
      </div>
    </div>
  );
};

export default LeadsTableOptimized;
