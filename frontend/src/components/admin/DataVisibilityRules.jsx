import React, { useState, useEffect } from 'react';
import { Save, RefreshCw, Eye, EyeOff, Shield, Building2, Phone, Mail, MapPin } from 'lucide-react';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api/admin`;

const DataVisibilityRules = () => {
  const { t } = useTranslation();

  // Visibility options with icons and labels
  const VISIBILITY_OPTIONS = [
    { value: 'full', label: t('visibility.visible'), icon: Eye, color: 'text-green-600 bg-green-50' },
    { value: 'masked', label: t('visibility.masked'), icon: EyeOff, color: 'text-yellow-600 bg-yellow-50' },
    { value: 'hidden', label: t('visibility.hidden'), icon: EyeOff, color: 'text-red-600 bg-red-50' }
  ];

  // Field definitions with icons
  const FIELDS = [
    { key: 'phone', label: t('common.phone'), icon: Phone, example: { full: '+39 335 123 4567', masked: '*** *** *567', hidden: '—' } },
    { key: 'email', label: t('common.email'), icon: Mail, example: { full: 'mario@example.com', masked: 'ma***@example.com', hidden: '—' } },
    { key: 'address', label: t('common.address'), icon: MapPin, example: { full: 'Via Roma 123, Milano', masked: '*****, Milano', hidden: '—' } }
  ];
  const [matrix, setMatrix] = useState([]);
  const [originalMatrix, setOriginalMatrix] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [filterType, setFilterType] = useState('all'); // 'all', 'role', 'team'

  useEffect(() => {
    fetchVisibilityRules();
  }, []);

  const fetchVisibilityRules = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('crmToken');
      const response = await axios.get(`${API}/visibility-rules`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMatrix(response.data.matrix);
      setOriginalMatrix(JSON.parse(JSON.stringify(response.data.matrix)));
      setHasChanges(false);
    } catch (error) {
      toast.error(t('visibility.errorLoadingRules'));
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateVisibility = (rowIndex, field, value) => {
    const newMatrix = [...matrix];
    newMatrix[rowIndex][field] = value;
    setMatrix(newMatrix);
    setHasChanges(true);
  };

  const saveRules = async () => {
    try {
      setSaving(true);
      const token = localStorage.getItem('crmToken');
      
      // Build rules array for bulk update
      const rules = [];
      matrix.forEach(row => {
        FIELDS.forEach(field => {
          rules.push({
            scope_type: row.scope_type,
            scope_id: row.scope_id,
            field_name: field.key,
            visibility: row[field.key]
          });
        });
      });

      await axios.put(`${API}/visibility-rules`, { rules }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      toast.success(t('visibility.rulesUpdatedSuccess'));
      setOriginalMatrix(JSON.parse(JSON.stringify(matrix)));
      setHasChanges(false);
    } catch (error) {
      toast.error(t('visibility.errorSavingRules'));
      console.error('Error:', error);
    } finally {
      setSaving(false);
    }
  };

  const resetChanges = () => {
    setMatrix(JSON.parse(JSON.stringify(originalMatrix)));
    setHasChanges(false);
  };

  // Filter matrix based on selected filter
  const filteredMatrix = matrix.filter(row => {
    if (filterType === 'all') return true;
    return row.scope_type === filterType;
  });

  const getVisibilityStyle = (value) => {
    const option = VISIBILITY_OPTIONS.find(o => o.value === value);
    return option?.color || '';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t('visibility.title')}</h2>
          <p className="text-gray-500 mt-1">
            {t('visibility.subtitle')}
          </p>
        </div>
        <div className="flex gap-2">
          {hasChanges && (
            <Button
              onClick={resetChanges}
              variant="outline"
              className="rounded-none"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              {t('common.cancel')}
            </Button>
          )}
          <Button
            onClick={saveRules}
            disabled={!hasChanges || saving}
            className="bg-[#D4AF37] hover:bg-[#B8941F] text-black rounded-none"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? t('common.loading') : t('common.saveChanges')}
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="bg-white border border-gray-200 p-4">
        <h3 className="font-semibold text-gray-700 mb-3">{t('visibility.legend')}</h3>
        <div className="grid grid-cols-3 gap-4">
          {VISIBILITY_OPTIONS.map(option => {
            const Icon = option.icon;
            return (
              <div key={option.value} className={`p-3 ${option.color} border`}>
                <div className="flex items-center gap-2 font-semibold mb-2">
                  <Icon className="w-4 h-4" />
                  {option.label}
                </div>
                <div className="text-xs space-y-1">
                  {FIELDS.map(field => (
                    <div key={field.key} className="flex items-center gap-2">
                      <field.icon className="w-3 h-3" />
                      <span className="font-mono">{field.example[option.value]}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium text-gray-700">{t('common.filterBy')}:</span>
        <div className="flex gap-2">
          <Button
            variant={filterType === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterType('all')}
            className={filterType === 'all' ? 'bg-black text-white rounded-none' : 'rounded-none'}
          >
            Tutti
          </Button>
          <Button
            variant={filterType === 'role' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterType('role')}
            className={filterType === 'role' ? 'bg-black text-white rounded-none' : 'rounded-none'}
          >
            <Shield className="w-4 h-4 mr-1" />
            Solo Ruoli
          </Button>
          <Button
            variant={filterType === 'team' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterType('team')}
            className={filterType === 'team' ? 'bg-black text-white rounded-none' : 'rounded-none'}
          >
            <Building2 className="w-4 h-4 mr-1" />
            Solo Team
          </Button>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchVisibilityRules}
          disabled={loading}
          className="ml-auto"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Matrix Table */}
      <div className="bg-white border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-900 text-white">
                <th className="text-left p-4 font-semibold">Tipo</th>
                <th className="text-left p-4 font-semibold">Nome</th>
                {FIELDS.map(field => {
                  const Icon = field.icon;
                  return (
                    <th key={field.key} className="text-center p-4 font-semibold">
                      <div className="flex items-center justify-center gap-2">
                        <Icon className="w-4 h-4" />
                        {field.label}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-gray-500">
                    Caricamento...
                  </td>
                </tr>
              ) : filteredMatrix.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-gray-500">
                    Nessun ruolo o team trovato
                  </td>
                </tr>
              ) : (
                filteredMatrix.map((row, index) => {
                  // Find original index in full matrix
                  const originalIndex = matrix.findIndex(
                    m => m.scope_type === row.scope_type && m.scope_id === row.scope_id
                  );
                  
                  return (
                    <tr key={`${row.scope_type}-${row.scope_id}`} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          {row.scope_type === 'role' ? (
                            <Shield className="w-4 h-4 text-blue-500" />
                          ) : (
                            <Building2 className="w-4 h-4 text-purple-500" />
                          )}
                          <span className={`text-xs px-2 py-1 ${
                            row.scope_type === 'role' 
                              ? 'bg-blue-100 text-blue-700' 
                              : 'bg-purple-100 text-purple-700'
                          }`}>
                            {row.scope_type === 'role' ? 'Ruolo' : 'Team'}
                          </span>
                        </div>
                      </td>
                      <td className="p-4 font-medium">{row.scope_name}</td>
                      {FIELDS.map(field => (
                        <td key={field.key} className="p-4 text-center">
                          <Select
                            value={row[field.key]}
                            onValueChange={(value) => updateVisibility(originalIndex, field.key, value)}
                          >
                            <SelectTrigger 
                              className={`w-36 mx-auto rounded-none ${getVisibilityStyle(row[field.key])}`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {VISIBILITY_OPTIONS.map(option => {
                                const Icon = option.icon;
                                return (
                                  <SelectItem key={option.value} value={option.value}>
                                    <div className="flex items-center gap-2">
                                      <Icon className="w-4 h-4" />
                                      {option.label}
                                    </div>
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 p-4">
        <h4 className="font-semibold text-blue-800 mb-2">Come Funziona</h4>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• <strong>Visibile:</strong> Il campo viene mostrato completamente</li>
          <li>• <strong>Mascherato:</strong> Il campo viene parzialmente oscurato (es. telefono: *** *** *567)</li>
          <li>• <strong>Nascosto:</strong> Il campo non viene mostrato affatto</li>
          <li>• Le regole dei <strong>ruoli</strong> hanno priorità sulle regole dei <strong>team</strong></li>
          <li>• Gli <strong>amministratori</strong> vedono sempre tutti i dati in chiaro</li>
          <li>• Il mascheramento avviene <strong>esclusivamente lato server</strong></li>
        </ul>
      </div>
    </div>
  );
};

export default DataVisibilityRules;
