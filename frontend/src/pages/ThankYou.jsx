import React, { useEffect } from 'react';
import { CheckCircle, ArrowLeft } from 'lucide-react';
import { Button } from '../components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const ThankYou = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  useEffect(() => {
    // Scroll to top
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-black text-white py-4 px-[7.6923%]">
        <div className="max-w-[1400px] mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#D4AF37] flex items-center justify-center">
              <span className="text-black font-bold text-xl">1</span>
            </div>
            <span className="text-xl font-bold">LAW SOLICITORS</span>
          </div>
        </div>
      </header>

      {/* Thank You Content */}
      <div className="py-20 px-[7.6923%]">
        <div className="max-w-[800px] mx-auto text-center">
          {/* Success Icon */}
          <div className="flex justify-center mb-8">
            <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="w-16 h-16 text-green-600" />
            </div>
          </div>

          {/* Main Message */}
          <h1 className="text-4xl md:text-5xl font-bold text-black mb-6">
            {t('thankYou.title')}
          </h1>
          
          <p className="text-xl text-gray-700 mb-8 leading-relaxed">
            {t('thankYou.message')}
          </p>

          {/* Info Box */}
          <div className="bg-[#D4AF37]/10 border-2 border-[#D4AF37] p-8 rounded mb-8 text-left">
            <h2 className="text-2xl font-bold text-black mb-4">{t('thankYou.whatHappensNow')}</h2>
            <ul className="space-y-3 text-gray-700">
              <li className="flex items-start gap-3">
                <div className="w-6 h-6 bg-[#D4AF37] text-black flex items-center justify-center rounded-full flex-shrink-0 mt-0.5">
                  <span className="text-sm font-bold">1</span>
                </div>
                <span>{t('thankYou.step1')}</span>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-6 h-6 bg-[#D4AF37] text-black flex items-center justify-center rounded-full flex-shrink-0 mt-0.5">
                  <span className="text-sm font-bold">2</span>
                </div>
                <span>{t('thankYou.step2')}</span>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-6 h-6 bg-[#D4AF37] text-black flex items-center justify-center rounded-full flex-shrink-0 mt-0.5">
                  <span className="text-sm font-bold">3</span>
                </div>
                <span>{t('thankYou.step3')}</span>
              </li>
            </ul>
          </div>

          {/* Back Button */}
          <Button 
            onClick={() => navigate('/')}
            className="bg-black text-white hover:bg-gray-800 rounded-none px-8 py-6 text-lg"
          >
            <ArrowLeft className="mr-2" />
            {t('thankYou.backToHome')}
          </Button>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-black text-white py-12 px-[7.6923%]">
        <div className="max-w-[1400px] mx-auto text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-10 h-10 bg-[#D4AF37] flex items-center justify-center">
              <span className="text-black font-bold text-xl">1</span>
            </div>
            <span className="text-xl font-bold">LAW SOLICITORS</span>
          </div>
          <p className="text-gray-400 text-sm mb-2">
            {t('thankYou.footerTagline')}
          </p>
          <p className="text-gray-500 text-xs">
            {t('thankYou.copyright')}
          </p>
        </div>
      </footer>

      {/* Lead Conversion Tracking Pixel */}
      <iframe 
        src="https://1law-studiolegale.com/pixels/pixel_page_lead.html" 
        width="1" 
        height="1" 
        style={{display: 'none', border: 'none'}} 
        title="Lead Tracking"
      />
    </div>
  );
};

export default ThankYou;
