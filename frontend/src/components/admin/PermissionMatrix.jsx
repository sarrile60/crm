import React, { useState, useEffect } from 'react';
import { Save, RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api/admin`;

const PermissionMatrix = () => {
  const { t } = useTranslation();
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
      toast.error(t('permissions.errorLoadingRoles'));
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
      toast.error(t('permissions.errorLoadingPermissions'));
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
      
      const permissionsToSave = [];
      const scopeActions = ['read', 'edit', 'delete'];
      const yesNoActions = ['create', 'assign', 'export'];
      
      permissions.forEach(entityPerm => {
        scopeActions.forEach(action => {
          const value = entityPerm[action];
          const validScopes = ['none', 'own', 'team', 'all'];
          const scope = validScopes.includes(value) ? value : 'none';
          permissionsToSave.push({
            entity: entityPerm.entity,
            action: action,
            scope: scope
          });
        });
        
        yesNoActions.forEach(action => {
          const value = entityPerm[action];
          const scope = (value === 'yes' || value === 'no') ? value : 'no';
          permissionsToSave.push({
            entity: entityPerm.entity,
            action: action,
            scope: scope
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

      toast.success(t('permissions.saveSuccess'));
      setOriginalPermissions(JSON.parse(JSON.stringify(permissions)));
      setHasChanges(false);
    } catch (error) {
      toast.error(t('permissions.errorSaving'));
      console.error('Error:', error);
    } finally {
      setSaving(false);
    }
  };

  const resetChanges = () => {
    setPermissions(JSON.parse(JSON.stringify(originalPermissions)));
    setHasChanges(false);
  };

  // Translate role description if it's a translation key
  const getRoleDescription = (role) => {
    if (!role?.description) return t('roles.noDescription');
    if (role.description.startsWith('role_desc_')) {
      return t(`roles.descriptions.${role.description}`);
    }
    return role.description;
  };

  const selectedRoleData = roles.find(r => r.id === selectedRole);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-black">{t('permissions.title')}</h2>
          <p className="text-gray-600 mt-1">{t('permissions.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          {hasChanges && (
            <>
              <Button
                onClick={resetChanges}
                className="bg-gray-200 hover:bg-gray-300 text-black rounded-none"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                {t('permissions.reset')}
              </Button>
              <Button
                onClick={savePermissions}
                disabled={saving}
                className="bg-[#D4AF37] hover:bg-[#B8941F] text-black rounded-none"
              >
                <Save className="w-4 h-4 mr-2" />
                {saving ? t('permissions.saving') : t('permissions.saveChanges')}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Role Selector */}
      <div className="bg-white border-2 border-gray-200 p-6 mb-6">
        <label className="block text-sm font-semibold text-black mb-3">{t('permissions.selectRole')}</label>
        <Select value={selectedRole} onValueChange={setSelectedRole}>
          <SelectTrigger className="bg-white border-gray-300 rounded-none max-w-md">
            <SelectValue placeholder={t('permissions.chooseRole')} />
          </SelectTrigger>
          <SelectContent>
            {roles.map(role => (
              <SelectItem key={role.id} value={role.id}>
                {role.name}
                {role.is_system && <span className="text-gray-500 ml-2">({t('roles.systemRole')})</span>}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedRoleData && (
          <p className="text-sm text-gray-600 mt-2">
            {getRoleDescription(selectedRoleData)}
          </p>
        )}
      </div>

      {/* Permission Matrix Grid */}
      {loading ? (
        <div className="text-center py-8 text-gray-600">{t('permissions.loadingPermissions')}</div>
      ) : permissions.length === 0 ? (
        <div className="text-center py-8 text-gray-500">{t('permissions.noEntities')}</div>
      ) : (
        <div className="bg-white border-2 border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-black text-white">
                <tr>
                  <th className="text-left p-4 font-semibold min-w-[150px]">{t('permissions.entity')}</th>
                  <th className="text-center p-4 font-semibold w-[150px]">{t('permissions.read')}</th>
                  <th className="text-center p-4 font-semibold w-[120px]">{t('permissions.create')}</th>
                  <th className="text-center p-4 font-semibold w-[150px]">{t('permissions.edit')}</th>
                  <th className="text-center p-4 font-semibold w-[150px]">{t('permissions.delete')}</th>
                  <th className="text-center p-4 font-semibold w-[120px]">{t('permissions.assign')}</th>
                  <th className="text-center p-4 font-semibold w-[120px]">{t('permissions.export')}</th>
                </tr>
              </thead>
              <tbody>
                {permissions.map((entityPerm, idx) => (
                  <tr key={entityPerm.entity} className="border-t border-gray-200 hover:bg-gray-50">
                    <td className="p-4 font-semibold text-black">
                      {entityPerm.display_name || entityPerm.entity}
                    </td>
                    
                    <td className="p-4">
                      <ScopeDropdown
                        value={entityPerm.read}
                        onChange={(value) => updatePermission(idx, 'read', value)}
                        type="scope"
                        t={t}
                      />
                    </td>
                    
                    <td className="p-4">
                      <ScopeDropdown
                        value={entityPerm.create}
                        onChange={(value) => updatePermission(idx, 'create', value)}
                        type="yesno"
                        t={t}
                      />
                    </td>
                    
                    <td className="p-4">
                      <ScopeDropdown
                        value={entityPerm.edit}
                        onChange={(value) => updatePermission(idx, 'edit', value)}
                        type="scope"
                        t={t}
                      />
                    </td>
                    
                    <td className="p-4">
                      <ScopeDropdown
                        value={entityPerm.delete}
                        onChange={(value) => updatePermission(idx, 'delete', value)}
                        type="scope"
                        t={t}
                      />
                    </td>
                    
                    <td className="p-4">
                      <ScopeDropdown
                        value={entityPerm.assign}
                        onChange={(value) => updatePermission(idx, 'assign', value)}
                        type="yesno"
                        t={t}
                      />
                    </td>
                    
                    <td className="p-4">
                      <ScopeDropdown
                        value={entityPerm.export}
                        onChange={(value) => updatePermission(idx, 'export', value)}
                        type="yesno"
                        t={t}
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
        <h3 className="font-semibold text-black mb-2">{t('permissions.scopesLegend')}:</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div>
            <span className="font-semibold">{t('permissions.scopeNone')}:</span> {t('permissions.scopeNoneDesc')}
          </div>
          <div>
            <span className="font-semibold">{t('permissions.scopeOwn')}:</span> {t('permissions.scopeOwnDesc')}
          </div>
          <div>
            <span className="font-semibold">{t('permissions.scopeTeam')}:</span> {t('permissions.scopeTeamDesc')}
          </div>
          <div>
            <span className="font-semibold">{t('permissions.scopeAll')}:</span> {t('permissions.scopeAllDesc')}
          </div>
        </div>
      </div>
    </div>
  );
};

// Reusable Scope Dropdown Component
const ScopeDropdown = ({ value, onChange, type, t }) => {
  const scopeOptions = [
    { value: 'none', label: t('permissions.scopeNone'), color: 'text-red-600' },
    { value: 'own', label: t('permissions.scopeOwn'), color: 'text-yellow-600' },
    { value: 'team', label: t('permissions.scopeTeam'), color: 'text-blue-600' },
    { value: 'all', label: t('permissions.scopeAll'), color: 'text-green-600' }
  ];

  const yesNoOptions = [
    { value: 'no', label: t('common.no'), color: 'text-red-600' },
    { value: 'yes', label: t('common.yes'), color: 'text-green-600' }
  ];

  const options = type === 'yesno' ? yesNoOptions : scopeOptions;
  
  const safeValue = value || (type === 'yesno' ? 'no' : 'none');
  const currentOption = options.find(opt => opt.value === safeValue);

  return (
    <Select value={safeValue} onValueChange={onChange}>
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
