import React, { useState, useEffect } from 'react';
import { ChevronDown, Scale, Shield, FileText, Globe, TrendingUp, Users, CheckCircle, Phone, Mail, MapPin, ArrowRight, Menu, X } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../components/ui/accordion';
import { useToast } from '../hooks/use-toast';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Home = () => {
  const { toast } = useToast();
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
        title: "Campi mancanti",
        description: "Per favore compila tutti i campi richiesti.",
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
        title: "Campi mancanti",
        description: "Per favore compila tutti i campi richiesti.",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    
    try {
      await axios.post(`${API}/leads/submit`, formData);
      
      toast({
        title: "Richiesta inviata con successo!",
        description: "Il nostro team legale esaminerà il tuo caso e ti contatterà presto."
      });
      
      setFormData({
        fullName: '',
        email: '',
        phone: '',
        scammerCompany: '',
        amountLost: '',
        caseDetails: ''
      });
      setFormStep(1);
    } catch (error) {
      toast({
        title: "Errore",
        description: "Si è verificato un errore. Riprova più tardi.",
        variant: "destructive"
      });
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
            <button onClick={() => scrollToSection('home')} className="text-gray-600 hover:text-black transition-colors text-lg">Home</button>
            <button onClick={() => scrollToSection('about')} className="text-gray-600 hover:text-black transition-colors text-lg">Chi Siamo</button>
            <button onClick={() => scrollToSection('services')} className="text-gray-600 hover:text-black transition-colors text-lg">Servizi</button>
            <button onClick={() => scrollToSection('how-it-works')} className="text-gray-600 hover:text-black transition-colors text-lg">Come Funziona</button>
            <button onClick={() => scrollToSection('success-stories')} className="text-gray-600 hover:text-black transition-colors text-lg">Casi di Successo</button>
            <button onClick={() => scrollToSection('faq')} className="text-gray-600 hover:text-black transition-colors text-lg">FAQ</button>
            <Button onClick={() => handleCTAClick('header')} className="bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none text-lg px-6 py-6 font-semibold">
              Consulenza Gratuita
            </Button>
          </nav>

          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden text-black">
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-gray-200 py-4">
            <nav className="flex flex-col gap-4 px-[7.6923%]">
              <button onClick={() => scrollToSection('home')} className="text-gray-600 hover:text-black transition-colors text-lg text-left">Home</button>
              <button onClick={() => scrollToSection('about')} className="text-gray-600 hover:text-black transition-colors text-lg text-left">Chi Siamo</button>
              <button onClick={() => scrollToSection('services')} className="text-gray-600 hover:text-black transition-colors text-lg text-left">Servizi</button>
              <button onClick={() => scrollToSection('how-it-works')} className="text-gray-600 hover:text-black transition-colors text-lg text-left">Come Funziona</button>
              <button onClick={() => scrollToSection('success-stories')} className="text-gray-600 hover:text-black transition-colors text-lg text-left">Casi di Successo</button>
              <button onClick={() => scrollToSection('faq')} className="text-gray-600 hover:text-black transition-colors text-lg text-left">FAQ</button>
              <Button onClick={() => handleCTAClick('mobile-menu')} className="bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none text-lg w-full py-6 font-semibold">
                Consulenza Gratuita
              </Button>
            </nav>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <section id="home" className="min-h-screen bg-white pt-32 pb-20 px-[7.6923%]">
        <div className="max-w-[1400px] mx-auto grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <h1 className="text-6xl font-bold text-black mb-6 leading-tight">
              Recupera i Tuoi Fondi da Truffe Online e Crypto
            </h1>
            <p className="text-xl text-gray-700 mb-8 leading-relaxed">
              Studio legale specializzato nel recupero di fondi da truffe crypto, forex, broker fraudolenti e piattaforme di investimento false. In molti casi, l'azione legale può aiutare i clienti a recuperare i fondi, a seconda delle prove, dei dettagli della transazione e delle circostanze della truffa.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 mb-12">
              <Button onClick={() => handleCTAClick('hero')} className="bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none text-lg px-8 py-7 font-semibold">
                Ottieni Consulenza Gratuita <ArrowRight className="ml-2" />
              </Button>
              <Button onClick={() => scrollToSection('how-it-works')} className="bg-black text-white hover:bg-gray-800 rounded-none text-lg px-8 py-7 transition-all">
                Come Funziona
              </Button>
            </div>
            <div className="flex flex-wrap gap-6">
              <div className="flex items-center gap-2 text-gray-700">
                <Shield className="w-5 h-5 text-[#D4AF37]" />
                <span>SRA Regolamentato</span>
              </div>
              <div className="flex items-center gap-2 text-gray-700">
                <CheckCircle className="w-5 h-5 text-[#D4AF37]" />
                <span>Casi Internazionali</span>
              </div>
              <div className="flex items-center gap-2 text-gray-700">
                <Users className="w-5 h-5 text-[#D4AF37]" />
                <span>Partnership con INTERPOL</span>
              </div>
            </div>
          </div>

          {/* Contact Form */}
          <div id="contact" className="bg-gray-50 border-2 border-[#D4AF37] p-8 shadow-xl">
            <div className="mb-6">
              <h3 className="text-2xl font-bold text-black mb-2">Richiedi Consulenza Gratuita</h3>
              <p className="text-gray-700">Valutazione legale confidenziale senza impegno</p>
            </div>

            {formStep === 1 ? (
              <form onSubmit={handleStep1Submit} className="space-y-4">
                <div>
                  <label className="block text-black mb-2 text-sm font-semibold">Nome Completo *</label>
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
                  <label className="block text-black mb-2 text-sm font-semibold">Email *</label>
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
                  <label className="block text-black mb-2 text-sm font-semibold">Numero di Telefono *</label>
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
                  Continua → Dettagli Caso
                </Button>
              </form>
            ) : (
              <form onSubmit={handleFinalSubmit} className="space-y-4">
                <div>
                  <label className="block text-black mb-2 text-sm font-semibold">Nome Azienda Truffatrice *</label>
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
                  <label className="block text-black mb-2 text-sm font-semibold">Importo Perso *</label>
                  <Select onValueChange={handleSelectChange} value={formData.amountLost}>
                    <SelectTrigger className="bg-white border-gray-300 text-black rounded-none">
                      <SelectValue placeholder="Seleziona importo" />
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
                  <label className="block text-black mb-2 text-sm font-semibold">Raccontaci cosa è successo *</label>
                  <Textarea
                    name="caseDetails"
                    value={formData.caseDetails}
                    onChange={handleInputChange}
                    placeholder="Descrivi i dettagli della truffa, quando è avvenuta, quali prove hai, ecc."
                    rows={5}
                    className="bg-white border-gray-300 text-black rounded-none"
                    required
                  />
                </div>
                <Button type="submit" disabled={loading} className="w-full bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none text-lg py-6 font-semibold">
                  {loading ? 'Invio in corso...' : 'Invia Richiesta di Consulenza'}
                </Button>
                <button
                  type="button"
                  onClick={() => setFormStep(1)}
                  className="text-gray-700 hover:text-black underline text-sm"
                >
                  ← Torna Indietro
                </button>
              </form>
            )}

            <div className="mt-6 pt-6 border-t border-gray-300 space-y-2">
              <div className="flex items-center gap-2 text-gray-700 text-sm">
                <Shield className="w-4 h-4 text-[#D4AF37]" />
                <span>SRA Regolamentato – ID 8003758</span>
              </div>
              <div className="flex items-center gap-2 text-gray-700 text-sm">
                <CheckCircle className="w-4 h-4 text-[#D4AF37]" />
                <span>Invio Sicuro e Confidenziale</span>
              </div>
              <div className="flex items-center gap-2 text-gray-700 text-sm">
                <MapPin className="w-4 h-4 text-[#D4AF37]" />
                <span>12 Caroline Street, Birmingham B3 1TR</span>
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
      <section id="services" className="bg-black py-20 px-[7.6923%]">
        <div className="max-w-[1400px] mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-5xl font-bold text-white mb-6">I Nostri Servizi Legali</h2>
            <p className="text-xl text-white/85 max-w-3xl mx-auto">
              Offriamo assistenza legale specializzata per vittime di truffe finanziarie online e transfrontaliere
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { icon: <TrendingUp />, title: 'Truffe Crypto', description: 'Recupero fondi da exchange fraudolenti, ICO false e wallet compromessi' },
              { icon: <Globe />, title: 'Frodi Forex', description: 'Azione legale contro broker non regolamentati e piattaforme di trading false' },
              { icon: <Shield />, title: 'Broker Illegali', description: 'Dispute contro broker che operano senza licenza e manipolano i mercati' },
              { icon: <FileText />, title: 'Piattaforme Fake', description: 'Casi contro siti di investimento fraudolenti e schemi Ponzi' },
              { icon: <Scale />, title: 'Protezione Truffe', description: 'Difesa contro truffatori che promettono recupero fondi fasullo' },
              { icon: <CheckCircle />, title: 'Dispute Bancarie', description: 'Assistenza con chargeback e richieste di rimborso presso banche' },
              { icon: <Globe />, title: 'Dispute Internazionali', description: 'Gestione di casi legali cross-border con partnership INTERPOL e Pharos' },
              { icon: <Users />, title: 'Analisi Prove', description: 'Valutazione dettagliata di prove, transazioni e costruzione del caso legale' }
            ].map((service, index) => (
              <div key={index} className="bg-[#121212] border border-white/25 p-6 hover:border-[#00FFD1] transition-all group">
                <div className="w-12 h-12 bg-[#00FFD1] text-black flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  {service.icon}
                </div>
                <h3 className="text-xl font-bold text-white mb-3">{service.title}</h3>
                <p className="text-white/85">{service.description}</p>
              </div>
            ))}
          </div>

          <div className="text-center mt-12">
            <Button onClick={() => handleCTAClick('services')} className="bg-[#00FFD1] text-black hover:bg-[#00FFD1]/90 rounded-none text-lg px-8 py-7">
              Ottieni Consulenza Gratuita <ArrowRight className="ml-2" />
            </Button>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="bg-[#121212] py-20 px-[7.6923%]">
        <div className="max-w-[1400px] mx-auto grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <img
              src="https://images.unsplash.com/photo-1758518731462-d091b0b4ed0d"
              alt="Team legale professionale"
              className="w-full h-[500px] object-cover"
            />
          </div>
          <div>
            <h2 className="text-5xl font-bold text-white mb-6">Chi Siamo</h2>
            <p className="text-xl text-white/85 mb-6 leading-relaxed">
              <strong>1 LAW SOLICITORS LIMITED</strong> è uno studio legale riconosciuto e regolamentato dalla Solicitors Regulation Authority (SRA ID: 8003758), specializzato in dispute legali per truffe finanziarie online e casi transfrontalieri.
            </p>
            <p className="text-xl text-white/85 mb-6 leading-relaxed">
              Il nostro team di avvocati esperti ha gestito con successo centinaia di casi di frodi crypto, forex, broker illegali e piattaforme di investimento false. Lavoriamo con partnership internazionali tra cui <strong>INTERPOL</strong> e <strong>Pharos (Ministero Francese)</strong> per garantire risultati ottimali.
            </p>
            <p className="text-xl text-white/85 mb-8 leading-relaxed">
              Attraverso metodi online e in persona, garantiamo il recupero dei fondi per i nostri clienti utilizzando strategie legali avanzate, analisi delle prove e negoziazioni con le entità coinvolte.
            </p>
            
            <div className="space-y-4 mb-8">
              <div className="flex items-start gap-3">
                <Shield className="w-6 h-6 text-[#00FFD1] mt-1" />
                <div>
                  <h4 className="text-white font-semibold mb-1">Regolamentazione SRA</h4>
                  <p className="text-white/85">Recognised Body Law Practice - SRA ID: 8003758</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <MapPin className="w-6 h-6 text-[#00FFD1] mt-1" />
                <div>
                  <h4 className="text-white font-semibold mb-1">Sede Legale</h4>
                  <p className="text-white/85">12 Caroline Street, Birmingham, England B3 1TR</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Globe className="w-6 h-6 text-[#00FFD1] mt-1" />
                <div>
                  <h4 className="text-white font-semibold mb-1">Partnership Internazionali</h4>
                  <p className="text-white/85">Collaborazione con INTERPOL e Pharos per casi transfrontalieri</p>
                </div>
              </div>
            </div>

            <Button onClick={() => handleCTAClick('about')} className="bg-[#00FFD1] text-black hover:bg-[#00FFD1]/90 rounded-none text-lg px-8 py-7">
              Parla con il Team Legale
            </Button>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="bg-black py-20 px-[7.6923%]">
        <div className="max-w-[1400px] mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-5xl font-bold text-white mb-6">Come Funziona il Processo</h2>
            <p className="text-xl text-white/85 max-w-3xl mx-auto">
              Un processo in 6 fasi per recuperare i tuoi fondi attraverso azione legale strutturata
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              { step: '01', title: 'Invia il Tuo Caso', description: 'Compila il form con i dettagli della truffa, importo perso e prove disponibili' },
              { step: '02', title: 'Revisione Legale', description: 'Un avvocato esamina le tue prove, transazioni e identifica opzioni legali disponibili' },
              { step: '03', title: 'Strategia Legale', description: 'Sviluppiamo una strategia su misura basata sulle circostanze del tuo caso' },
              { step: '04', title: 'Azione Formale', description: 'Inviamo notifiche legali formali e avviamo procedure appropriate' },
              { step: '05', title: 'Negoziazione', description: 'Negoziamo con le entità coinvolte utilizzando partnership internazionali quando necessario' },
              { step: '06', title: 'Risultato Finale', description: 'Recupero fondi o risultato legale a seconda del caso e delle prove disponibili' }
            ].map((item, index) => (
              <div key={index} className="bg-[#121212] border border-white/25 p-6 relative">
                <div className="text-6xl font-bold text-[#00FFD1]/20 absolute top-4 right-4">{item.step}</div>
                <h3 className="text-2xl font-bold text-white mb-4 relative z-10">{item.title}</h3>
                <p className="text-white/85 relative z-10">{item.description}</p>
              </div>
            ))}
          </div>

          <div className="text-center mt-12">
            <Button onClick={() => handleCTAClick('how-it-works')} className="bg-[#00FFD1] text-black hover:bg-[#00FFD1]/90 rounded-none text-lg px-8 py-7">
              Inizia la Tua Revisione Gratuita <ArrowRight className="ml-2" />
            </Button>
          </div>
        </div>
      </section>

      {/* Success Stories Section */}
      <section id="success-stories" className="bg-[#121212] py-20 px-[7.6923%]">
        <div className="max-w-[1400px] mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-5xl font-bold text-white mb-6">Casi di Successo</h2>
            <p className="text-xl text-white/85 max-w-3xl mx-auto">
              Risultati reali per clienti reali - casi anonimizzati per protezione privacy
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                type: 'Truffa Crypto Exchange',
                amount: '€127.000',
                outcome: 'Recupero completo tramite azione legale contro exchange non regolamentato con sede a Malta',
                duration: '8 mesi'
              },
              {
                type: 'Broker Forex Falso',
                amount: '€45.000',
                outcome: 'Recupero del 85% tramite chargeback e procedura legale con partnership bancaria',
                duration: '5 mesi'
              },
              {
                type: 'ICO Fraudolenta',
                amount: '€220.000',
                outcome: 'Recupero del 70% tramite azione legale cross-border con supporto INTERPOL',
                duration: '12 mesi'
              },
              {
                type: 'Piattaforma Trading Fake',
                amount: '€68.000',
                outcome: 'Recupero completo tramite identificazione proprietari e azione legale UK',
                duration: '6 mesi'
              },
              {
                type: 'Truffa Investimenti',
                amount: '€95.000',
                outcome: 'Recupero del 90% tramite negoziazione legale e supporto Pharos',
                duration: '7 mesi'
              },
              {
                type: 'Schema Ponzi Crypto',
                amount: '€380.000',
                outcome: 'Recupero del 65% tramite procedura legale internazionale complessa',
                duration: '14 mesi'
              }
            ].map((story, index) => (
              <div key={index} className="bg-black border border-white/25 p-6 hover:border-[#00FFD1] transition-all">
                <div className="flex items-center gap-2 mb-4">
                  <CheckCircle className="w-5 h-5 text-[#00FFD1]" />
                  <span className="text-[#00FFD1] font-semibold">Caso Risolto</span>
                </div>
                <h3 className="text-xl font-bold text-white mb-3">{story.type}</h3>
                <div className="space-y-2 mb-4">
                  <div className="flex justify-between">
                    <span className="text-white/85">Importo:</span>
                    <span className="text-white font-semibold">{story.amount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/85">Durata:</span>
                    <span className="text-white font-semibold">{story.duration}</span>
                  </div>
                </div>
                <p className="text-white/85 text-sm">{story.outcome}</p>
              </div>
            ))}
          </div>

          <div className="grid md:grid-cols-3 gap-8 mt-16 text-center">
            <div className="bg-black border border-white/25 p-8">
              <div className="text-5xl font-bold text-[#00FFD1] mb-3">500+</div>
              <div className="text-white/85 text-lg">Casi Totali Gestiti</div>
            </div>
            <div className="bg-black border border-white/25 p-8">
              <div className="text-5xl font-bold text-[#00FFD1] mb-3">35+</div>
              <div className="text-white/85 text-lg">Clienti Internazionali</div>
            </div>
            <div className="bg-black border border-white/25 p-8">
              <div className="text-5xl font-bold text-[#00FFD1] mb-3">24h</div>
              <div className="text-white/85 text-lg">Tempo Medio di Risposta</div>
            </div>
          </div>

          <div className="text-center mt-12">
            <Button onClick={() => handleCTAClick('success-stories')} className="bg-[#00FFD1] text-black hover:bg-[#00FFD1]/90 rounded-none text-lg px-8 py-7">
              Richiedi la Tua Consulenza <ArrowRight className="ml-2" />
            </Button>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="bg-black py-20 px-[7.6923%]">
        <div className="max-w-[900px] mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-5xl font-bold text-white mb-6">Domande Frequenti</h2>
            <p className="text-xl text-white/85">Risposte alle domande più comuni sul processo di recupero fondi</p>
          </div>

          <Accordion type="single" collapsible className="space-y-4">
            <AccordionItem value="item-1" className="bg-[#121212] border border-white/25 px-6">
              <AccordionTrigger className="text-white text-lg font-semibold hover:text-[#00FFD1]">
                Come funziona la consulenza gratuita?
              </AccordionTrigger>
              <AccordionContent className="text-white/85 text-base leading-relaxed">
                Dopo aver inviato il form, un avvocato del nostro team esaminerà il tuo caso entro 24 ore. Valuteremo le prove, le transazioni e le circostanze della truffa per determinare le opzioni legali disponibili. La consulenza iniziale è completamente gratuita e senza impegno.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-2" className="bg-[#121212] border border-white/25 px-6">
              <AccordionTrigger className="text-white text-lg font-semibold hover:text-[#00FFD1]">
                Quali documenti sono necessari?
              </AccordionTrigger>
              <AccordionContent className="text-white/85 text-base leading-relaxed">
                Idealmente: screenshot di conversazioni, conferme di transazioni, indirizzi wallet, contratti o accordi, prove di comunicazione con i truffatori, estratti conto bancari. Tuttavia, anche con documentazione limitata possiamo valutare il caso e guidarti nella raccolta delle prove necessarie.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-3" className="bg-[#121212] border border-white/25 px-6">
              <AccordionTrigger className="text-white text-lg font-semibold hover:text-[#00FFD1]">
                Quanto tempo richiede il recupero fondi?
              </AccordionTrigger>
              <AccordionContent className="text-white/85 text-base leading-relaxed">
                Dipende dalla complessità del caso. Casi semplici con broker regolamentati possono richiedere 3-6 mesi. Casi internazionali complessi possono richiedere 8-14 mesi. Durante la consulenza iniziale forniremo una stima basata sul tuo caso specifico.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-4" className="bg-[#121212] border border-white/25 px-6">
              <AccordionTrigger className="text-white text-lg font-semibold hover:text-[#00FFD1]">
                Gestite casi internazionali?
              </AccordionTrigger>
              <AccordionContent className="text-white/85 text-base leading-relaxed">
                Sì, abbiamo esperienza in dispute cross-border e collaboriamo con INTERPOL e Pharos (Ministero Francese) per casi internazionali. Abbiamo gestito con successo casi in oltre 35 paesi, inclusi situazioni con exchange esteri, broker offshore e piattaforme internazionali.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-5" className="bg-[#121212] border border-white/25 px-6">
              <AccordionTrigger className="text-white text-lg font-semibold hover:text-[#00FFD1]">
                Quando è possibile recuperare i fondi?
              </AccordionTrigger>
              <AccordionContent className="text-white/85 text-base leading-relaxed">
                In molti casi, l'azione legale può aiutare i clienti a recuperare i fondi, a seconda delle prove, dei dettagli della transazione e delle circostanze della truffa. I fattori chiave includono: identificabilità dei truffatori, tracciabilità delle transazioni, giurisdizione applicabile, e tempestività dell'azione legale. Garantiamo il recupero attraverso metodi online, in persona e partnership internazionali.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-6" className="bg-[#121212] border border-white/25 px-6">
              <AccordionTrigger className="text-white text-lg font-semibold hover:text-[#00FFD1]">
                Quali sono i costi?
              </AccordionTrigger>
              <AccordionContent className="text-white/85 text-base leading-relaxed">
                La consulenza iniziale è gratuita. Per casi che decidiamo di accettare, lavoriamo con diverse strutture di compenso a seconda della complessità: fee fisse, fee orarie, o fee basate su successo. Discuteremo tutte le opzioni durante la consulenza iniziale e non ci saranno costi nascosti.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-7" className="bg-[#121212] border border-white/25 px-6">
              <AccordionTrigger className="text-white text-lg font-semibold hover:text-[#00FFD1]">
                Parlerò direttamente con un avvocato?
              </AccordionTrigger>
              <AccordionContent className="text-white/85 text-base leading-relaxed">
                Sì, dopo la valutazione iniziale del caso, sarai assegnato a un avvocato dedicato che gestirà personalmente il tuo caso. Avrai comunicazione diretta con il tuo avvocato durante tutto il processo, con aggiornamenti regolari sullo stato del caso.
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <div className="text-center mt-12">
            <Button onClick={() => handleCTAClick('faq')} className="bg-[#00FFD1] text-black hover:bg-[#00FFD1]/90 rounded-none text-lg px-8 py-7">
              Invia il Tuo Caso <ArrowRight className="ml-2" />
            </Button>
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="bg-[#00FFD1] py-20 px-[7.6923%]">
        <div className="max-w-[1400px] mx-auto text-center">
          <h2 className="text-5xl font-bold text-black mb-6">
            Pronto a Recuperare i Tuoi Fondi?
          </h2>
          <p className="text-xl text-black/85 mb-8 max-w-3xl mx-auto">
            Non aspettare. Ogni giorno conta. Ottieni una valutazione legale gratuita e scopri come possiamo aiutarti a recuperare i tuoi fondi attraverso azione legale strutturata.
          </p>
          <Button onClick={() => handleCTAClick('final-cta')} className="bg-black text-white hover:bg-black/90 rounded-none text-lg px-12 py-7">
            Ottieni Consulenza Gratuita Ora <ArrowRight className="ml-2" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-black py-16 px-[7.6923%] border-t border-white/25">
        <div className="max-w-[1400px] mx-auto">
          <div className="grid md:grid-cols-3 gap-12 mb-12">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <Scale className="w-8 h-8 text-[#00FFD1]" />
                <span className="text-white text-xl font-semibold">1 LAW SOLICITORS</span>
              </div>
              <p className="text-white/85 mb-4">
                Recognised Body Law Practice<br />
                SRA Regolamentato<br />
                SRA ID: 8003758
              </p>
            </div>
            
            <div>
              <h4 className="text-white font-semibold mb-4 text-lg">Contatti</h4>
              <div className="space-y-3">
                <div className="flex items-start gap-2 text-white/85">
                  <MapPin className="w-5 h-5 text-[#00FFD1] mt-1" />
                  <span>12 Caroline Street<br />Birmingham, England<br />B3 1TR</span>
                </div>
                <div className="flex items-center gap-2 text-white/85">
                  <Phone className="w-5 h-5 text-[#00FFD1]" />
                  <span>+44 (disponibile nel form)</span>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-white font-semibold mb-4 text-lg">Informazioni Legali</h4>
              <p className="text-white/85 text-sm mb-2">
                Tipo: Private Limited Company<br />
                Costituita: 9 Settembre 2021<br />
                SIC Code: 69102 – Solicitors
              </p>
            </div>
          </div>

          <div className="border-t border-white/25 pt-8 text-center">
            <p className="text-white/85">
              © {new Date().getFullYear()} 1 LAW SOLICITORS LIMITED. Tutti i diritti riservati.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Home;