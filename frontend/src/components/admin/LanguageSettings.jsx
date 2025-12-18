import React, { useState, useEffect } from 'react';
import { Languages, Save, Check, Globe } from 'lucide-react';
import { Button } from '../ui/button';
import { toast } from 'sonner';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { LANGUAGES } from '../../i18n/i18n';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api/admin`;

const LanguageSettings = () => {
  const { t, i18n } = useTranslation();
  const [selectedLanguage, setSelectedLanguage] = useState('it');
  const [savedLanguage, setSavedLanguage] = useState('it');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchLanguageSettings();
  }, []);

  const fetchLanguageSettings = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('crmToken');
      const response = await axios.get(`${API}/language-settings`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const lang = response.data.language || 'it';
      setSelectedLanguage(lang);
      setSavedLanguage(lang);
      // Apply the language
      i18n.changeLanguage(lang);
      localStorage.setItem('i18nextLng', lang);
    } catch (error) {
      console.error('Error fetching language settings:', error);
      // Default to Italian if error
      setSelectedLanguage('it');
      setSavedLanguage('it');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const token = localStorage.getItem('crmToken');
      await axios.put(`${API}/language-settings`, 
        { language: selectedLanguage },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      // Apply the language change
      i18n.changeLanguage(selectedLanguage);
      localStorage.setItem('i18nextLng', selectedLanguage);
      setSavedLanguage(selectedLanguage);
      
      toast.success(t('language.saveSuccess'));
    } catch (error) {
      toast.error(t('messages.errorOccurred'));
      console.error('Error saving language:', error);
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = selectedLanguage !== savedLanguage;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t('language.title')}</h2>
          <p className="text-gray-500 mt-1">{t('language.subtitle')}</p>
        </div>
        <Button
          onClick={handleSave}
          disabled={!hasChanges || saving}
          className="bg-[#D4AF37] hover:bg-[#B8941F] text-black rounded-none"
        >
          <Save className="w-4 h-4 mr-2" />
          {saving ? t('common.loading') : t('common.save')}
        </Button>
      </div>

      {/* Language Selection Grid */}
      <div className="bg-white border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-6">
          <Languages className="w-5 h-5 text-[#D4AF37]" />
          <h3 className="font-bold text-gray-900">{t('language.selectLanguage')}</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {LANGUAGES.map((lang) => (
            <div
              key={lang.code}
              onClick={() => setSelectedLanguage(lang.code)}
              className={`
                p-4 border-2 cursor-pointer transition-all rounded-none
                ${selectedLanguage === lang.code 
                  ? 'border-[#D4AF37] bg-amber-50' 
                  : 'border-gray-200 hover:border-gray-300 bg-white'
                }
              `}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{lang.flag}</span>
                  <div>
                    <div className="font-semibold text-gray-900">{lang.name}</div>
                    <div className="text-sm text-gray-500 uppercase">{lang.code}</div>
                  </div>
                </div>
                {selectedLanguage === lang.code && (
                  <Check className="w-6 h-6 text-[#D4AF37]" />
                )}
              </div>
              {savedLanguage === lang.code && (
                <div className="mt-2 text-xs text-green-600 font-medium flex items-center gap-1">
                  <Globe className="w-3 h-3" />
                  {t('language.currentLanguage')}
                </div>
              )}
            </div>
          ))}
        </div>

        {hasChanges && (
          <div className="mt-6 p-4 bg-amber-50 border border-amber-200 flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-800">
              <span className="text-lg">⚠️</span>
              <span className="font-medium">{t('session.unsavedChanges')}</span>
            </div>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-[#D4AF37] hover:bg-[#B8941F] text-black rounded-none"
              size="sm"
            >
              <Save className="w-4 h-4 mr-1" />
              {t('session.saveNow')}
            </Button>
          </div>
        )}
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 p-4">
        <h4 className="font-semibold text-blue-800 mb-2">ℹ️ {t('language.systemWide')}</h4>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• {t('language.systemWide')}</li>
          <li>• CRM Dashboard, Admin Panel, {t('nav.home')}</li>
          <li>• 🇮🇹 Italiano • 🇬🇧 English • 🇩🇪 Deutsch • 🇫🇷 Français • 🇪🇸 Español</li>
        </ul>
      </div>
    </div>
  );
};

export default LanguageSettings;
