import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, Phone, Mail, Clock, CheckCircle, XCircle, ChevronDown, FileText, X, User } from 'lucide-react';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const TeamMembers = ({ currentUser }) => {
  const { t } = useTranslation();
  const [teams, setTeams] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [memberStats, setMemberStats] = useState({});
  const [showTeamDropdown, setShowTeamDropdown] = useState(false);
  
  // New state for viewing member leads
  const [selectedMember, setSelectedMember] = useState(null);
  const [memberLeads, setMemberLeads] = useState([]);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [showLeadsModal, setShowLeadsModal] = useState(false);

  // Fetch all teams this supervisor manages
  const fetchTeams = useCallback(async () => {
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      // Get teams that this supervisor manages
      const teamsRes = await axios.get(`${API}/chat/teams`, { headers });
      const fetchedTeams = teamsRes.data.teams || [];
      
      setTeams(fetchedTeams);
      
      // Select first team by default if none selected
      if (fetchedTeams.length > 0 && !selectedTeam) {
        setSelectedTeam(fetchedTeams[0]);
      }
    } catch (error) {
      console.error('Error fetching teams:', error);
    }
  }, [selectedTeam]);

  // Fetch team members with real-time status
  const fetchMembersStatus = useCallback(async () => {
    if (!selectedTeam) return;
    
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      // Use the new real-time status endpoint
      const statusRes = await axios.get(`${API}/crm/team-members-status`, { headers });
      const allMembers = statusRes.data.members || [];
      
      // Filter members for selected team
      const teamMembers = allMembers.filter(m => m.team_id === selectedTeam.id);
      setMembers(teamMembers);
      
      // Update teams list from response
      if (statusRes.data.teams && statusRes.data.teams.length > 0) {
        setTeams(statusRes.data.teams);
      }
    } catch (error) {
      console.error('Error fetching members status:', error);
    }
  }, [selectedTeam]);

  // Fetch stats for members
  const fetchMemberStats = useCallback(async () => {
    if (members.length === 0) return;
    
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };
      
      const stats = {};
      for (const member of members) {
        try {
          const statsRes = await axios.get(`${API}/crm/user-stats/${member.id}`, { headers });
          stats[member.id] = statsRes.data;
        } catch (e) {
          stats[member.id] = { total_leads: 0, completed_today: 0 };
        }
      }
      setMemberStats(stats);
    } catch (error) {
      console.error('Error fetching member stats:', error);
    }
  }, [members]);

  // Fetch leads for a specific member
  const fetchMemberLeads = async (member) => {
    setSelectedMember(member);
    setLoadingLeads(true);
    setShowLeadsModal(true);
    
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };
      
      // Fetch all leads and filter by assigned_to
      const leadsRes = await axios.get(`${API}/crm/leads`, { headers });
      const allLeads = leadsRes.data || [];
      
      // Filter leads assigned to this member
      const agentLeads = allLeads.filter(lead => lead.assigned_to === member.id);
      setMemberLeads(agentLeads);
    } catch (error) {
      console.error('Error fetching member leads:', error);
      setMemberLeads([]);
    } finally {
      setLoadingLeads(false);
    }
  };

  // Initial load
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await fetchTeams();
      setLoading(false);
    };
    init();
  }, []);

  // Fetch members when team changes
  useEffect(() => {
    if (selectedTeam) {
      fetchMembersStatus();
    }
  }, [selectedTeam, fetchMembersStatus]);

  // Fetch stats when members change
  useEffect(() => {
    fetchMemberStats();
  }, [members.length, fetchMemberStats]);

  // Poll for real-time status updates every 30 seconds
  useEffect(() => {
    if (!selectedTeam) return;
    
    const interval = setInterval(() => {
      fetchMembersStatus();
    }, 30000); // Every 30 seconds
    
    return () => clearInterval(interval);
  }, [selectedTeam, fetchMembersStatus]);

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'active': return 'bg-green-100 text-green-800 border-green-300';
      case 'inactive': return 'bg-red-100 text-red-800 border-red-300';
      case 'away': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getRoleColor = (role) => {
    switch (role?.toLowerCase()) {
      case 'supervisor': return 'bg-purple-100 text-purple-800';
      case 'agent': return 'bg-blue-100 text-blue-800';
      case 'admin': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getLeadStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'new': return 'bg-blue-100 text-blue-800';
      case 'callback': return 'bg-yellow-100 text-yellow-800';
      case 'potential callback': return 'bg-orange-100 text-orange-800';
      case 'won': return 'bg-green-100 text-green-800';
      case 'lost': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatLastActive = (lastActive) => {
    if (!lastActive) return t('team.neverActive');
    
    const date = new Date(lastActive);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffMins < 2) return t('team.justNow');
    if (diffMins < 60) return t('team.minutesAgo', { count: diffMins });
    if (diffHours < 24) return t('team.hoursAgo', { count: diffHours });
    return t('team.daysAgo', { count: diffDays });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#D4AF37]"></div>
      </div>
    );
  }

  if (teams.length === 0) {
    return (
      <div className="bg-white border-2 border-gray-200 p-8 text-center">
        <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-600 mb-2">{t('team.noTeamAssigned')}</h2>
        <p className="text-gray-500">{t('team.noTeamDescription')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Team Header with Selector */}
      <div className="bg-[#1a1a2e] text-white p-6 border-2 border-[#D4AF37]">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            {/* Team Selector */}
            {teams.length > 1 ? (
              <div className="relative">
                <button
                  onClick={() => setShowTeamDropdown(!showTeamDropdown)}
                  className="flex items-center gap-3 text-left hover:bg-white/10 p-2 rounded transition-colors"
                >
                  <Users className="w-8 h-8 text-[#D4AF37]" />
                  <div>
                    <div className="text-2xl font-bold flex items-center gap-2">
                      {selectedTeam?.name}
                      <ChevronDown className={`w-5 h-5 transition-transform ${showTeamDropdown ? 'rotate-180' : ''}`} />
                    </div>
                    <p className="text-sm text-gray-400">{t('team.clickToSwitch')}</p>
                  </div>
                </button>
                
                {/* Dropdown */}
                {showTeamDropdown && (
                  <div className="absolute top-full left-0 mt-2 bg-white text-black border-2 border-[#D4AF37] shadow-lg z-10 min-w-[250px]">
                    {teams.map(team => (
                      <button
                        key={team.id}
                        onClick={() => {
                          setSelectedTeam(team);
                          setShowTeamDropdown(false);
                        }}
                        className={`w-full p-3 text-left hover:bg-gray-100 flex items-center gap-3 ${
                          selectedTeam?.id === team.id ? 'bg-[#D4AF37]/10 border-l-4 border-[#D4AF37]' : ''
                        }`}
                      >
                        <Users className="w-5 h-5 text-[#1a1a2e]" />
                        <div>
                          <div className="font-semibold">{team.name}</div>
                          <div className="text-xs text-gray-500">
                            {team.member_count || 0} {t('team.members')}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Users className="w-8 h-8 text-[#D4AF37]" />
                <div>
                  <h1 className="text-2xl font-bold">{selectedTeam?.name}</h1>
                  <p className="text-gray-300 mt-1">{selectedTeam?.description || t('team.defaultDescription')}</p>
                </div>
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-[#D4AF37]">{members.length}</div>
            <div className="text-sm text-gray-400">{t('team.members')}</div>
            {teams.length > 1 && (
              <div className="text-xs text-gray-500 mt-1">
                {teams.length} {t('team.teamsTotal')}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Real-time Status Indicator */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
        {t('team.liveStatus')}
        <span className="text-xs text-gray-400 ml-2">• {t('team.clickToViewLeads')}</span>
      </div>

      {/* Members Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {members.map(member => {
          const stats = memberStats[member.id] || {};
          const isActive = member.status === 'active';
          
          return (
            <div 
              key={member.id} 
              onClick={() => fetchMemberLeads(member)}
              className={`bg-white border-2 transition-all cursor-pointer hover:shadow-lg ${
                isActive ? 'border-green-300 shadow-green-100 shadow-md hover:border-green-400' : 'border-gray-200 hover:border-[#D4AF37]'
              }`}
            >
              {/* Member Header */}
              <div className={`p-4 border-b ${isActive ? 'bg-green-50' : 'bg-gray-50'}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white text-xl font-bold relative ${
                    isActive ? 'bg-green-500' : 'bg-gray-400'
                  }`}>
                    {member.full_name?.charAt(0) || '?'}
                    {/* Online indicator dot */}
                    {isActive && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-500 border-2 border-white rounded-full animate-pulse"></div>
                    )}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-lg">{member.full_name}</h3>
                    <p className="text-sm text-gray-500">@{member.username}</p>
                  </div>
                  <div className={`px-3 py-1 text-xs font-semibold rounded-full border ${getStatusColor(member.status)}`}>
                    {isActive ? (
                      <><CheckCircle className="w-3 h-3 inline mr-1" />{t('users.active')}</>
                    ) : (
                      <><XCircle className="w-3 h-3 inline mr-1" />{t('users.inactive')}</>
                    )}
                  </div>
                </div>
              </div>

              {/* Member Details */}
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${getRoleColor(member.role)}`}>
                    {t(`users.roles.${member.role}`) || member.role}
                  </span>
                </div>
                
                {member.email && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Mail className="w-4 h-4" />
                    <span className="truncate">{member.email}</span>
                  </div>
                )}
                
                {member.phone && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Phone className="w-4 h-4" />
                    <span>{member.phone}</span>
                  </div>
                )}

                {/* Stats */}
                <div className="pt-3 border-t grid grid-cols-2 gap-2 text-center">
                  <div className="bg-gray-50 p-2 rounded">
                    <div className="text-lg font-bold text-[#1a1a2e]">{stats.total_leads || 0}</div>
                    <div className="text-xs text-gray-500">{t('team.totalLeads')}</div>
                  </div>
                  <div className="bg-gray-50 p-2 rounded">
                    <div className="text-lg font-bold text-green-600">{stats.completed_today || 0}</div>
                    <div className="text-xs text-gray-500">{t('team.completedToday')}</div>
                  </div>
                </div>

                {/* Last Activity - with real-time indicator */}
                <div className={`flex items-center gap-2 text-xs pt-2 ${isActive ? 'text-green-600' : 'text-gray-400'}`}>
                  <Clock className="w-3 h-3" />
                  {t('team.lastActive')}: {formatLastActive(member.last_active)}
                </div>
                
                {/* View Leads hint */}
                <div className="text-center pt-2">
                  <span className="text-xs text-[#D4AF37] flex items-center justify-center gap-1">
                    <FileText className="w-3 h-3" />
                    {t('team.clickToViewLeads')}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {members.length === 0 && selectedTeam && (
        <div className="bg-white border-2 border-gray-200 p-8 text-center">
          <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-600 mb-2">{t('team.noMembers')}</h2>
          <p className="text-gray-500">{t('team.noMembersDescription')}</p>
        </div>
      )}

      {/* Member Leads Modal */}
      <Dialog open={showLeadsModal} onOpenChange={setShowLeadsModal}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden bg-white">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-3">
              <User className="w-6 h-6 text-[#D4AF37]" />
              {selectedMember?.full_name} - {t('team.agentLeads')}
            </DialogTitle>
          </DialogHeader>
          
          <div className="overflow-y-auto max-h-[60vh]">
            {loadingLeads ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#D4AF37]"></div>
              </div>
            ) : memberLeads.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>{t('team.noLeadsAssigned')}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Summary Stats */}
                <div className="grid grid-cols-4 gap-3 mb-4">
                  <div className="bg-blue-50 p-3 rounded text-center">
                    <div className="text-2xl font-bold text-blue-600">{memberLeads.length}</div>
                    <div className="text-xs text-gray-600">{t('team.totalLeads')}</div>
                  </div>
                  <div className="bg-yellow-50 p-3 rounded text-center">
                    <div className="text-2xl font-bold text-yellow-600">
                      {memberLeads.filter(l => l.status === 'Callback' || l.status === 'Potential Callback').length}
                    </div>
                    <div className="text-xs text-gray-600">{t('leads.callbacks')}</div>
                  </div>
                  <div className="bg-green-50 p-3 rounded text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {memberLeads.filter(l => l.status === 'Won').length}
                    </div>
                    <div className="text-xs text-gray-600">{t('leads.won')}</div>
                  </div>
                  <div className="bg-red-50 p-3 rounded text-center">
                    <div className="text-2xl font-bold text-red-600">
                      {memberLeads.filter(l => l.status === 'Lost').length}
                    </div>
                    <div className="text-xs text-gray-600">{t('leads.lost')}</div>
                  </div>
                </div>

                {/* Leads List */}
                <div className="border rounded">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="p-3 text-left font-semibold">{t('common.name')}</th>
                        <th className="p-3 text-left font-semibold">{t('common.phone')}</th>
                        <th className="p-3 text-left font-semibold">{t('common.status')}</th>
                        <th className="p-3 text-left font-semibold">{t('crm.amountLost')}</th>
                        <th className="p-3 text-left font-semibold">{t('leads.callbackDate')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {memberLeads.map(lead => (
                        <tr key={lead.id} className="border-t hover:bg-gray-50">
                          <td className="p-3 font-medium">{lead.fullName}</td>
                          <td className="p-3 text-gray-600">{lead.phone}</td>
                          <td className="p-3">
                            <span className={`px-2 py-1 rounded text-xs font-semibold ${getLeadStatusColor(lead.status)}`}>
                              {lead.status}
                            </span>
                          </td>
                          <td className="p-3 text-gray-600">{lead.amountLost || '-'}</td>
                          <td className="p-3 text-gray-600">
                            {lead.callback_date ? new Date(lead.callback_date).toLocaleString() : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TeamMembers;
