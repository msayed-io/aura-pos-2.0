import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { XIcon } from '../Icons';

// This makes Cropper available on the window object after the script loads
declare const Cropper: any;
// Add Cropper to window interface for type safety
declare global {
    interface Window {
        Cropper: any;
    }
}


interface AspectRatioOption {
  label: string;
  value: number;
}

interface ImageCropperModalProps {
  imageSrc: string;
  onClose: () => void;
  onCropComplete: (croppedImage: string) => void;
  aspectRatios?: AspectRatioOption[];
  defaultAspectRatio?: number;
}

const CROPPER_SCRIPT_URL = 'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.6.2/cropper.min.js';
const CROPPER_CSS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.6.2/cropper.min.css';


const ImageCropperModal: React.FC<ImageCropperModalProps> = ({
  imageSrc,
  onClose,
  onCropComplete,
  aspectRatios = [{ label: '9:16', value: 9 / 16 }],
  defaultAspectRatio = 9 / 16,
}) => {
  const imageRef = useRef<HTMLImageElement>(null);
  const cropperRef = useRef<any>(null);
  const [activeAspectRatio, setActiveAspectRatio] = useState(defaultAspectRatio);
  const [isScriptLoaded, setIsScriptLoaded] = useState(!!window.Cropper);

  // Effect to load the Cropper.js script and CSS dynamically and safely
  useEffect(() => {
    // Load CSS
    if (!document.querySelector(`link[href="${CROPPER_CSS_URL}"]`)) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = CROPPER_CSS_URL;
        document.head.appendChild(link);
    }
    
    if (window.Cropper) {
      if (!isScriptLoaded) setIsScriptLoaded(true);
      return;
    }

    const script = document.createElement('script');
    script.src = CROPPER_SCRIPT_URL;
    script.async = true;
    script.onload = () => setIsScriptLoaded(true);
    script.onerror = () => {
      console.error('Failed to load Cropper.js script. Image cropping will not work.');
    };

    document.body.appendChild(script);

  }, [isScriptLoaded]);

  // Effect to initialize Cropper *after* the script has loaded
  useEffect(() => {
    if (isScriptLoaded && imageRef.current) {
      if (cropperRef.current) {
        cropperRef.current.destroy();
      }
      
      const cropper = new Cropper(imageRef.current, {
        aspectRatio: activeAspectRatio,
        viewMode: 2,
        background: false,
        autoCropArea: 1,
        responsive: true,
        movable: true,
        zoomable: true,
      });
      cropperRef.current = cropper;
    }

    return () => {
      if (cropperRef.current) {
        cropperRef.current.destroy();
      }
    };
  }, [imageSrc, activeAspectRatio, isScriptLoaded]);
  
  const handleAspectRatioChange = (ratio: number) => {
    setActiveAspectRatio(ratio);
    if (cropperRef.current) {
        cropperRef.current.setAspectRatio(ratio);
    }
  }

  const handleConfirmCrop = () => {
    if (cropperRef.current) {
      const croppedCanvas = cropperRef.current.getCroppedCanvas({
        width: 1200, // High quality output
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
      });
      if (croppedCanvas) {
        onCropComplete(croppedCanvas.toDataURL('image/png', 1.0));
      }
    }
  };

  const portalRoot = document.getElementById('modal-root');
  if (!portalRoot) {
    console.error("Modal root element #modal-root not found in the DOM.");
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 modal-backdrop-blur" onClick={onClose}>
      <div className="relative bg-neo-bg rounded-2xl shadow-xl w-full max-w-2xl animate-scale-in" onClick={e => e.stopPropagation()}>
        <header className="px-5 py-4 border-b border-neo-soft-gray bg-white rounded-t-2xl flex justify-between items-center">
          <h2 className="text-xl font-bold font-cairo text-neo-secondary">قص الصورة</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-neo-soft-gray text-neo-secondary/70"><XIcon className="w-5 h-5"/></button>
        </header>
        
        <main className="p-4">
          <div className="max-h-[60vh] bg-gray-800">
            {!isScriptLoaded && <div className="text-white text-center p-8">جاري تحميل أداة قص الصور...</div>}
            <img ref={imageRef} src={imageSrc} style={{ maxWidth: '100%', opacity: isScriptLoaded ? 1 : 0 }} alt="Source for cropping" />
          </div>
        </main>
        
        <footer className="p-4 bg-white border-t border-neo-soft-gray flex flex-col sm:flex-row justify-between items-center gap-4 rounded-b-2xl">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-neo-secondary/80">الأبعاد:</span>
            {aspectRatios.map(ar => (
              <button 
                key={ar.label} 
                onClick={() => handleAspectRatioChange(ar.value)}
                disabled={!isScriptLoaded || aspectRatios.length === 1}
                className={`px-4 py-2 rounded-lg font-bold transition-colors text-sm ${ar.value === activeAspectRatio ? 'bg-neo-primary text-white' : 'bg-neo-soft-gray text-neo-secondary/80 hover:bg-gray-200'} disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                  {ar.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="px-6 py-2.5 bg-neo-soft-gray text-neo-secondary/80 font-bold rounded-lg hover:bg-gray-200 transition">إلغاء</button>
            <button onClick={handleConfirmCrop} disabled={!isScriptLoaded} className="px-8 py-2.5 bg-neo-primary text-white font-bold rounded-lg hover:bg-neo-accent transition disabled:opacity-50">تأكيد</button>
          </div>
        </footer>
      </div>
    </div>,
    portalRoot
  );
};

export default ImageCropperModal;
