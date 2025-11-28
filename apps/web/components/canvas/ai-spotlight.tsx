import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Wand2, Image as ImageIcon, X, ArrowRight, Loader2, Upload, Command } from 'lucide-react';
import { toast } from 'sonner';

interface AiSpotlightProps {
    selectedImage?: string | null;
    onGenerate: (dataUrl: string) => void;
    onEdit: (dataUrl: string) => void;
    onClose: () => void;
}

export function AiSpotlight({ selectedImage, onGenerate, onEdit, onClose }: AiSpotlightProps) {
    const [prompt, setPrompt] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [resultImage, setResultImage] = useState<string | null>(null);
    const [referenceImage, setReferenceImage] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // Focus input on mount
    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const mode = selectedImage ? 'edit' : 'generate';

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => setReferenceImage(e.target?.result as string);
            reader.readAsDataURL(file);
        }
    };

    const handleSubmit = async () => {
        if (!prompt.trim()) return;

        setIsProcessing(true);
        setResultImage(null);

        try {
            let endpoint = '/api/generate-image';
            let body: any = { prompt };

            if (mode === 'edit' && selectedImage) {
                endpoint = '/api/edit-image';
                body = { image: selectedImage, prompt };
            } else if (mode === 'generate' && referenceImage) {
                endpoint = '/api/edit-image'; // Use edit endpoint for reference image generation too
                body = { image: referenceImage, prompt };
            }

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            const data = await response.json();

            if (!response.ok) throw new Error(data.error || 'Failed to process');

            if (data.image) {
                const dataUrl = `data:${data.mimeType};base64,${data.image}`;
                setResultImage(dataUrl);
            }
        } catch (error) {
            console.error('AI Error:', error);
            toast.error(error instanceof Error ? error.message : 'Something went wrong');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleApply = () => {
        if (!resultImage) return;

        if (mode === 'edit') {
            onEdit(resultImage);
        } else {
            onGenerate(resultImage);
        }
        onClose();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
        if (e.key === 'Escape') {
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm" onClick={onClose}>
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                onClick={(e) => e.stopPropagation()}
                className="w-[600px] bg-white/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 overflow-hidden flex flex-col"
            >
                {/* Input Section */}
                <div className="p-4 flex gap-4 items-start">
                    <div className="mt-1 p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg text-white">
                        {mode === 'edit' ? <Wand2 className="w-6 h-6" /> : <Sparkles className="w-6 h-6" />}
                    </div>

                    <div className="flex-1 min-w-0">
                        <textarea
                            ref={inputRef}
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={mode === 'edit' ? "Describe how to change this image..." : "Describe the image you want to create..."}
                            className="w-full bg-transparent border-none outline-none text-lg font-medium text-gray-800 placeholder:text-gray-400 resize-none h-14 py-1"
                            disabled={isProcessing}
                        />

                        <div className="flex items-center gap-2 mt-2">
                            {/* Context Badge */}
                            <div className="px-2 py-1 rounded-md bg-gray-100/50 border border-gray-200/50 text-xs font-medium text-gray-500 flex items-center gap-1.5">
                                {mode === 'edit' ? (
                                    <>
                                        <ImageIcon className="w-3 h-3" />
                                        <span>Editing Selection</span>
                                    </>
                                ) : (
                                    <>
                                        <Command className="w-3 h-3" />
                                        <span>Generation Mode</span>
                                    </>
                                )}
                            </div>

                            {/* Reference Image Badge (Generate Mode) */}
                            {mode === 'generate' && (
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    className={`px-2 py-1 rounded-md border text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors ${referenceImage
                                            ? 'bg-indigo-50 border-indigo-200 text-indigo-600'
                                            : 'bg-gray-100/50 border-gray-200/50 text-gray-500 hover:bg-gray-200/50'
                                        }`}
                                >
                                    <Upload className="w-3 h-3" />
                                    <span>{referenceImage ? 'Reference Added' : 'Add Reference'}</span>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*"
                                        onChange={handleFileSelect}
                                        className="hidden"
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    <button
                        onClick={handleSubmit}
                        disabled={!prompt.trim() || isProcessing}
                        className="self-start p-2 rounded-xl bg-gray-900 text-white hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md"
                    >
                        {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
                    </button>
                </div>

                {/* Preview Section */}
                <AnimatePresence>
                    {(resultImage || (mode === 'edit' && selectedImage) || referenceImage) && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="border-t border-gray-200/50 bg-gray-50/50"
                        >
                            <div className="p-4 flex items-center gap-4 overflow-x-auto">
                                {/* Original / Reference */}
                                {(selectedImage || referenceImage) && (
                                    <div className="relative group flex-shrink-0">
                                        <span className="absolute -top-2 left-2 px-2 py-0.5 bg-white/90 backdrop-blur text-[10px] font-bold text-gray-500 rounded-full shadow-sm border border-gray-100">
                                            {mode === 'edit' ? 'ORIGINAL' : 'REFERENCE'}
                                        </span>
                                        <div className="h-32 aspect-square rounded-lg overflow-hidden border border-gray-200 bg-white shadow-sm">
                                            <img
                                                src={selectedImage || referenceImage!}
                                                alt="Source"
                                                className="w-full h-full object-cover"
                                            />
                                        </div>
                                        {referenceImage && mode === 'generate' && (
                                            <button
                                                onClick={() => setReferenceImage(null)}
                                                className="absolute -top-1 -right-1 p-1 bg-white rounded-full shadow-md border border-gray-100 opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <X className="w-3 h-3 text-gray-500" />
                                            </button>
                                        )}
                                    </div>
                                )}

                                {/* Arrow */}
                                {resultImage && (selectedImage || referenceImage) && (
                                    <ArrowRight className="w-5 h-5 text-gray-300 flex-shrink-0" />
                                )}

                                {/* Result */}
                                {resultImage && (
                                    <div className="relative flex-shrink-0">
                                        <span className="absolute -top-2 left-2 px-2 py-0.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-[10px] font-bold text-white rounded-full shadow-sm">
                                            RESULT
                                        </span>
                                        <div className="h-32 aspect-square rounded-lg overflow-hidden border border-indigo-100 bg-white shadow-md ring-2 ring-indigo-500/20">
                                            <img
                                                src={resultImage}
                                                alt="Result"
                                                className="w-full h-full object-cover"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Actions */}
                            {resultImage && (
                                <div className="p-4 pt-0 flex justify-end gap-2">
                                    <button
                                        onClick={() => setResultImage(null)}
                                        className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                                    >
                                        Discard
                                    </button>
                                    <button
                                        onClick={handleApply}
                                        className="px-4 py-2 text-sm font-medium text-white bg-gray-900 hover:bg-black rounded-lg transition-colors shadow-lg shadow-gray-900/20"
                                    >
                                        Apply to Canvas
                                    </button>
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </div>
    );
}
