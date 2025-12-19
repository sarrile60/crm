import React, { useState, useEffect } from 'react';
import { Plus, Edit, Archive, Users, UserCheck, Eye, AlertTriangle, Building2, UserPlus, UserMinus, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Checkbox } from '../ui/checkbox';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const TeamsManagement = () => {
  const { t, i18n } = useTranslation();
  const [teams, setTeams] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [showManageMembersModal, setShowManageMembersModal] = useState(false);
  
  // Selected team
  const [selectedTeam, setSelectedTeam] = useState(null);
  
  // Form data
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    supervisor_id: ''
  });
  
  // Archive reassignment
  const [reassignTeamId, setReassignTeamId] = useState('');
  
  // Filter
  const [showArchived, setShowArchived] = useState(false);
  
  // Member management
  const [selectedUsersToAdd, setSelectedUsersToAdd] = useState([]);
  const [setAsDefault, setSetAsDefault] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      const [teamsRes, usersRes] = await Promise.all([
        axios.get(`${API}/admin/teams`, { headers }),
        axios.get(`${API}/admin/users`, { headers })
      ]);

      setTeams(teamsRes.data);
      setUsers(usersRes.data.filter(u => !u.deleted_at && u.is_active));
    } catch (error) {
      toast.error(t('teams.errorLoadingTeams'));
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  // Get users eligible to be supervisors (admin or supervisor role only)
  const getSupervisorEligibleUsers = () => {
    return users.filter(u => 
      u.role?.toLowerCase() === 'admin' || 
      u.role?.toLowerCase() === 'supervisor'
    );
  };

  // Get team members
  const getTeamMembers = (teamId) => {
    return users.filter(u => 
      u.team_id === teamId || 
      (u.team_ids && u.team_ids.includes(teamId))
    );
  };

  // Get supervisor name
  const getSupervisorName = (supervisorId) => {
    const supervisor = users.find(u => u.id === supervisorId);
    return supervisor ? supervisor.full_name : t('common.none');
  };

  const handleCreateTeam = async () => {
    if (!formData.name) {
      toast.error(t('teams.teamNameRequired'));
      return;
    }

    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      await axios.post(`${API}/admin/teams`, formData, { headers });
      toast.success(t('teams.teamCreatedSuccess'));
      setShowCreateModal(false);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('teams.errorCreatingTeam'));
    }
  };

  const handleEditTeam = async () => {
    if (!formData.name) {
      toast.error(t('teams.teamNameRequired'));
      return;
    }

    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      await axios.put(`${API}/admin/teams/${selectedTeam.id}`, formData, { headers });
      toast.success(t('teams.teamUpdatedSuccess'));
      setShowEditModal(false);
      setSelectedTeam(null);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('teams.errorUpdatingTeam'));
    }
  };

  const handleArchiveTeam = async () => {
    if (!selectedTeam) return;

    const members = getTeamMembers(selectedTeam.id);
    
    // If team has members, require reassignment
    if (members.length > 0 && !reassignTeamId) {
      toast.error(t('teams.selectNewTeam'));
      return;
    }

    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      await axios.delete(`${API}/admin/teams/${selectedTeam.id}`, { 
        headers,
        data: { reassign_to_team_id: reassignTeamId || null }
      });
      toast.success(t('teams.teamArchivedSuccess'));
      setShowArchiveModal(false);
      setSelectedTeam(null);
      setReassignTeamId('');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('teams.errorArchivingTeam'));
    }
  };

  const openEditModal = (team) => {
    setSelectedTeam(team);
    setFormData({
      name: team.name,
      description: team.description || '',
      supervisor_id: team.supervisor_id || ''
    });
    setShowEditModal(true);
  };

  const openArchiveModal = (team) => {
    setSelectedTeam(team);
    setReassignTeamId('');
    setShowArchiveModal(true);
  };

  const openMembersModal = (team) => {
    setSelectedTeam(team);
    setShowMembersModal(true);
  };

  const openManageMembersModal = (team) => {
    setSelectedTeam(team);
    setSelectedUsersToAdd([]);
    setSetAsDefault(true);
    setShowManageMembersModal(true);
  };

  // Get users NOT in this team
  const getAvailableUsersForTeam = (teamId) => {
    return users.filter(u => 
      !u.deleted_at && 
      u.is_active &&
      u.team_id !== teamId &&
      (!u.team_ids || !u.team_ids.includes(teamId))
    );
  };

  const handleAddMembersToTeam = async () => {
    if (!selectedTeam || selectedUsersToAdd.length === 0) {
      toast.error(t('teams.selectAtLeastOneUser'));
      return;
    }

    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      await axios.post(`${API}/admin/teams/${selectedTeam.id}/members`, {
        user_ids: selectedUsersToAdd,
        set_as_default: setAsDefault
      }, { headers });

      toast.success(t('teams.membersAddedSuccess', { count: selectedUsersToAdd.length }));
      setSelectedUsersToAdd([]);
      setShowManageMembersModal(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('teams.errorAddingMembers'));
    }
  };

  const handleRemoveMemberFromTeam = async (userId) => {
    if (!selectedTeam) return;

    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      await axios.delete(`${API}/admin/teams/${selectedTeam.id}/members/${userId}`, { headers });

      toast.success(t('teams.memberRemovedSuccess'));
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('teams.errorRemovingMember'));
    }
  };

  const toggleUserSelection = (userId) => {
    setSelectedUsersToAdd(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      supervisor_id: ''
    });
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  // Filter teams based on archived status
  const filteredTeams = teams.filter(team => 
    showArchived ? team.archived_at : !team.archived_at
  );

  // Get available teams for reassignment (exclude selected team and archived teams)
  const getReassignmentTeams = () => {
    return teams.filter(t => 
      t.id !== selectedTeam?.id && !t.archived_at
    );
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-600">{t('teams.loadingTeams')}</div>;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-black">{t('teams.title')}</h2>
          <p className="text-gray-600 mt-1">{t('teams.subtitle')}</p>
        </div>
        <div className="flex gap-3">
          <Button
            onClick={() => setShowArchived(!showArchived)}
            variant="outline"
            className={`rounded-none border-2 ${showArchived ? 'border-orange-500 text-orange-600' : 'border-gray-300'}`}
          >
            <Archive className="w-4 h-4 mr-2" />
            {showArchived ? t('teams.hideArchived') : t('teams.showArchived')}
          </Button>
          <Button 
            onClick={() => { resetForm(); setShowCreateModal(true); }}
            className="bg-[#D4AF37] hover:bg-[#B8941F] text-black rounded-none"
          >
            <Plus className="w-4 h-4 mr-2" />
            {t('teams.createTeam')}
          </Button>
        </div>
      </div>

      {/* Teams Table */}
      <div className="bg-white border-2 border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-black text-white">
              <tr>
                <th className="text-left p-4 font-semibold">{t('users.team')}</th>
                <th className="text-left p-4 font-semibold">{t('common.description')}</th>
                <th className="text-left p-4 font-semibold">{t('teams.supervisor')}</th>
                <th className="text-left p-4 font-semibold">{t('teams.members')}</th>
                <th className="text-left p-4 font-semibold">{t('common.status')}</th>
                <th className="text-left p-4 font-semibold">{t('teams.createdAt')}</th>
                <th className="text-left p-4 font-semibold">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredTeams.length === 0 ? (
                <tr>
                  <td colSpan="7" className="p-8 text-center text-gray-500">
                    {t('teams.noTeamsFound')}
                  </td>
                </tr>
              ) : (
                filteredTeams.map(team => {
                  const memberCount = getTeamMembers(team.id).length;
                  return (
                    <tr key={team.id} className="border-t border-gray-200 hover:bg-gray-50">
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-5 h-5 text-blue-600" />
                          <span className="font-semibold text-black">{team.name}</span>
                        </div>
                      </td>
                      <td className="p-4 text-gray-600 max-w-xs truncate">
                        {team.description || <span className="text-gray-400 italic">{t('common.none')}</span>}
                      </td>
                      <td className="p-4">
                        {team.supervisor_id ? (
                          <span className="flex items-center gap-1 text-blue-700">
                            <UserCheck className="w-4 h-4" />
                            {getSupervisorName(team.supervisor_id)}
                          </span>
                        ) : (
                          <span className="text-gray-400">{t('common.none')}</span>
                        )}
                      </td>
                      <td className="p-4">
                        <button
                          onClick={() => openMembersModal(team)}
                          className="flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          <Users className="w-4 h-4" />
                          {memberCount} {t('teams.members')}
                        </button>
                      </td>
                      <td className="p-4">
                        {team.archived_at ? (
                          <span className="px-2 py-1 bg-gray-200 text-gray-600 text-xs font-semibold rounded">
                            {t('teams.archived')}
                          </span>
                        ) : (
                          <span className="px-2 py-1 bg-green-100 text-green-600 text-xs font-semibold rounded">
                            {t('common.active')}
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-gray-600 text-sm">
                        {formatDate(team.created_at)}
                      </td>
                      <td className="p-4">
                        <div className="flex gap-2">
                          <Button
                            onClick={() => openMembersModal(team)}
                            size="sm"
                            className="bg-blue-600 text-white hover:bg-blue-700 rounded-none"
                            title={t('teams.viewMembers')}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          {!team.archived_at && (
                            <>
                              <Button
                                onClick={() => openEditModal(team)}
                                size="sm"
                                className="bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none"
                                title={t('common.edit')}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                onClick={() => openArchiveModal(team)}
                                size="sm"
                                className="bg-red-600 text-white hover:bg-red-700 rounded-none"
                                title={t('teams.archiveTeam')}
                              >
                                <Archive className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stats */}
      <div className="mt-4 text-sm text-gray-600">
        {t('common.total')}: {teams.length} | 
        {t('common.active')}: {teams.filter(t => !t.archived_at).length} | 
        {t('teams.archived')}: {teams.filter(t => t.archived_at).length}
      </div>

      {/* Create Team Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-lg bg-white">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-black">{t('teams.createTeam')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <label className="block text-sm font-semibold text-black mb-2">{t('teams.teamName')} *</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Sales Team North"
                className="bg-white border-gray-300 rounded-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-black mb-2">{t('common.description')}</label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder=""
                className="bg-white border-gray-300 rounded-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-black mb-2">{t('teams.supervisor')}</label>
              <Select 
                value={formData.supervisor_id || 'none'} 
                onValueChange={(value) => setFormData({ ...formData, supervisor_id: value === 'none' ? '' : value })}
              >
                <SelectTrigger className="bg-white border-gray-300 rounded-none">
                  <SelectValue placeholder={t('teams.selectSupervisor')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('common.none')}</SelectItem>
                  {getSupervisorEligibleUsers().map(user => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.full_name} ({user.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3 pt-4">
              <Button 
                onClick={() => setShowCreateModal(false)}
                className="flex-1 bg-gray-200 text-black hover:bg-gray-300 rounded-none"
              >
                {t('common.cancel')}
              </Button>
              <Button 
                onClick={handleCreateTeam}
                className="flex-1 bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none"
              >
                {t('teams.createTeam')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Team Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-lg bg-white">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-black">{t('teams.editTeam')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <label className="block text-sm font-semibold text-black mb-2">{t('teams.teamName')} *</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="bg-white border-gray-300 rounded-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-black mb-2">{t('common.description')}</label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="bg-white border-gray-300 rounded-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-black mb-2">{t('teams.supervisor')}</label>
              <Select 
                value={formData.supervisor_id || 'none'} 
                onValueChange={(value) => setFormData({ ...formData, supervisor_id: value === 'none' ? '' : value })}
              >
                <SelectTrigger className="bg-white border-gray-300 rounded-none">
                  <SelectValue placeholder={t('teams.selectSupervisor')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('common.none')}</SelectItem>
                  {getSupervisorEligibleUsers().map(user => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.full_name} ({user.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3 pt-4">
              <Button 
                onClick={() => setShowEditModal(false)}
                className="flex-1 bg-gray-200 text-black hover:bg-gray-300 rounded-none"
              >
                {t('common.cancel')}
              </Button>
              <Button 
                onClick={handleEditTeam}
                className="flex-1 bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none"
              >
                {t('common.saveChanges')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Archive Team Modal */}
      <Dialog open={showArchiveModal} onOpenChange={setShowArchiveModal}>
        <DialogContent className="max-w-lg bg-white">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-red-600 flex items-center gap-2">
              <AlertTriangle className="w-6 h-6" />
              {t('teams.archiveTeam')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <p className="text-gray-700">
              {t('teams.archiveWarning')} <strong>{selectedTeam?.name}</strong>?
            </p>
            
            {selectedTeam && getTeamMembers(selectedTeam.id).length > 0 ? (
              <div className="bg-yellow-50 border border-yellow-200 p-4 rounded">
                <p className="text-yellow-800 font-semibold mb-3">
                  ⚠️ {getTeamMembers(selectedTeam.id).length} {t('teams.membersWillBeReassigned')}
                </p>
                <p className="text-sm text-yellow-700 mb-3">
                  {t('teams.selectNewTeam')}:
                </p>
                <Select 
                  value={reassignTeamId || 'select'} 
                  onValueChange={(value) => setReassignTeamId(value === 'select' ? '' : value)}
                >
                  <SelectTrigger className="bg-white border-yellow-300 rounded-none">
                    <SelectValue placeholder={t('teams.selectNewTeam')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="select">-- {t('users.selectTeam')} --</SelectItem>
                    {getReassignmentTeams().map(team => (
                      <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="mt-3 text-xs text-yellow-700">
                  <strong>{t('teams.members')}:</strong>
                  <ul className="mt-1 ml-4 list-disc">
                    {getTeamMembers(selectedTeam.id).slice(0, 5).map(member => (
                      <li key={member.id}>{member.full_name}</li>
                    ))}
                    {getTeamMembers(selectedTeam.id).length > 5 && (
                      <li>... + {getTeamMembers(selectedTeam.id).length - 5}</li>
                    )}
                  </ul>
                </div>
              </div>
            ) : (
              <div className="bg-gray-50 border border-gray-200 p-3 rounded">
                <p className="text-sm text-gray-600">
                  {t('teams.noMembersInTeam')}
                </p>
              </div>
            )}
            
            <div className="flex gap-3 pt-4">
              <Button 
                onClick={() => setShowArchiveModal(false)}
                className="flex-1 bg-gray-200 text-black hover:bg-gray-300 rounded-none"
              >
                {t('common.cancel')}
              </Button>
              <Button 
                onClick={handleArchiveTeam}
                disabled={selectedTeam && getTeamMembers(selectedTeam.id).length > 0 && !reassignTeamId}
                className="flex-1 bg-red-600 text-white hover:bg-red-700 rounded-none disabled:opacity-50"
              >
                <Archive className="w-4 h-4 mr-2" />
                {t('teams.archiveTeam')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Members Modal */}
      <Dialog open={showMembersModal} onOpenChange={setShowMembersModal}>
        <DialogContent className="max-w-2xl bg-white">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-black flex items-center gap-2">
              <Users className="w-6 h-6 text-blue-600" />
              {t('teams.members')}: {selectedTeam?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            {/* Add Members Button */}
            {selectedTeam && !selectedTeam.archived_at && (
              <div className="mb-4">
                <Button 
                  onClick={() => {
                    setShowMembersModal(false);
                    openManageMembersModal(selectedTeam);
                  }}
                  className="bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none"
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  {t('common.add')} {t('teams.members')}
                </Button>
              </div>
            )}
            
            {selectedTeam && getTeamMembers(selectedTeam.id).length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                {t('teams.noMembersInTeam')}
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr>
                      <th className="text-left p-3 font-semibold">{t('common.name')}</th>
                      <th className="text-left p-3 font-semibold">{t('users.usernameLabel')}</th>
                      <th className="text-left p-3 font-semibold">{t('users.role')}</th>
                      <th className="text-left p-3 font-semibold">{t('teams.defaultTeam')}</th>
                      <th className="text-left p-3 font-semibold">{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedTeam && getTeamMembers(selectedTeam.id).map(member => (
                      <tr key={member.id} className="border-t border-gray-200 hover:bg-gray-50">
                        <td className="p-3">
                          <span className="font-medium">{member.full_name}</span>
                          {member.id === selectedTeam.supervisor_id && (
                            <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">
                              {t('teams.supervisor')}
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-gray-600">@{member.username}</td>
                        <td className="p-3">
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${
                            member.role === 'admin' ? 'bg-red-100 text-red-700' :
                            member.role === 'supervisor' ? 'bg-blue-100 text-blue-700' :
                            'bg-green-100 text-green-700'
                          }`}>
                            {member.role}
                          </span>
                        </td>
                        <td className="p-3">
                          {member.default_team_id === selectedTeam.id || member.team_id === selectedTeam.id ? (
                            <span className="text-green-600">✓ {t('common.yes')}</span>
                          ) : (
                            <span className="text-gray-400">{t('common.no')}</span>
                          )}
                        </td>
                        <td className="p-3">
                          {!selectedTeam.archived_at && (
                            <Button
                              onClick={() => handleRemoveMemberFromTeam(member.id)}
                              size="sm"
                              className="bg-red-600 text-white hover:bg-red-700 rounded-none"
                              title={t('teams.removeFromTeam')}
                            >
                              <UserMinus className="w-4 h-4" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex justify-end mt-4">
              <Button 
                onClick={() => setShowMembersModal(false)}
                className="bg-gray-200 text-black hover:bg-gray-300 rounded-none"
              >
                {t('common.close')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Manage Members Modal - Add Users to Team */}
      <Dialog open={showManageMembersModal} onOpenChange={setShowManageMembersModal}>
        <DialogContent className="max-w-2xl bg-white">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-black flex items-center gap-2">
              <UserPlus className="w-6 h-6 text-green-600" />
              {t('teams.addMembersToTeam')}: {selectedTeam?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            {/* Options */}
            <div className="mb-4 flex items-center gap-2">
              <Checkbox
                id="setAsDefault"
                checked={setAsDefault}
                onCheckedChange={(checked) => setSetAsDefault(checked)}
              />
              <label htmlFor="setAsDefault" className="text-sm text-gray-700">
                {t('teams.setAsDefaultTeam')}
              </label>
            </div>

            {/* Available Users List */}
            <div className="border border-gray-200 rounded max-h-80 overflow-y-auto">
              {selectedTeam && getAvailableUsersForTeam(selectedTeam.id).length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  {t('teams.allUsersAlreadyMembers')}
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr>
                      <th className="text-left p-3 font-semibold w-12">
                        <Checkbox
                          checked={selectedTeam && selectedUsersToAdd.length === getAvailableUsersForTeam(selectedTeam.id).length && selectedUsersToAdd.length > 0}
                          onCheckedChange={(checked) => {
                            if (checked && selectedTeam) {
                              setSelectedUsersToAdd(getAvailableUsersForTeam(selectedTeam.id).map(u => u.id));
                            } else {
                              setSelectedUsersToAdd([]);
                            }
                          }}
                        />
                      </th>
                      <th className="text-left p-3 font-semibold">{t('common.name')}</th>
                      <th className="text-left p-3 font-semibold">{t('users.role')}</th>
                      <th className="text-left p-3 font-semibold">{t('teams.currentTeam')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedTeam && getAvailableUsersForTeam(selectedTeam.id).map(user => (
                      <tr 
                        key={user.id} 
                        className={`border-t border-gray-200 hover:bg-gray-50 cursor-pointer ${
                          selectedUsersToAdd.includes(user.id) ? 'bg-green-50' : ''
                        }`}
                        onClick={() => toggleUserSelection(user.id)}
                      >
                        <td className="p-3">
                          <Checkbox
                            checked={selectedUsersToAdd.includes(user.id)}
                            onCheckedChange={() => toggleUserSelection(user.id)}
                          />
                        </td>
                        <td className="p-3">
                          <div>
                            <span className="font-medium">{user.full_name}</span>
                            <span className="text-gray-500 text-sm ml-2">@{user.username}</span>
                          </div>
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${
                            user.role === 'admin' ? 'bg-red-100 text-red-700' :
                            user.role === 'supervisor' ? 'bg-blue-100 text-blue-700' :
                            'bg-green-100 text-green-700'
                          }`}>
                            {user.role}
                          </span>
                        </td>
                        <td className="p-3 text-gray-600 text-sm">
                          {user.team_id ? (
                            teams.find(t => t.id === user.team_id)?.name || 'N/A'
                          ) : (
                            <span className="text-gray-400">{t('common.none')}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Selected count */}
            {selectedUsersToAdd.length > 0 && (
              <div className="mt-3 text-sm text-green-600 font-medium">
                {selectedUsersToAdd.length} {t('teams.usersSelected')}
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <Button 
                onClick={() => setShowManageMembersModal(false)}
                className="flex-1 bg-gray-200 text-black hover:bg-gray-300 rounded-none"
              >
                {t('common.cancel')}
              </Button>
              <Button 
                onClick={handleAddMembersToTeam}
                disabled={selectedUsersToAdd.length === 0}
                className="flex-1 bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none disabled:opacity-50"
              >
                <UserPlus className="w-4 h-4 mr-2" />
                {t('common.add')} {selectedUsersToAdd.length > 0 ? `(${selectedUsersToAdd.length})` : ''}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TeamsManagement;
