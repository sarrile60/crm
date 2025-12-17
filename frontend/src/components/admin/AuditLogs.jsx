import React, { useState, useEffect, useCallback } from 'react';
import { 
  RefreshCw, Download, Search, Filter, Clock, User, 
  Shield, Building2, Eye, FileText, ChevronLeft, ChevronRight,
  Calendar, Activity
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { toast } from 'sonner';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api/admin`;

// Entity type icons
const ENTITY_ICONS = {
  user: User,
  team: Building2,
  role: Shield,
  permission: Shield,
  visibility_rule: Eye,
  lead: FileText,
  auth: Clock
};

// Action type colors
const ACTION_COLORS = {
  login_success: 'bg-green-100 text-green-700',
  login_failed: 'bg-red-100 text-red-700',
  logout: 'bg-gray-100 text-gray-700',
  user_created: 'bg-blue-100 text-blue-700',
  user_updated: 'bg-yellow-100 text-yellow-700',
  user_deleted: 'bg-red-100 text-red-700',
  user_status_changed: 'bg-orange-100 text-orange-700',
  password_reset: 'bg-purple-100 text-purple-700',
  team_created: 'bg-blue-100 text-blue-700',
  team_updated: 'bg-yellow-100 text-yellow-700',
  team_archived: 'bg-red-100 text-red-700',
  member_added: 'bg-green-100 text-green-700',
  member_removed: 'bg-orange-100 text-orange-700',
  role_created: 'bg-blue-100 text-blue-700',
  role_updated: 'bg-yellow-100 text-yellow-700',
  role_deleted: 'bg-red-100 text-red-700',
  permissions_updated: 'bg-purple-100 text-purple-700',
  visibility_rules_updated: 'bg-indigo-100 text-indigo-700',
  lead_created: 'bg-blue-100 text-blue-700',
  lead_deleted: 'bg-red-100 text-red-700',
  lead_assigned: 'bg-green-100 text-green-700'
};

const AuditLogs = () => {
  const [logs, setLogs] = useState([]);
  const [filters, setFilters] = useState({
    user_id: '',
    action: '',
    entity_type: '',
    date_from: '',
    date_to: '',
    search: ''
  });
  const [filterOptions, setFilterOptions] = useState({
    actions: [],
    entity_types: [],
    users: []
  });
  const [stats, setStats] = useState(null);
  const [pagination, setPagination] = useState({
    total: 0,
    limit: 50,
    offset: 0,
    has_more: false
  });
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const fetchFilterOptions = useCallback(async () => {
    try {
      const token = localStorage.getItem('crmToken');
      const response = await axios.get(`${API}/audit-logs/filters`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setFilterOptions(response.data);
    } catch (error) {
      console.error('Error fetching filter options:', error);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const token = localStorage.getItem('crmToken');
      const response = await axios.get(`${API}/audit-logs/stats`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStats(response.data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  }, []);

  const fetchLogs = useCallback(async (resetOffset = false) => {
    try {
      setLoading(true);
      const token = localStorage.getItem('crmToken');
      
      const params = new URLSearchParams();
      if (filters.user_id) params.append('user_id', filters.user_id);
      if (filters.action) params.append('action', filters.action);
      if (filters.entity_type) params.append('entity_type', filters.entity_type);
      if (filters.date_from) params.append('date_from', filters.date_from);
      if (filters.date_to) params.append('date_to', filters.date_to);
      if (filters.search) params.append('search', filters.search);
      
      const offset = resetOffset ? 0 : pagination.offset;
      params.append('limit', pagination.limit);
      params.append('offset', offset);
      
      const response = await axios.get(`${API}/audit-logs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setLogs(response.data.logs);
      setPagination({
        total: response.data.total,
        limit: response.data.limit,
        offset: response.data.offset,
        has_more: response.data.has_more
      });
    } catch (error) {
      toast.error('Errore nel caricamento dei log');
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  }, [filters, pagination.limit, pagination.offset]);

  useEffect(() => {
    fetchFilterOptions();
    fetchStats();
  }, [fetchFilterOptions, fetchStats]);

  useEffect(() => {
    fetchLogs(true);
  }, [filters]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({
      user_id: '',
      action: '',
      entity_type: '',
      date_from: '',
      date_to: '',
      search: ''
    });
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      const token = localStorage.getItem('crmToken');
      
      const params = new URLSearchParams();
      if (filters.user_id) params.append('user_id', filters.user_id);
      if (filters.action) params.append('action', filters.action);
      if (filters.entity_type) params.append('entity_type', filters.entity_type);
      if (filters.date_from) params.append('date_from', filters.date_from);
      if (filters.date_to) params.append('date_to', filters.date_to);
      
      const response = await axios.get(`${API}/audit-logs/export?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `audit_logs_${new Date().toISOString().slice(0,10)}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      toast.success('Export completato');
    } catch (error) {
      toast.error('Errore durante l\'export');
      console.error('Error:', error);
    } finally {
      setExporting(false);
    }
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getEntityIcon = (entityType) => {
    const Icon = ENTITY_ICONS[entityType] || Activity;
    return <Icon className="w-4 h-4" />;
  };

  const goToPage = (newOffset) => {
    setPagination(prev => ({ ...prev, offset: newOffset }));
    fetchLogs(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Audit Log</h2>
          <p className="text-gray-500 mt-1">
            Registro immutabile delle attività di sistema. I log non possono essere modificati o eliminati.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowFilters(!showFilters)}
            className="rounded-none"
          >
            <Filter className="w-4 h-4 mr-2" />
            Filtri
          </Button>
          <Button
            variant="outline"
            onClick={() => { fetchLogs(true); fetchStats(); }}
            disabled={loading}
            className="rounded-none"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            onClick={handleExport}
            disabled={exporting}
            className="bg-[#D4AF37] hover:bg-[#B8941F] text-black rounded-none"
          >
            <Download className="w-4 h-4 mr-2" />
            {exporting ? 'Esportazione...' : 'Esporta CSV'}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white border border-gray-200 p-4">
            <div className="text-sm text-gray-500">Log Totali</div>
            <div className="text-2xl font-bold text-gray-900">{stats.total_logs}</div>
          </div>
          <div className="bg-white border border-gray-200 p-4">
            <div className="text-sm text-gray-500">Oggi</div>
            <div className="text-2xl font-bold text-[#D4AF37]">{stats.today_count}</div>
          </div>
          <div className="bg-white border border-gray-200 p-4">
            <div className="text-sm text-gray-500">Azioni Principali (7gg)</div>
            <div className="text-sm mt-1">
              {stats.by_action.slice(0, 3).map(a => (
                <span key={a.action} className="inline-block mr-2 text-gray-600">
                  {a.label}: {a.count}
                </span>
              ))}
            </div>
          </div>
          <div className="bg-white border border-gray-200 p-4">
            <div className="text-sm text-gray-500">Per Entità (7gg)</div>
            <div className="text-sm mt-1">
              {stats.by_entity_type.slice(0, 3).map(e => (
                <span key={e.entity_type} className="inline-block mr-2 text-gray-600">
                  {e.label}: {e.count}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      {showFilters && (
        <div className="bg-white border border-gray-200 p-4 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-gray-700">Filtri</h3>
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Cancella Filtri
            </Button>
          </div>
          
          <div className="grid grid-cols-6 gap-4">
            <div>
              <label className="text-sm text-gray-500 block mb-1">Cerca</label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder="Nome, utente..."
                  value={filters.search}
                  onChange={(e) => handleFilterChange('search', e.target.value)}
                  className="pl-10 rounded-none"
                />
              </div>
            </div>
            
            <div>
              <label className="text-sm text-gray-500 block mb-1">Utente</label>
              <Select
                value={filters.user_id}
                onValueChange={(value) => handleFilterChange('user_id', value)}
              >
                <SelectTrigger className="rounded-none">
                  <SelectValue placeholder="Tutti gli utenti" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti gli utenti</SelectItem>
                  {filterOptions.users.map(u => (
                    <SelectItem key={u.user_id} value={u.user_id}>
                      {u.user_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-sm text-gray-500 block mb-1">Azione</label>
              <Select
                value={filters.action}
                onValueChange={(value) => handleFilterChange('action', value)}
              >
                <SelectTrigger className="rounded-none">
                  <SelectValue placeholder="Tutte le azioni" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutte le azioni</SelectItem>
                  {filterOptions.actions.map(a => (
                    <SelectItem key={a.value} value={a.value}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-sm text-gray-500 block mb-1">Tipo Entità</label>
              <Select
                value={filters.entity_type}
                onValueChange={(value) => handleFilterChange('entity_type', value)}
              >
                <SelectTrigger className="rounded-none">
                  <SelectValue placeholder="Tutti i tipi" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti i tipi</SelectItem>
                  {filterOptions.entity_types.map(e => (
                    <SelectItem key={e.value} value={e.value}>
                      {e.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-sm text-gray-500 block mb-1">Data Da</label>
              <Input
                type="datetime-local"
                value={filters.date_from}
                onChange={(e) => handleFilterChange('date_from', e.target.value)}
                className="rounded-none"
              />
            </div>
            
            <div>
              <label className="text-sm text-gray-500 block mb-1">Data A</label>
              <Input
                type="datetime-local"
                value={filters.date_to}
                onChange={(e) => handleFilterChange('date_to', e.target.value)}
                className="rounded-none"
              />
            </div>
          </div>
        </div>
      )}

      {/* Logs Table */}
      <div className="bg-white border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-900 text-white">
                <th className="text-left p-4 font-semibold">Data/Ora</th>
                <th className="text-left p-4 font-semibold">Utente</th>
                <th className="text-left p-4 font-semibold">Azione</th>
                <th className="text-left p-4 font-semibold">Tipo</th>
                <th className="text-left p-4 font-semibold">Entità</th>
                <th className="text-left p-4 font-semibold">Dettagli</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-gray-500">
                    Caricamento...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-gray-500">
                    Nessun log trovato
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="p-4 text-sm text-gray-600 font-mono">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        {formatTimestamp(log.timestamp)}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-gray-400" />
                        <span className="font-medium">{log.user_name}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-1 text-xs font-semibold ${ACTION_COLORS[log.action] || 'bg-gray-100 text-gray-700'}`}>
                        {log.action_label}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2 text-gray-600">
                        {getEntityIcon(log.entity_type)}
                        <span>{log.entity_type_label}</span>
                      </div>
                    </td>
                    <td className="p-4 text-gray-700 font-medium">
                      {log.entity_name || '-'}
                    </td>
                    <td className="p-4 text-sm text-gray-500">
                      {log.details && Object.keys(log.details).length > 0 ? (
                        <span className="font-mono text-xs">
                          {JSON.stringify(log.details).slice(0, 50)}
                          {JSON.stringify(log.details).length > 50 ? '...' : ''}
                        </span>
                      ) : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        <div className="flex justify-between items-center px-4 py-3 border-t border-gray-200 bg-gray-50">
          <div className="text-sm text-gray-500">
            Mostrando {pagination.offset + 1} - {Math.min(pagination.offset + logs.length, pagination.total)} di {pagination.total} risultati
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(Math.max(0, pagination.offset - pagination.limit))}
              disabled={pagination.offset === 0}
              className="rounded-none"
            >
              <ChevronLeft className="w-4 h-4" />
              Precedente
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(pagination.offset + pagination.limit)}
              disabled={!pagination.has_more}
              className="rounded-none"
            >
              Successivo
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 p-4">
        <h4 className="font-semibold text-blue-800 mb-2">Informazioni sui Log</h4>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• I log sono <strong>immutabili</strong> e non possono essere modificati o eliminati</li>
          <li>• Vengono registrate tutte le azioni: login, modifiche utenti, team, ruoli, permessi</li>
          <li>• L'export CSV include tutti i log filtrati (massimo 10.000 record)</li>
          <li>• Solo gli amministratori possono visualizzare i log di audit</li>
        </ul>
      </div>
    </div>
  );
};

export default AuditLogs;
