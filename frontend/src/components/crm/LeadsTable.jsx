import React, { useState, useEffect } from 'react';
import { Eye, Edit, UserPlus, Filter, Search, Upload, Download, Plus, MessageSquare } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Textarea } from '../ui/textarea';
import { toast } from 'sonner';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const LeadsTable = ({ currentUser }) => {
  const [leads, setLeads] = useState([]);
  const [users, setUsers] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [filters, setFilters] = useState({
    status: '',
    priority: '',
    search: ''
  });
  const [editData, setEditData] = useState({});
  const [callbackData, setCallbackData] = useState({
    callback_date: '',
    callback_notes: ''
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

  useEffect(() => {
    fetchData();
  }, [filters]);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      const [leadsRes, usersRes, statusesRes] = await Promise.all([
        axios.get(`${API}/crm/leads`, { headers, params: filters }),
        axios.get(`${API}/crm/users`, { headers }),
        axios.get(`${API}/crm/statuses`, { headers })
      ]);

      setLeads(leadsRes.data);
      setUsers(usersRes.data);
      setStatuses(statusesRes.data);
    } catch (error) {
      toast.error('Errore nel caricamento dei dati');
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = async (lead) => {
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
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };
      
      await axios.post(`${API}/leads/submit`, newLead);
      toast.success('Lead creato con successo');
      setShowCreateModal(false);
      setNewLead({
        fullName: '',
        email: '',
        phone: '',
        scammerCompany: '',
        amountLost: '',
        caseDetails: ''
      });
      fetchData();
    } catch (error) {
      toast.error('Errore nella creazione del lead');
    }
  };

  const handleExportCSV = () => {
    if (leads.length === 0) {
      toast.error('Nessun lead da esportare');
      return;
    }

    const csvContent = [
      ['Data', 'Nome', 'Email', 'Telefono', 'Azienda Truffatrice', 'Importo Perso', 'Stato', 'Priorità', 'Dettagli Caso'],
      ...leads.map(lead => [
        new Date(lead.created_at).toLocaleDateString('it-IT'),
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

  const handleSaveEdit = async () => {
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      await axios.put(`${API}/crm/leads/${selectedLead.id}`, editData, { headers });
      toast.success('Lead aggiornato con successo');
      setShowEditModal(false);
      fetchData();
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-3xl font-bold text-black">Gestione Lead</h2>
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
              <th className="text-left text-white p-4 font-semibold">Data</th>
              <th className="text-left text-white p-4 font-semibold">Nome</th>
              <th className="text-left text-white p-4 font-semibold">Email</th>
              <th className="text-left text-white p-4 font-semibold">Importo</th>
              <th className="text-left text-white p-4 font-semibold">Stato</th>
              <th className="text-left text-white p-4 font-semibold">Priorità</th>
              <th className="text-left text-white p-4 font-semibold">Assegnato</th>
              <th className="text-left text-white p-4 font-semibold">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 ? (
              <tr>
                <td colSpan="8" className="text-center p-8 text-gray-600">
                  Nessun lead trovato
                </td>
              </tr>
            ) : (
              leads.map((lead) => (
                <tr key={lead.id} className="border-t border-gray-200 hover:bg-gray-50">
                  <td className="p-4 text-gray-700">
                    {new Date(lead.created_at).toLocaleDateString('it-IT')}
                  </td>
                  <td className="p-4 text-black font-semibold">{lead.fullName}</td>
                  <td className="p-4 text-gray-700">{lead.email}</td>
                  <td className="p-4 text-gray-700">{lead.amountLost}</td>
                  <td className="p-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(lead.status)}`}>
                      {lead.status}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className={`font-semibold ${getPriorityColor(lead.priority)}`}>
                      {lead.priority}
                    </span>
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
                      {(currentUser.role === 'admin' || currentUser.role === 'manager' || currentUser.role === 'supervisor') && (
                        <Button
                          onClick={() => handleAssign(lead)}
                          size="sm"
                          className="bg-green-600 text-white hover:bg-green-700 rounded-none"
                        >
                          <UserPlus className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Detail Modal */}
      {showDetailModal && selectedLead && (
        <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
          <DialogContent className="max-w-2xl bg-white">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-black">Dettagli Lead</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
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
                  <p className="text-black">+39 {selectedLead.phone}</p>
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
                  <p className="text-black">{new Date(selectedLead.created_at).toLocaleString('it-IT')}</p>
                </div>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-600">Dettagli Caso</label>
                <p className="text-black mt-2 p-4 bg-gray-50 border border-gray-200">{selectedLead.caseDetails}</p>
              </div>
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
              {editData.status === 'callback' && (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-black mb-2">Data Callback</label>
                    <Input
                      type="datetime-local"
                      value={editData.callback_date}
                      onChange={(e) => setEditData({ ...editData, callback_date: e.target.value })}
                      className="bg-white border-gray-300 rounded-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-black mb-2">Note Callback</label>
                    <Textarea
                      value={editData.callback_notes}
                      onChange={(e) => setEditData({ ...editData, callback_notes: e.target.value })}
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
    </div>
  );
};

export default LeadsTable;