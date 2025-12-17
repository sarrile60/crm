import React, { useState, useEffect } from 'react';
import { Save, RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { toast } from 'sonner';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/admin`;

const PermissionMatrix = () => {
  const [roles, setRoles] = useState([]);
  const [selectedRole, setSelectedRole] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [originalPermissions, setOriginalPermissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    fetchRoles();
  }, []);

  useEffect(() => {
    if (selectedRole) {
      fetchPermissions();
    }
  }, [selectedRole]);

  const fetchRoles = async () => {
    try {
      const token = localStorage.getItem('crmToken');
      const response = await axios.get(`${API}/roles`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRoles(response.data);
      if (response.data.length > 0 && !selectedRole) {
        setSelectedRole(response.data[0].id);
      }
    } catch (error) {
      toast.error('Error loading roles');
      console.error('Error:', error);
    }
  };

  const fetchPermissions = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('crmToken');
      const response = await axios.get(`${API}/roles/${selectedRole}/permissions`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPermissions(response.data.permissions);
      setOriginalPermissions(JSON.parse(JSON.stringify(response.data.permissions)));
      setHasChanges(false);
    } catch (error) {
      toast.error('Error loading permissions');
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const updatePermission = (entityIndex, action, value) => {
    const newPermissions = [...permissions];
    newPermissions[entityIndex][action] = value;
    setPermissions(newPermissions);
    setHasChanges(true);
  };

  const savePermissions = async () => {
    try {
      setSaving(true);
      const token = localStorage.getItem('crmToken');
      
      // Build permissions array for bulk update
      const permissionsToSave = [];
      permissions.forEach(entityPerm => {
        ['read', 'create', 'edit', 'delete', 'assign', 'export'].forEach(action => {
          permissionsToSave.push({
            entity: entityPerm.entity,
            action: action,
            scope: entityPerm[action]
          });
        });
      });

      await axios.put(
        `${API}/roles/${selectedRole}/permissions`,
        {
          role_id: selectedRole,
          permissions: permissionsToSave
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success('Permissions saved successfully');
      setOriginalPermissions(JSON.parse(JSON.stringify(permissions)));
      setHasChanges(false);
    } catch (error) {
      toast.error('Error saving permissions');
      console.error('Error:', error);
    } finally {
      setSaving(false);
    }
  };

  const resetChanges = () => {
    setPermissions(JSON.parse(JSON.stringify(originalPermissions)));
    setHasChanges(false);
  };

  const selectedRoleData = roles.find(r => r.id === selectedRole);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-black">Permission Matrix</h2>
          <p className="text-gray-600 mt-1">Configure entity-level permissions for each role</p>
        </div>
        <div className="flex items-center gap-3">
          {hasChanges && (
            <>
              <Button
                onClick={resetChanges}
                className="bg-gray-200 hover:bg-gray-300 text-black rounded-none"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Reset
              </Button>
              <Button
                onClick={savePermissions}
                disabled={saving}
                className="bg-[#D4AF37] hover:bg-[#B8941F] text-black rounded-none"
              >
                <Save className="w-4 h-4 mr-2" />
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Role Selector */}
      <div className="bg-white border-2 border-gray-200 p-6 mb-6">
        <label className="block text-sm font-semibold text-black mb-3">Select Role</label>
        <Select value={selectedRole} onValueChange={setSelectedRole}>
          <SelectTrigger className="bg-white border-gray-300 rounded-none max-w-md">
            <SelectValue placeholder="Choose a role" />
          </SelectTrigger>
          <SelectContent>
            {roles.map(role => (
              <SelectItem key={role.id} value={role.id}>
                {role.name}
                {role.is_system && <span className="text-gray-500 ml-2">(System)</span>}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedRoleData && (
          <p className="text-sm text-gray-600 mt-2">
            {selectedRoleData.description || 'No description'}
          </p>
        )}
      </div>

      {/* Permission Matrix Grid */}
      {loading ? (
        <div className="text-center py-8 text-gray-600">Loading permissions...</div>
      ) : permissions.length === 0 ? (
        <div className="text-center py-8 text-gray-500">No entities configured</div>
      ) : (
        <div className="bg-white border-2 border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-black text-white">
                <tr>
                  <th className="text-left p-4 font-semibold min-w-[150px]">Entity</th>
                  <th className="text-center p-4 font-semibold w-[150px]">Read</th>
                  <th className="text-center p-4 font-semibold w-[120px]">Create</th>
                  <th className="text-center p-4 font-semibold w-[150px]">Edit</th>
                  <th className="text-center p-4 font-semibold w-[150px]">Delete</th>
                  <th className="text-center p-4 font-semibold w-[120px]">Assign</th>
                  <th className="text-center p-4 font-semibold w-[120px]">Export</th>
                </tr>
              </thead>
              <tbody>
                {permissions.map((entityPerm, idx) => (
                  <tr key={entityPerm.entity} className="border-t border-gray-200 hover:bg-gray-50">
                    <td className="p-4 font-semibold text-black">
                      {entityPerm.display_name || entityPerm.entity}
                    </td>
                    
                    {/* Read */}
                    <td className="p-4">
                      <ScopeDropdown
                        value={entityPerm.read}
                        onChange={(value) => updatePermission(idx, 'read', value)}
                        type="scope"
                      />
                    </td>
                    
                    {/* Create */}
                    <td className="p-4">
                      <ScopeDropdown
                        value={entityPerm.create}
                        onChange={(value) => updatePermission(idx, 'create', value)}
                        type="yesno"
                      />
                    </td>
                    
                    {/* Edit */}
                    <td className="p-4">
                      <ScopeDropdown
                        value={entityPerm.edit}
                        onChange={(value) => updatePermission(idx, 'edit', value)}
                        type="scope"
                      />
                    </td>
                    
                    {/* Delete */}
                    <td className="p-4">
                      <ScopeDropdown
                        value={entityPerm.delete}
                        onChange={(value) => updatePermission(idx, 'delete', value)}
                        type="scope"
                      />
                    </td>
                    
                    {/* Assign */}
                    <td className="p-4">
                      <ScopeDropdown
                        value={entityPerm.assign}
                        onChange={(value) => updatePermission(idx, 'assign', value)}
                        type="yesno"
                      />
                    </td>
                    
                    {/* Export */}
                    <td className="p-4">
                      <ScopeDropdown
                        value={entityPerm.export}
                        onChange={(value) => updatePermission(idx, 'export', value)}
                        type="yesno"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="mt-6 bg-gray-50 border border-gray-200 p-4">
        <h3 className="font-semibold text-black mb-2">Permission Scopes:</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div>
            <span className="font-semibold">None:</span> No access
          </div>
          <div>
            <span className="font-semibold">Own:</span> Own records only
          </div>
          <div>
            <span className="font-semibold">Team:</span> Team records
          </div>
          <div>
            <span className="font-semibold">All:</span> Full access
          </div>
        </div>
      </div>
    </div>
  );
};

// Reusable Scope Dropdown Component
const ScopeDropdown = ({ value, onChange, type }) => {
  const scopeOptions = [
    { value: 'none', label: 'None', color: 'text-red-600' },
    { value: 'own', label: 'Own', color: 'text-yellow-600' },
    { value: 'team', label: 'Team', color: 'text-blue-600' },
    { value: 'all', label: 'All', color: 'text-green-600' }
  ];

  const yesNoOptions = [
    { value: 'no', label: 'No', color: 'text-red-600' },
    { value: 'yes', label: 'Yes', color: 'text-green-600' }
  ];

  const options = type === 'yesno' ? yesNoOptions : scopeOptions;
  const currentOption = options.find(opt => opt.value === value);

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={`bg-white border-gray-300 rounded-none ${currentOption?.color || ''}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(opt => (
          <SelectItem key={opt.value} value={opt.value}>
            <span className={opt.color}>{opt.label}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default PermissionMatrix;
