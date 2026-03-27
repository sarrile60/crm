import React, { useState, useEffect } from 'react';
import { Database, Edit, Check, X, Users, User, Phone, FileText, Briefcase, Calendar, Mail, Settings, Tag, Building2, DollarSign, Target, MessageSquare, Clipboard, Clock, UserCheck, Award, HelpCircle, Contact, BarChart3, PieChart, TrendingUp, Shield, Eye, Activity } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api/admin`;

// Icon map for dynamic icon rendering
const ICON_MAP = {
  'users': Users,
  'user': User,
  'contact': Contact,
  'phone': Phone,
  'file-text': FileText,
  'filetext': FileText,
  'briefcase': Briefcase,
  'calendar': Calendar,
  'mail': Mail,
  'settings': Settings,
  'tag': Tag,
  'building': Building2,
  'building2': Building2,
  'dollar-sign': DollarSign,
  'dollarsign': DollarSign,
  'target': Target,
  'message-square': MessageSquare,
  'messagesquare': MessageSquare,
  'clipboard': Clipboard,
  'clock': Clock,
  'user-check': UserCheck,
  'usercheck': UserCheck,
  'award': Award,
  'database': Database,
  'help-circle': HelpCircle,
  'helpcircle': HelpCircle,
  'bar-chart': BarChart3,
  'barchart': BarChart3,
  'bar-chart-3': BarChart3,
  'barchart3': BarChart3,
  'pie-chart': PieChart,
  'piechart': PieChart,
  'trending-up': TrendingUp,
  'trendingup': TrendingUp,
  'shield': Shield,
  'eye': Eye,
  'activity': Activity
};

// Helper function to get icon component
const getIconComponent = (iconName) => {
  if (!iconName) return null;
  const normalizedName = iconName.toLowerCase().replace(/[-_\s]/g, '');
  return ICON_MAP[normalizedName] || ICON_MAP[iconName.toLowerCase()];
};

const EntityConfiguration = () => {
  const { t } = useTranslation();
  const [entities, setEntities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingEntity, setEditingEntity] = useState(null);
  const [editForm, setEditForm] = useState({ display_name: '', icon: '' });

  useEffect(() => {
    fetchEntities();
  }, []);

  const fetchEntities = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('crmToken');
      const response = await axios.get(`${API}/entities`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setEntities(response.data);
    } catch (error) {
      toast.error(t('entity.errorLoadingEntities'));
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleEntity = async (entityName, currentStatus) => {
    try {
      const token = localStorage.getItem('crmToken');
      await axios.put(
        `${API}/entities/${entityName}`,
        { enabled: !currentStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast.success(t('entity.entityUpdated'));
      fetchEntities();
    } catch (error) {
      toast.error(t('entity.errorUpdatingEntity'));
      console.error('Error:', error);
    }
  };

  const startEdit = (entity) => {
    setEditingEntity(entity.entity_name);
    setEditForm({
      display_name: entity.display_name,
      icon: entity.icon || ''
    });
  };

  const saveEdit = async (entityName) => {
    try {
      const token = localStorage.getItem('crmToken');
      await axios.put(
        `${API}/entities/${entityName}`,
        editForm,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast.success(t('entity.entityUpdated'));
      setEditingEntity(null);
      fetchEntities();
    } catch (error) {
      toast.error(t('entity.errorUpdatingEntity'));
      console.error('Error:', error);
    }
  };

  const cancelEdit = () => {
    setEditingEntity(null);
    setEditForm({ display_name: '', icon: '' });
  };

  // Render icon component
  const renderIcon = (iconName) => {
    const IconComponent = getIconComponent(iconName);
    if (IconComponent) {
      return <IconComponent className="w-5 h-5 text-blue-600" />;
    }
    return <HelpCircle className="w-5 h-5 text-gray-400" />;
  };

  if (loading) {
    return <div className="text-center py-8">{t('entity.loadingEntities')}</div>;
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-black">{t('entity.title')}</h2>
        <p className="text-gray-600 mt-1">{t('entity.subtitle')}</p>
      </div>

      {/* Entities List */}
      <div className="bg-white border-2 border-gray-200">
        <table className="w-full">
          <thead className="bg-black text-white">
            <tr>
              <th className="text-left p-4 font-semibold">{t('entity.entityName')}</th>
              <th className="text-left p-4 font-semibold">{t('entity.displayName')}</th>
              <th className="text-left p-4 font-semibold">{t('entity.icon')}</th>
              <th className="text-center p-4 font-semibold">{t('entity.order')}</th>
              <th className="text-center p-4 font-semibold">{t('common.enabled')}</th>
              <th className="text-center p-4 font-semibold">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {entities.map((entity) => {
              const isEditing = editingEntity === entity.entity_name;
              
              return (
                <tr key={entity.entity_name} className="border-t border-gray-200 hover:bg-gray-50">
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <Database className="w-5 h-5 text-gray-600" />
                      <span className="font-mono text-sm">{entity.entity_name}</span>
                    </div>
                  </td>
                  
                  <td className="p-4">
                    {isEditing ? (
                      <Input
                        value={editForm.display_name}
                        onChange={(e) => setEditForm({ ...editForm, display_name: e.target.value })}
                        className="bg-white border-gray-300 rounded-none"
                        placeholder={t('entity.displayName')}
                      />
                    ) : (
                      <span className="font-semibold text-black">{entity.display_name}</span>
                    )}
                  </td>
                  
                  <td className="p-4">
                    {isEditing ? (
                      <Input
                        value={editForm.icon}
                        onChange={(e) => setEditForm({ ...editForm, icon: e.target.value })}
                        className="bg-white border-gray-300 rounded-none"
                        placeholder="users, phone, briefcase..."
                      />
                    ) : (
                      <div className="flex items-center gap-2">
                        {renderIcon(entity.icon)}
                        <span className="text-gray-500 text-xs">({entity.icon || 'none'})</span>
                      </div>
                    )}
                  </td>
                  
                  <td className="p-4 text-center">
                    <span className="text-gray-600">{entity.order}</span>
                  </td>
                  
                  <td className="p-4 text-center">
                    <button
                      onClick={() => toggleEntity(entity.entity_name, entity.enabled)}
                      disabled={isEditing}
                      className={`px-4 py-1 font-semibold rounded-none transition-colors ${
                        entity.enabled
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : 'bg-red-100 text-red-700 hover:bg-red-200'
                      }`}
                    >
                      {entity.enabled ? t('common.enabled') : t('common.disabled')}
                    </button>
                  </td>
                  
                  <td className="p-4">
                    <div className="flex items-center justify-center gap-2">
                      {isEditing ? (
                        <>
                          <Button
                            onClick={() => saveEdit(entity.entity_name)}
                            className="bg-green-600 hover:bg-green-700 text-white rounded-none px-3 py-1"
                          >
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button
                            onClick={cancelEdit}
                            className="bg-gray-200 hover:bg-gray-300 text-black rounded-none px-3 py-1"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </>
                      ) : (
                        <Button
                          onClick={() => startEdit(entity)}
                          className="bg-black hover:bg-gray-800 text-white rounded-none px-3 py-1"
                        >
                          <Edit className="w-4 h-4 mr-2" />
                          {t('common.edit')}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Info Box */}
      <div className="mt-6 bg-blue-50 border border-blue-200 p-4">
        <h3 className="font-semibold text-black mb-2">💡 {t('entity.configTips')}</h3>
        <ul className="text-sm text-gray-700 space-y-1">
          <li>• {t('entity.tipDisplayName')}</li>
          <li>• {t('entity.tipIcon')}</li>
          <li>• {t('entity.tipEnabled')}</li>
          <li>• {t('entity.tipOrder')}</li>
        </ul>
      </div>
    </div>
  );
};

export default EntityConfiguration;
