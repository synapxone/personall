import { useEffect, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { X } from 'lucide-react';

interface Props {
    onScan: (barcode: string) => void;
    onClose: () => void;
}

export default function BarcodeScanner({ onScan, onClose }: Props) {
    const scannerRef = useRef<Html5QrcodeScanner | null>(null);

    useEffect(() => {
        scannerRef.current = new Html5QrcodeScanner(
            "barcode-reader",
            { fps: 10, qrbox: { width: 250, height: 150 } },
            /* verbose= */ false
        );

        scannerRef.current.render((decodedText) => {
            // Success
            if (scannerRef.current) {
                scannerRef.current.clear().then(() => {
                    onScan(decodedText);
                }).catch(err => {
                    console.error("Failed to clear scanner", err);
                    onScan(decodedText);
                });
            }
        }, (_errorMessage) => {
            // Error is usually just "No barcode detected" every 100ms, so we ignore it
        });

        return () => {
            if (scannerRef.current) {
                scannerRef.current.clear().catch(err => console.error("Scanner cleanup failed", err));
            }
        };
    }, []);

    return (
        <div className="flex flex-col gap-4 relative">
            <div className="flex items-center justify-between">
                <h3 className="text-text-main font-bold">Escanear Código de Barras</h3>
                <button onClick={onClose} className="text-text-muted hover:text-text-main">
                    <X size={20} />
                </button>
            </div>

            <div id="barcode-reader" className="w-full rounded-2xl overflow-hidden border border-border-main bg-black min-h-[300px]" />

            <p className="text-center text-text-muted text-xs">
                Aponte a câmera para o código de barras do produto.
            </p>
        </div>
    );
}
