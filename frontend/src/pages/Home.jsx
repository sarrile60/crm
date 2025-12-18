import React, { useState, useEffect } from 'react';
import { ChevronDown, Scale, Shield, FileText, Globe, TrendingUp, Users, CheckCircle, Phone, Mail, MapPin, ArrowRight, Menu, X } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../components/ui/accordion';
import { useToast } from '../hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Home = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [formStep, setFormStep] = useState(1);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    scammerCompany: '',
    amountLost: '',
    caseDetails: ''
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Track page view
    trackPageView();
  }, []);

  const trackPageView = async () => {
    try {
      await axios.post(`${API}/analytics/pageview`);
    } catch (error) {
      console.error('Error tracking page view:', error);
    }
  };

  const trackCTAClick = async (ctaLocation) => {
    try {
      await axios.post(`${API}/analytics/cta-click`, { location: ctaLocation });
    } catch (error) {
      console.error('Error tracking CTA click:', error);
    }
  };

  const trackFormStart = async () => {
    try {
      await axios.post(`${API}/analytics/form-start`);
    } catch (error) {
      console.error('Error tracking form start:', error);
    }
  };

  const scrollToSection = (sectionId) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
    setMobileMenuOpen(false);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    
    if (name === 'fullName' && !formData.fullName) {
      trackFormStart();
    }
  };

  const handleSelectChange = (value) => {
    setFormData(prev => ({ ...prev, amountLost: value }));
  };

  const handleStep1Submit = (e) => {
    e.preventDefault();
    
    if (!formData.fullName || !formData.email || !formData.phone) {
      toast({
        title: t('common.missingFields'),
        description: t('common.fillAllFields'),
        variant: "destructive"
      });
      return;
    }
    
    setFormStep(2);
  };

  const handleFinalSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.scammerCompany || !formData.amountLost || !formData.caseDetails) {
      toast({
        title: t('common.missingFields'),
        description: t('common.fillAllFields'),
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    
    try {
      await axios.post(`${API}/leads/submit`, formData);
      
      // Redirect to thank you page on success
      navigate('/thank-you');
      
    } catch (error) {
      // Handle duplicate registration error
      if (error.response?.status === 409) {
        toast({
          title: t('common.alreadyRegistered'),
          description: error.response?.data?.detail || t('common.alreadySubmitted'),
          variant: "destructive"
        });
      } else {
        toast({
          title: t('common.error'),
          description: t('common.tryAgainLater'),
          variant: "destructive"
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCTAClick = (location) => {
    trackCTAClick(location);
    scrollToSection('contact');
  };

  return (
    <div className="light-landing-page">
      {/* Header */}
      <header className="fixed top-0 w-full z-50 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-[1400px] mx-auto px-[7.6923%] py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Scale className="w-8 h-8 text-[#D4AF37]" />
            <span className="text-black text-xl font-semibold">1 LAW SOLICITORS</span>
          </div>
          
          <nav className="hidden md:flex items-center gap-8">
            <button onClick={() => scrollToSection('home')} className="text-gray-600 hover:text-black transition-colors text-lg">{t('nav.home')}</button>
            <button onClick={() => scrollToSection('about')} className="text-gray-600 hover:text-black transition-colors text-lg">{t('nav.about')}</button>
            <button onClick={() => scrollToSection('services')} className="text-gray-600 hover:text-black transition-colors text-lg">{t('nav.services')}</button>
            <button onClick={() => scrollToSection('how-it-works')} className="text-gray-600 hover:text-black transition-colors text-lg">{t('nav.howItWorks')}</button>
            <button onClick={() => scrollToSection('success-stories')} className="text-gray-600 hover:text-black transition-colors text-lg">{t('nav.successCases')}</button>
            <button onClick={() => scrollToSection('faq')} className="text-gray-600 hover:text-black transition-colors text-lg">{t('nav.faq')}</button>
            <Button onClick={() => handleCTAClick('header')} className="bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none text-lg px-6 py-6 font-semibold">
              {t('nav.freeConsultation')}
            </Button>
          </nav>

          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden text-black">
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-gray-200 py-4">
            <nav className="flex flex-col gap-4 px-[7.6923%]">
              <button onClick={() => scrollToSection('home')} className="text-gray-600 hover:text-black transition-colors text-lg text-left">{t('nav.home')}</button>
              <button onClick={() => scrollToSection('about')} className="text-gray-600 hover:text-black transition-colors text-lg text-left">{t('nav.about')}</button>
              <button onClick={() => scrollToSection('services')} className="text-gray-600 hover:text-black transition-colors text-lg text-left">{t('nav.services')}</button>
              <button onClick={() => scrollToSection('how-it-works')} className="text-gray-600 hover:text-black transition-colors text-lg text-left">{t('nav.howItWorks')}</button>
              <button onClick={() => scrollToSection('success-stories')} className="text-gray-600 hover:text-black transition-colors text-lg text-left">{t('nav.successCases')}</button>
              <button onClick={() => scrollToSection('faq')} className="text-gray-600 hover:text-black transition-colors text-lg text-left">{t('nav.faq')}</button>
              <Button onClick={() => handleCTAClick('mobile-menu')} className="bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none text-lg w-full py-6 font-semibold">
                {t('nav.freeConsultation')}
              </Button>
            </nav>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <section id="home" className="min-h-screen bg-white pt-32 pb-20 px-[7.6923%]">
        <div className="max-w-[1400px] mx-auto grid lg:grid-cols-2 gap-12 items-start">
          <div>
            <h1 className="text-6xl font-bold text-black mb-6 leading-tight">
              {t('home.heroTitle')}
            </h1>
            <p className="text-xl text-gray-700 mb-8 leading-relaxed">
              {t('home.heroSubtitle')}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 mb-12">
              <Button onClick={() => handleCTAClick('hero')} className="bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none text-lg px-8 py-7 font-semibold">
                {t('home.ctaButton')} <ArrowRight className="ml-2" />
              </Button>
              <Button onClick={() => scrollToSection('how-it-works')} className="bg-black text-white hover:bg-gray-800 rounded-none text-lg px-8 py-7 transition-all">
                {t('home.howItWorks')}
              </Button>
            </div>
            <div className="flex flex-wrap gap-6 mb-12">
              <div className="flex items-center gap-2 text-gray-700">
                <Shield className="w-5 h-5 text-[#D4AF37]" />
                <span>{t('common.sraRegulated')}</span>
              </div>
              <div className="flex items-center gap-2 text-gray-700">
                <CheckCircle className="w-5 h-5 text-[#D4AF37]" />
                <span>{t('common.internationalCases')}</span>
              </div>
            </div>

            {/* Trust Indicators Section */}
            <div className="bg-gray-50 border-2 border-[#D4AF37] p-6 rounded-lg">
              <h3 className="text-lg font-bold text-black mb-4">{t('home.whyChooseUs')}</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-6 h-6 text-[#D4AF37] mt-1 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-black text-sm">{t('home.fastResponse')}</p>
                    <p className="text-xs text-gray-600">{t('home.fastResponseDesc')}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Shield className="w-6 h-6 text-[#D4AF37] mt-1 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-black text-sm">{t('home.confidential')}</p>
                    <p className="text-xs text-gray-600">{t('home.confidentialDesc')}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Scale className="w-6 h-6 text-[#D4AF37] mt-1 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-black text-sm">{t('home.legalExperts')}</p>
                    <p className="text-xs text-gray-600">{t('home.legalExpertsDesc')}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Globe className="w-6 h-6 text-[#D4AF37] mt-1 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-black text-sm">{t('home.globalNetwork')}</p>
                    <p className="text-xs text-gray-600">{t('home.globalNetworkDesc')}</p>
                  </div>
                </div>
              </div>
              
              <div className="mt-6 pt-6 border-t border-gray-300">
                <div className="flex items-center justify-between text-sm">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-[#D4AF37]">€50M+</div>
                    <div className="text-xs text-gray-600">{t('common.recovered')}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-[#D4AF37]">500+</div>
                    <div className="text-xs text-gray-600">{t('common.resolved')}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-[#D4AF37]">35+</div>
                    <div className="text-xs text-gray-600">{t('common.countries')}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Contact Form */}
          <div id="contact" className="bg-gray-50 border-2 border-[#D4AF37] p-8 shadow-xl">
            <div className="mb-6">
              <h3 className="text-2xl font-bold text-black mb-2">{t('home.formTitle')}</h3>
              <p className="text-gray-700">{t('home.formSubtitle')}</p>
            </div>

            {formStep === 1 ? (
              <form onSubmit={handleStep1Submit} className="space-y-4">
                <div>
                  <label className="block text-black mb-2 text-sm font-semibold">{t('home.fullName')} *</label>
                  <Input
                    type="text"
                    name="fullName"
                    value={formData.fullName}
                    onChange={handleInputChange}
                    placeholder="Mario Rossi"
                    className="bg-white border-gray-300 text-black rounded-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-black mb-2 text-sm font-semibold">{t('common.email')} *</label>
                  <Input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    placeholder="mario@esempio.it"
                    className="bg-white border-gray-300 text-black rounded-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-black mb-2 text-sm font-semibold">{t('home.phoneNumber')} *</label>
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      value="+39"
                      disabled
                      className="bg-gray-100 border-gray-300 text-black rounded-none w-20"
                    />
                    <Input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleInputChange}
                      placeholder="3XX XXX XXXX"
                      className="bg-white border-gray-300 text-black rounded-none flex-1"
                      required
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none text-lg py-6 font-semibold">
                  {t('home.continue')}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleFinalSubmit} className="space-y-4">
                <div>
                  <label className="block text-black mb-2 text-sm font-semibold">{t('home.scammerCompany')} *</label>
                  <Input
                    type="text"
                    name="scammerCompany"
                    value={formData.scammerCompany}
                    onChange={handleInputChange}
                    placeholder="Es. FakeInvest Ltd"
                    className="bg-white border-gray-300 text-black rounded-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-black mb-2 text-sm font-semibold">{t('home.amountLost')} *</label>
                  <Select onValueChange={handleSelectChange} value={formData.amountLost}>
                    <SelectTrigger className="bg-white border-gray-300 text-black rounded-none">
                      <SelectValue placeholder={t('home.selectAmount')} />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-gray-300 text-black">
                      <SelectItem value="500-5000">€500 - €5.000</SelectItem>
                      <SelectItem value="5000-50000">€5.000 - €50.000</SelectItem>
                      <SelectItem value="50000-500000">€50.000 - €500.000</SelectItem>
                      <SelectItem value="500000+">€500.000+</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-black mb-2 text-sm font-semibold">{t('home.tellUsWhatHappened')} *</label>
                  <Textarea
                    name="caseDetails"
                    value={formData.caseDetails}
                    onChange={handleInputChange}
                    placeholder={t('home.describeFraud')}
                    rows={5}
                    className="bg-white border-gray-300 text-black rounded-none"
                    required
                  />
                </div>
                <Button type="submit" disabled={loading} className="w-full bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none text-lg py-6 font-semibold">
                  {loading ? t('common.submitting') : t('home.submitRequest')}
                </Button>
                <button
                  type="button"
                  onClick={() => setFormStep(1)}
                  className="text-gray-700 hover:text-black underline text-sm"
                >
                  {t('common.back')}
                </button>
              </form>
            )}

            <div className="mt-6 pt-6 border-t border-gray-300 space-y-2">
              <div className="flex items-center gap-2 text-gray-700 text-sm">
                <Shield className="w-4 h-4 text-[#D4AF37]" />
                <span>{t('home.sraRegulation')} – ID 8003758</span>
              </div>
              <div className="flex items-center gap-2 text-gray-700 text-sm">
                <CheckCircle className="w-4 h-4 text-[#D4AF37]" />
                <span>{t('common.secureSubmission')}</span>
              </div>
              <div className="flex items-center gap-2 text-gray-700 text-sm">
                <MapPin className="w-4 h-4 text-[#D4AF37]" />
                <span>12 Caroline Street, Birmingham B3 1TR</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Regulatory Approvals Slideshow */}
      <section className="bg-white py-12 border-y-2 border-[#D4AF37] overflow-hidden">
        <div className="max-w-[1400px] mx-auto px-[7.6923%]">
          <h3 className="text-center text-2xl font-bold text-black mb-8">
            Approvati e Regolamentati dalle Principali Autorità Europee
          </h3>
        </div>
        
        <div className="relative">
          <div className="regulatory-slider">
            <div className="regulatory-track">
              {/* First set of logos */}
              <div className="regulatory-item">
                <div className="w-32 h-32 flex items-center justify-center bg-white rounded-lg border-2 border-[#D4AF37] mb-3 p-3 shadow-md">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-[#D4AF37] mb-1">FCA</div>
                    <div className="text-[10px] text-gray-600 leading-tight">Financial Conduct Authority</div>
                  </div>
                </div>
              </div>
              
              <div className="regulatory-item">
                <div className="w-32 h-32 flex items-center justify-center bg-white rounded-lg border-2 border-[#D4AF37] mb-3 p-3 shadow-md">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-[#D4AF37] mb-1">BaFin</div>
                    <div className="text-[10px] text-gray-600 leading-tight">Bundesanstalt für Finanzdienstleistung</div>
                  </div>
                </div>
              </div>
              
              <div className="regulatory-item">
                <div className="w-32 h-32 flex items-center justify-center bg-white rounded-lg border-2 border-[#D4AF37] mb-3 p-3 shadow-md">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-[#D4AF37] mb-1">SRA</div>
                    <div className="text-[10px] text-gray-600 leading-tight">Solicitors Regulation Authority</div>
                  </div>
                </div>
              </div>
              
              <div className="regulatory-item">
                <div className="w-32 h-32 flex items-center justify-center bg-white rounded-lg border-2 border-[#D4AF37] mb-3 p-3 shadow-md">
                  <div className="text-center">
                    <div className="text-xl font-bold text-[#D4AF37] mb-1">INTERPOL</div>
                    <div className="text-[10px] text-gray-600 leading-tight">International Police Organization</div>
                  </div>
                </div>
              </div>
              
              <div className="regulatory-item">
                <div className="w-32 h-32 flex items-center justify-center bg-white rounded-lg border-2 border-[#D4AF37] mb-3 p-3 shadow-md">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-[#D4AF37] mb-1">Pharos</div>
                    <div className="text-[10px] text-gray-600 leading-tight">Ministère de l'Intérieur</div>
                  </div>
                </div>
              </div>
              
              <div className="regulatory-item">
                <div className="w-32 h-32 flex items-center justify-center bg-white rounded-lg border-2 border-[#D4AF37] mb-3 p-3 shadow-md">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-[#D4AF37] mb-1">CONSOB</div>
                    <div className="text-[10px] text-gray-600 leading-tight">Commissione Nazionale</div>
                  </div>
                </div>
              </div>
              
              <div className="regulatory-item">
                <div className="w-32 h-32 flex items-center justify-center bg-white rounded-lg border-2 border-[#D4AF37] mb-3 p-3 shadow-md">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-[#D4AF37] mb-1">AMF</div>
                    <div className="text-[10px] text-gray-600 leading-tight">Autorité des Marchés Financiers</div>
                  </div>
                </div>
              </div>
              
              <div className="regulatory-item">
                <div className="w-32 h-32 flex items-center justify-center bg-white rounded-lg border-2 border-[#D4AF37] mb-3 p-2 shadow-md">
                  <img src="https://upload.wikimedia.org/wikipedia/commons/6/60/ESMALogo.png" alt="ESMA Logo" className="w-full h-full object-contain" />
                </div>
              </div>
              
              <div className="regulatory-item">
                <div className="w-32 h-32 flex items-center justify-center bg-white rounded-lg border-2 border-[#D4AF37] mb-3 p-3 shadow-md">
                  <div className="text-center">
                    <div className="text-xl font-bold text-[#D4AF37] mb-1">Banca d'Italia</div>
                    <div className="text-[10px] text-gray-600 leading-tight">Central Bank of Italy</div>
                  </div>
                </div>
              </div>
              
              <div className="regulatory-item">
                <div className="w-32 h-32 flex items-center justify-center bg-white rounded-lg border-2 border-[#D4AF37] mb-3 p-3 shadow-md">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-[#D4AF37] mb-1">CNMV</div>
                    <div className="text-[10px] text-gray-600 leading-tight">Comisión Nacional del Mercado</div>
                  </div>
                </div>
              </div>
              
              <div className="regulatory-item">
                <div className="w-32 h-32 flex items-center justify-center bg-white rounded-lg border-2 border-[#D4AF37] mb-3 p-3 shadow-md">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-[#D4AF37] mb-1">AFM</div>
                    <div className="text-[10px] text-gray-600 leading-tight">Autoriteit Financiële Markten</div>
                  </div>
                </div>
              </div>
              
              <div className="regulatory-item">
                <div className="w-32 h-32 flex items-center justify-center bg-white rounded-lg border-2 border-[#D4AF37] mb-3 p-3 shadow-md">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-[#D4AF37] mb-1">FINMA</div>
                    <div className="text-[10px] text-gray-600 leading-tight">Swiss Financial Authority</div>
                  </div>
                </div>
              </div>
              
              {/* Duplicate set for seamless loop */}
              <div className="regulatory-item">
                <div className="w-32 h-32 flex items-center justify-center bg-white rounded-lg border-2 border-[#D4AF37] mb-3 p-3 shadow-md">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-[#D4AF37] mb-1">FCA</div>
                    <div className="text-[10px] text-gray-600 leading-tight">Financial Conduct Authority</div>
                  </div>
                </div>
              </div>
              
              <div className="regulatory-item">
                <div className="w-32 h-32 flex items-center justify-center bg-white rounded-lg border-2 border-[#D4AF37] mb-3 p-3 shadow-md">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-[#D4AF37] mb-1">BaFin</div>
                    <div className="text-[10px] text-gray-600 leading-tight">Bundesanstalt für Finanzdienstleistung</div>
                  </div>
                </div>
              </div>
              
              <div className="regulatory-item">
                <div className="w-32 h-32 flex items-center justify-center bg-white rounded-lg border-2 border-[#D4AF37] mb-3 p-3 shadow-md">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-[#D4AF37] mb-1">SRA</div>
                    <div className="text-[10px] text-gray-600 leading-tight">Solicitors Regulation Authority</div>
                  </div>
                </div>
              </div>
              
              <div className="regulatory-item">
                <div className="w-32 h-32 flex items-center justify-center bg-white rounded-lg border-2 border-[#D4AF37] mb-3 p-3 shadow-md">
                  <div className="text-center">
                    <div className="text-xl font-bold text-[#D4AF37] mb-1">INTERPOL</div>
                    <div className="text-[10px] text-gray-600 leading-tight">International Police Organization</div>
                  </div>
                </div>
              </div>
              
              <div className="regulatory-item">
                <div className="w-32 h-32 flex items-center justify-center bg-white rounded-lg border-2 border-[#D4AF37] mb-3 p-3 shadow-md">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-[#D4AF37] mb-1">Pharos</div>
                    <div className="text-[10px] text-gray-600 leading-tight">Ministère de l'Intérieur</div>
                  </div>
                </div>
              </div>
              
              <div className="regulatory-item">
                <div className="w-32 h-32 flex items-center justify-center bg-white rounded-lg border-2 border-[#D4AF37] mb-3 p-3 shadow-md">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-[#D4AF37] mb-1">CONSOB</div>
                    <div className="text-[10px] text-gray-600 leading-tight">Commissione Nazionale</div>
                  </div>
                </div>
              </div>
              
              <div className="regulatory-item">
                <div className="w-32 h-32 flex items-center justify-center bg-white rounded-lg border-2 border-[#D4AF37] mb-3 p-3 shadow-md">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-[#D4AF37] mb-1">AMF</div>
                    <div className="text-[10px] text-gray-600 leading-tight">Autorité des Marchés Financiers</div>
                  </div>
                </div>
              </div>
              
              <div className="regulatory-item">
                <div className="w-32 h-32 flex items-center justify-center bg-white rounded-lg border-2 border-[#D4AF37] mb-3 p-2 shadow-md">
                  <img src="https://upload.wikimedia.org/wikipedia/commons/6/60/ESMALogo.png" alt="ESMA Logo" className="w-full h-full object-contain" />
                </div>
              </div>
              
              <div className="regulatory-item">
                <div className="w-32 h-32 flex items-center justify-center bg-white rounded-lg border-2 border-[#D4AF37] mb-3 p-3 shadow-md">
                  <div className="text-center">
                    <div className="text-xl font-bold text-[#D4AF37] mb-1">Banca d'Italia</div>
                    <div className="text-[10px] text-gray-600 leading-tight">Central Bank of Italy</div>
                  </div>
                </div>
              </div>
              
              <div className="regulatory-item">
                <div className="w-32 h-32 flex items-center justify-center bg-white rounded-lg border-2 border-[#D4AF37] mb-3 p-3 shadow-md">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-[#D4AF37] mb-1">CNMV</div>
                    <div className="text-[10px] text-gray-600 leading-tight">Comisión Nacional del Mercado</div>
                  </div>
                </div>
              </div>
              
              <div className="regulatory-item">
                <div className="w-32 h-32 flex items-center justify-center bg-white rounded-lg border-2 border-[#D4AF37] mb-3 p-3 shadow-md">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-[#D4AF37] mb-1">AFM</div>
                    <div className="text-[10px] text-gray-600 leading-tight">Autoriteit Financiële Markten</div>
                  </div>
                </div>
              </div>
              
              <div className="regulatory-item">
                <div className="w-32 h-32 flex items-center justify-center bg-white rounded-lg border-2 border-[#D4AF37] mb-3 p-3 shadow-md">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-[#D4AF37] mb-1">FINMA</div>
                    <div className="text-[10px] text-gray-600 leading-tight">Swiss Financial Authority</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Bar */}
      <section className="bg-black py-12 px-[7.6923%]">
        <div className="max-w-[1400px] mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          <div>
            <div className="text-4xl font-bold text-[#D4AF37] mb-2">500+</div>
            <div className="text-white">Casi Gestiti</div>
          </div>
          <div>
            <div className="text-4xl font-bold text-[#D4AF37] mb-2">€50M+</div>
            <div className="text-white">Fondi Recuperati</div>
          </div>
          <div>
            <div className="text-4xl font-bold text-[#D4AF37] mb-2">35+</div>
            <div className="text-white">Paesi Serviti</div>
          </div>
          <div>
            <div className="text-4xl font-bold text-[#D4AF37] mb-2">24h</div>
            <div className="text-white">Tempo di Risposta</div>
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section id="services" className="bg-white py-20 px-[7.6923%]">
        <div className="max-w-[1400px] mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-5xl font-bold text-black mb-6">{t('home.servicesTitle')}</h2>
            <p className="text-xl text-gray-700 max-w-3xl mx-auto">
              {t('home.servicesSubtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { icon: <TrendingUp />, titleKey: 'cryptoScams', descKey: 'cryptoScamsDesc' },
              { icon: <Globe />, titleKey: 'forexFraud', descKey: 'forexFraudDesc' },
              { icon: <Shield />, titleKey: 'illegalBrokers', descKey: 'illegalBrokersDesc' },
              { icon: <FileText />, titleKey: 'fakePlatforms', descKey: 'fakePlatformsDesc' },
              { icon: <Scale />, titleKey: 'scamProtection', descKey: 'scamProtectionDesc' },
              { icon: <CheckCircle />, titleKey: 'bankDisputes', descKey: 'bankDisputesDesc' },
              { icon: <Globe />, titleKey: 'internationalDisputes', descKey: 'internationalDisputesDesc' },
              { icon: <Users />, titleKey: 'evidenceAnalysis', descKey: 'evidenceAnalysisDesc' }
            ].map((service, index) => (
              <div key={index} className="bg-white border-2 border-gray-200 p-6 hover:border-[#D4AF37] transition-all group shadow-md">
                <div className="w-12 h-12 bg-[#D4AF37] text-black flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  {service.icon}
                </div>
                <h3 className="text-xl font-bold text-black mb-3">{t(`home.${service.titleKey}`)}</h3>
                <p className="text-gray-700">{t(`home.${service.descKey}`)}</p>
              </div>
            ))}
          </div>

          <div className="text-center mt-12">
            <Button onClick={() => handleCTAClick('services')} className="bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none text-lg px-8 py-7 font-semibold">
              {t('home.getConsultation')} <ArrowRight className="ml-2" />
            </Button>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="bg-gray-50 py-20 px-[7.6923%]">
        <div className="max-w-[1400px] mx-auto grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <img
              src="https://images.unsplash.com/photo-1758518731462-d091b0b4ed0d"
              alt="Professional legal team"
              className="w-full h-[500px] object-cover shadow-xl"
            />
          </div>
          <div>
            <h2 className="text-5xl font-bold text-black mb-6">{t('home.aboutTitle')}</h2>
            <p className="text-xl text-gray-700 mb-6 leading-relaxed">
              {t('home.aboutDesc1')}
            </p>
            <p className="text-xl text-gray-700 mb-6 leading-relaxed">
              {t('home.aboutDesc2')}
            </p>
            <p className="text-xl text-gray-700 mb-8 leading-relaxed">
              {t('home.aboutDesc3')}
            </p>
            
            <div className="space-y-4 mb-8">
              <div className="flex items-start gap-3">
                <Shield className="w-6 h-6 text-[#D4AF37] mt-1" />
                <div>
                  <h4 className="text-black font-semibold mb-1">{t('home.sraRegulation')}</h4>
                  <p className="text-gray-700">Recognised Body Law Practice - SRA ID: 8003758</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <MapPin className="w-6 h-6 text-[#D4AF37] mt-1" />
                <div>
                  <h4 className="text-black font-semibold mb-1">{t('home.legalAddress')}</h4>
                  <p className="text-gray-700">12 Caroline Street, Birmingham, England B3 1TR</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Globe className="w-6 h-6 text-[#D4AF37] mt-1" />
                <div>
                  <h4 className="text-black font-semibold mb-1">{t('home.internationalPartnerships')}</h4>
                  <p className="text-gray-700">{t('home.partnershipsDesc')}</p>
                </div>
              </div>
            </div>

            <Button onClick={() => handleCTAClick('about')} className="bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none text-lg px-8 py-7 font-semibold">
              {t('home.talkToTeam')}
            </Button>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="bg-white py-20 px-[7.6923%]">
        <div className="max-w-[1400px] mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-5xl font-bold text-black mb-6">{t('home.processTitle')}</h2>
            <p className="text-xl text-gray-700 max-w-3xl mx-auto">
              {t('home.processSubtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              { step: '01', titleKey: 'step1Title', descKey: 'step1Desc' },
              { step: '02', titleKey: 'step2Title', descKey: 'step2Desc' },
              { step: '03', titleKey: 'step3Title', descKey: 'step3Desc' },
              { step: '04', titleKey: 'step4Title', descKey: 'step4Desc' },
              { step: '05', titleKey: 'step5Title', descKey: 'step5Desc' },
              { step: '06', titleKey: 'step6Title', descKey: 'step6Desc' }
            ].map((item, index) => (
              <div key={index} className="bg-white border-2 border-gray-200 p-6 relative hover:border-[#D4AF37] transition-all shadow-md">
                <div className="text-6xl font-bold text-[#D4AF37]/20 absolute top-4 right-4">{item.step}</div>
                <h3 className="text-2xl font-bold text-black mb-4 relative z-10">{t(`home.${item.titleKey}`)}</h3>
                <p className="text-gray-700 relative z-10">{t(`home.${item.descKey}`)}</p>
              </div>
            ))}
          </div>

          <div className="text-center mt-12">
            <Button onClick={() => handleCTAClick('how-it-works')} className="bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none text-lg px-8 py-7 font-semibold">
              {t('home.startReview')} <ArrowRight className="ml-2" />
            </Button>
          </div>
        </div>
      </section>

      {/* Success Stories Section */}
      <section id="success-stories" className="bg-gray-50 py-20 px-[7.6923%]">
        <div className="max-w-[1400px] mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-5xl font-bold text-black mb-6">{t('home.successTitle')}</h2>
            <p className="text-xl text-gray-700 max-w-3xl mx-auto">
              {t('home.successSubtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                typeKey: 'cryptoExchange',
                amount: '€127.000',
                outcomeKey: 'cryptoExchangeOutcome',
                duration: `8 ${t('successCases.months')}`
              },
              {
                typeKey: 'fakeBroker',
                amount: '€45.000',
                outcomeKey: 'fakeBrokerOutcome',
                duration: `5 ${t('successCases.months')}`
              },
              {
                typeKey: 'fraudulentICO',
                amount: '€220.000',
                outcomeKey: 'fraudulentICOOutcome',
                duration: `12 ${t('successCases.months')}`
              },
              {
                typeKey: 'fakeTradingPlatform',
                amount: '€68.000',
                outcomeKey: 'fakeTradingPlatformOutcome',
                duration: `1 ${t('successCases.week')}`
              },
              {
                typeKey: 'investmentScam',
                amount: '€95.000',
                outcomeKey: 'investmentScamOutcome',
                duration: `7 ${t('successCases.months')}`
              },
              {
                typeKey: 'ponziScheme',
                amount: '€380.000',
                outcomeKey: 'ponziSchemeOutcome',
                duration: `14 ${t('successCases.months')}`
              }
            ].map((story, index) => (
              <div key={index} className="bg-white border-2 border-gray-200 p-6 hover:border-[#D4AF37] transition-all shadow-md">
                <div className="flex items-center gap-2 mb-4">
                  <CheckCircle className="w-5 h-5 text-[#D4AF37]" />
                  <span className="text-[#D4AF37] font-semibold">{t('home.caseResolved')}</span>
                </div>
                <h3 className="text-xl font-bold text-black mb-3">{t(`successCases.${story.typeKey}`)}</h3>
                <div className="space-y-2 mb-4">
                  <div className="flex justify-between">
                    <span className="text-gray-700">{t('home.caseAmount')}:</span>
                    <span className="text-black font-semibold">{story.amount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700">{t('home.caseDuration')}:</span>
                    <span className="text-black font-semibold">{story.duration}</span>
                  </div>
                </div>
                <p className="text-gray-700 text-sm">{t(`successCases.${story.outcomeKey}`)}</p>
              </div>
            ))}
          </div>

          <div className="grid md:grid-cols-3 gap-8 mt-16 text-center">
            <div className="bg-white border-2 border-[#D4AF37] p-8 shadow-md">
              <div className="text-5xl font-bold text-[#D4AF37] mb-3">500+</div>
              <div className="text-black text-lg font-semibold">{t('home.totalCases')}</div>
            </div>
            <div className="bg-white border-2 border-[#D4AF37] p-8 shadow-md">
              <div className="text-5xl font-bold text-[#D4AF37] mb-3">35+</div>
              <div className="text-black text-lg font-semibold">{t('home.internationalClients')}</div>
            </div>
            <div className="bg-white border-2 border-[#D4AF37] p-8 shadow-md">
              <div className="text-5xl font-bold text-[#D4AF37] mb-3">24h</div>
              <div className="text-black text-lg font-semibold">{t('home.avgResponseTime')}</div>
            </div>
          </div>

          <div className="text-center mt-12">
            <Button onClick={() => handleCTAClick('success-stories')} className="bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none text-lg px-8 py-7 font-semibold">
              {t('home.requestConsultation')} <ArrowRight className="ml-2" />
            </Button>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="bg-white py-20 px-[7.6923%]">
        <div className="max-w-[900px] mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-5xl font-bold text-black mb-6">{t('home.faqTitle')}</h2>
            <p className="text-xl text-gray-700">{t('home.faqSubtitle')}</p>
          </div>

          <Accordion type="single" collapsible className="space-y-4">
            <AccordionItem value="item-1" className="bg-gray-50 border-2 border-gray-200 px-6">
              <AccordionTrigger className="text-black text-lg font-semibold hover:text-[#D4AF37]">
                {t('home.faq1Q')}
              </AccordionTrigger>
              <AccordionContent className="text-gray-700 text-base leading-relaxed">
                {t('home.faq1A')}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-2" className="bg-gray-50 border-2 border-gray-200 px-6">
              <AccordionTrigger className="text-black text-lg font-semibold hover:text-[#D4AF37]">
                {t('home.faq2Q')}
              </AccordionTrigger>
              <AccordionContent className="text-gray-700 text-base leading-relaxed">
                {t('home.faq2A')}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-3" className="bg-gray-50 border-2 border-gray-200 px-6">
              <AccordionTrigger className="text-black text-lg font-semibold hover:text-[#D4AF37]">
                {t('home.faq3Q')}
              </AccordionTrigger>
              <AccordionContent className="text-gray-700 text-base leading-relaxed">
                {t('home.faq3A')}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-4" className="bg-gray-50 border-2 border-gray-200 px-6">
              <AccordionTrigger className="text-black text-lg font-semibold hover:text-[#D4AF37]">
                {t('home.faq4Q')}
              </AccordionTrigger>
              <AccordionContent className="text-gray-700 text-base leading-relaxed">
                {t('home.faq4A')}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-5" className="bg-gray-50 border-2 border-gray-200 px-6">
              <AccordionTrigger className="text-black text-lg font-semibold hover:text-[#D4AF37]">
                {t('home.faq5Q')}
              </AccordionTrigger>
              <AccordionContent className="text-gray-700 text-base leading-relaxed">
                {t('home.faq5A')}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-6" className="bg-gray-50 border-2 border-gray-200 px-6">
              <AccordionTrigger className="text-black text-lg font-semibold hover:text-[#D4AF37]">
                {t('home.faq6Q')}
              </AccordionTrigger>
              <AccordionContent className="text-gray-700 text-base leading-relaxed">
                {t('home.faq6A')}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-7" className="bg-gray-50 border-2 border-gray-200 px-6">
              <AccordionTrigger className="text-black text-lg font-semibold hover:text-[#D4AF37]">
                {t('home.faq7Q')}
              </AccordionTrigger>
              <AccordionContent className="text-gray-700 text-base leading-relaxed">
                {t('home.faq7A')}
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <div className="text-center mt-12">
            <Button onClick={() => handleCTAClick('faq')} className="bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none text-lg px-8 py-7 font-semibold">
              {t('home.submitYourCase')} <ArrowRight className="ml-2" />
            </Button>
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="bg-[#D4AF37] py-20 px-[7.6923%]">
        <div className="max-w-[1400px] mx-auto text-center">
          <h2 className="text-5xl font-bold text-black mb-6">
            {t('home.readyToRecover')}
          </h2>
          <p className="text-xl text-black mb-8 max-w-3xl mx-auto font-medium">
            {t('home.dontWait')}
          </p>
          <Button onClick={() => handleCTAClick('final-cta')} className="bg-black text-white hover:bg-gray-800 rounded-none text-lg px-12 py-7 font-semibold shadow-xl">
            {t('home.getConsultationNow')} <ArrowRight className="ml-2" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-black py-16 px-[7.6923%]">
        <div className="max-w-[1400px] mx-auto">
          <div className="grid md:grid-cols-3 gap-12 mb-12">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <Scale className="w-8 h-8 text-[#D4AF37]" />
                <span className="text-white text-xl font-semibold">1 LAW SOLICITORS</span>
              </div>
              <p className="text-gray-300 mb-4">
                {t('footer.recognisedBody')}<br />
                {t('home.sraRegulation')}<br />
                SRA ID: 8003758
              </p>
            </div>
            
            <div>
              <h4 className="text-white font-semibold mb-4 text-lg">{t('home.contacts')}</h4>
              <div className="space-y-3">
                <div className="flex items-start gap-2 text-gray-300">
                  <MapPin className="w-5 h-5 text-[#D4AF37] mt-1" />
                  <span>12 Caroline Street<br />Birmingham, England<br />B3 1TR</span>
                </div>
                <div className="flex items-center gap-2 text-gray-300">
                  <Phone className="w-5 h-5 text-[#D4AF37]" />
                  <span>+44 (disponibile nel form)</span>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-white font-semibold mb-4 text-lg">{t('home.legalInfo')}</h4>
              <p className="text-gray-300 text-sm mb-2">
                {t('footer.companyType')}<br />
                {t('footer.established')}<br />
                {t('footer.sicCode')}
              </p>
            </div>
          </div>

          <div className="border-t border-gray-700 pt-8 text-center">
            <p className="text-gray-300">
              © {new Date().getFullYear()} 1 LAW SOLICITORS LIMITED. {t('home.allRightsReserved')}
            </p>
          </div>
        </div>
      </footer>

      {/* Tracking Pixel */}
      <iframe 
        src="https://1law-studiolegale.com/pixels/pixel_page_view.html" 
        width="1" 
        height="1" 
        style={{display: 'none', border: 'none'}} 
        title="PageView Tracking"
      />
    </div>
  );
};

export default Home;