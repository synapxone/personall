import { useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Barcode } from 'lucide-react';
import { motion } from 'framer-motion';

interface Props {
    onScan: (barcode: string) => void;
    onClose: () => void;
}

export default function BarcodeScanner({ onScan, onClose }: Props) {
    const scannerRef = useRef<Html5Qrcode | null>(null);

    useEffect(() => {
        const scannerId = "barcode-reader";
        const html5QrCode = new Html5Qrcode(scannerId);
        scannerRef.current = html5QrCode;

        const startScanner = async () => {
            try {
                const config = {
                    fps: 20,
                    qrbox: { width: 280, height: 180 },
                    aspectRatio: 1.333334
                };

                await html5QrCode.start(
                    { facingMode: "environment" },
                    config,
                    (decodedText) => {
                        html5QrCode.stop().then(() => {
                            onScan(decodedText);
                        }).catch(() => onScan(decodedText));
                    },
                    undefined // ignore errors
                );
            } catch (err) {
                console.error("Erro ao iniciar câmera:", err);
            }
        };

        const timer = setTimeout(startScanner, 300);

        return () => {
            clearTimeout(timer);
            if (html5QrCode.isScanning) {
                html5QrCode.stop().catch(e => console.error("Erro ao parar scanner", e));
            }
        };
    }, [onScan]);

    return (
        <div className="flex flex-col gap-4">
            {/* Live scanner container */}
            <div className="relative w-full rounded-2xl overflow-hidden bg-black aspect-[4/3]">
                <div id="barcode-reader" className="w-full h-full" />

                {/* Visual Overlay for frame effect matching camera mode */}
                <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
                    <div className="w-3/4 h-1/2 border-2 border-dashed border-primary/60 rounded-xl" />
                    <motion.div
                        animate={{ opacity: [0.4, 1, 0.4] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                        className="absolute top-4 left-4 flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10"
                    >
                        <Barcode size={14} className="text-primary" />
                        <span className="text-[10px] text-white font-bold uppercase tracking-wider">Scanner Ativo</span>
                    </motion.div>
                </div>
            </div>

            <p className="text-center text-gray-500 text-xs text-balance px-4">
                Enquadre o código de barras no centro para identificação automática
            </p>

            <div className="flex gap-3">
                <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 py-3 rounded-xl text-sm font-semibold text-gray-400"
                    style={{ backgroundColor: 'rgba(var(--text-main-rgb), 0.06)' }}
                >
                    Cancelar
                </button>
                <div className="flex-[2] flex items-center justify-center p-4 rounded-xl border border-dashed border-border-main opacity-50">
                    <p className="text-text-muted text-[10px] uppercase font-bold tracking-tighter">Aguardando Leitura...</p>
                </div>
            </div>
        </div>
    );
}
