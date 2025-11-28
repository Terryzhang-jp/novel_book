import { useState, useRef } from 'react';
import { X, Sparkles, Loader2, Plus, Upload, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';

interface AiImageGeneratorProps {
    onGenerate: (dataUrl: string) => void;
    onClose: () => void;
}

export function AiImageGenerator({ onGenerate, onClose }: AiImageGeneratorProps) {
    const [prompt, setPrompt] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedImage, setGeneratedImage] = useState<string | null>(null);
    const [referenceImage, setReferenceImage] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => setReferenceImage(e.target?.result as string);
            reader.readAsDataURL(file);
        }
    };

    const handleGenerate = async () => {
        if (!prompt.trim()) return;

        setIsGenerating(true);
        setGeneratedImage(null);

        try {
            const endpoint = referenceImage ? '/api/edit-image' : '/api/generate-image';
            const body = referenceImage
                ? { image: referenceImage, prompt }
                : { prompt };

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to generate image');
            }

            if (data.image) {
                const dataUrl = `data:${data.mimeType};base64,${data.image}`;
                setGeneratedImage(dataUrl);
            }
        } catch (error) {
            console.error('Generation error:', error);
            toast.error(error instanceof Error ? error.message : 'Failed to generate image');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleAddToCanvas = () => {
        if (generatedImage) {
            onGenerate(generatedImage);
            onClose();
        }
    };

    return (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-white rounded-xl shadow-2xl border border-gray-200 w-96 overflow-hidden animate-in fade-in zoom-in duration-200">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-indigo-50">
                <div className="flex items-center gap-2 text-indigo-600">
                    <Sparkles className="w-5 h-5" />
                    <h3 className="font-semibold">AI Image Generator</h3>
                </div>
                <button
                    onClick={onClose}
                    className="p-1 hover:bg-white/50 rounded-lg transition-colors"
                >
                    <X className="w-4 h-4 text-gray-500" />
                </button>
            </div>

            <div className="p-4 space-y-4">
                {/* Reference Image Upload */}
                {!generatedImage && (
                    <div
                        onClick={() => fileInputRef.current?.click()}
                        className={`relative rounded-lg border-2 border-dashed transition-colors cursor-pointer overflow-hidden group ${referenceImage ? 'border-indigo-200 bg-indigo-50' : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'
                            }`}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleFileSelect}
                            className="hidden"
                        />

                        {referenceImage ? (
                            <div className="relative aspect-video">
                                <img
                                    src={referenceImage}
                                    alt="Reference"
                                    className="w-full h-full object-contain"
                                />
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setReferenceImage(null);
                                    }}
                                    className="absolute top-2 right-2 p-1 bg-white/80 hover:bg-white rounded-full text-gray-500 hover:text-red-500 transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        ) : (
                            <div className="py-6 flex flex-col items-center gap-2 text-gray-400 group-hover:text-indigo-500">
                                <Upload className="w-8 h-8" />
                                <span className="text-xs font-medium">Upload reference image (optional)</span>
                            </div>
                        )}
                    </div>
                )}

                {/* Input Area */}
                <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">
                        {referenceImage ? 'Instructions' : 'Describe the image'}
                    </label>
                    <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder={referenceImage ? "Make it look like a sketch..." : "A watercolor painting of a cozy cafe..."}
                        className="w-full h-24 p-3 rounded-lg border border-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none resize-none text-sm"
                        disabled={isGenerating}
                    />
                </div>

                {/* Generate Button */}
                {!generatedImage && (
                    <button
                        onClick={handleGenerate}
                        disabled={!prompt.trim() || isGenerating}
                        className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                    >
                        {isGenerating ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                {referenceImage ? 'Editing...' : 'Generating...'}
                            </>
                        ) : (
                            <>
                                <Sparkles className="w-4 h-4" />
                                {referenceImage ? 'Magic Edit' : 'Generate Image'}
                            </>
                        )}
                    </button>
                )}

                {/* Result Area */}
                {generatedImage && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <div className="relative aspect-square rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
                            <img
                                src={generatedImage}
                                alt="Generated"
                                className="w-full h-full object-cover"
                            />
                        </div>

                        <div className="flex gap-2">
                            <button
                                onClick={() => setGeneratedImage(null)}
                                className="flex-1 py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors"
                            >
                                Try Again
                            </button>
                            <button
                                onClick={handleAddToCanvas}
                                className="flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                            >
                                <Plus className="w-4 h-4" />
                                Add to Canvas
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
