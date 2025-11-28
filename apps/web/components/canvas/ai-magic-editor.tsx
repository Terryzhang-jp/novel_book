import { useState } from 'react';
import { X, Wand2, Loader2, Check, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

interface AiMagicEditorProps {
    initialImage: string;
    onApply: (newImage: string) => void;
    onClose: () => void;
}

export function AiMagicEditor({ initialImage, onApply, onClose }: AiMagicEditorProps) {
    const [prompt, setPrompt] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [resultImage, setResultImage] = useState<string | null>(null);

    const handleEdit = async () => {
        if (!prompt.trim()) return;

        setIsGenerating(true);
        setResultImage(null);

        try {
            const response = await fetch('/api/edit-image', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    image: initialImage,
                    prompt
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to edit image');
            }

            if (data.image) {
                const dataUrl = `data:${data.mimeType};base64,${data.image}`;
                setResultImage(dataUrl);
            }
        } catch (error) {
            console.error('Editing error:', error);
            toast.error(error instanceof Error ? error.message : 'Failed to edit image');
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-white rounded-xl shadow-2xl border border-gray-200 w-[500px] overflow-hidden animate-in fade-in zoom-in duration-200">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gradient-to-r from-purple-50 to-pink-50">
                <div className="flex items-center gap-2 text-purple-600">
                    <Wand2 className="w-5 h-5" />
                    <h3 className="font-semibold">AI Magic Editor</h3>
                </div>
                <button
                    onClick={onClose}
                    className="p-1 hover:bg-white/50 rounded-lg transition-colors"
                >
                    <X className="w-4 h-4 text-gray-500" />
                </button>
            </div>

            <div className="p-4 space-y-4">
                {/* Image Preview Area */}
                <div className="flex items-center gap-4">
                    <div className="flex-1 space-y-2">
                        <span className="text-xs font-medium text-gray-500 uppercase">Original</span>
                        <div className="aspect-video rounded-lg overflow-hidden border border-gray-200 bg-gray-50 relative">
                            <img
                                src={initialImage}
                                alt="Original"
                                className="w-full h-full object-contain"
                            />
                        </div>
                    </div>

                    {resultImage && (
                        <>
                            <ArrowRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
                            <div className="flex-1 space-y-2 animate-in fade-in slide-in-from-left-4 duration-300">
                                <span className="text-xs font-medium text-purple-600 uppercase">Result</span>
                                <div className="aspect-video rounded-lg overflow-hidden border border-purple-200 bg-purple-50 relative">
                                    <img
                                        src={resultImage}
                                        alt="Result"
                                        className="w-full h-full object-contain"
                                    />
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Input Area */}
                <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">
                        Instructions
                    </label>
                    <div className="relative">
                        <textarea
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder="e.g., Remove the background but keep the table..."
                            className="w-full h-20 p-3 pr-24 rounded-lg border border-gray-200 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none resize-none text-sm"
                            disabled={isGenerating}
                        />
                        <button
                            onClick={handleEdit}
                            disabled={!prompt.trim() || isGenerating}
                            className="absolute bottom-3 right-3 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-md text-xs font-medium transition-colors flex items-center gap-1.5"
                        >
                            {isGenerating ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                                <Wand2 className="w-3 h-3" />
                            )}
                            Magic Edit
                        </button>
                    </div>
                </div>

                {/* Actions */}
                {resultImage && (
                    <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                        <button
                            onClick={() => setResultImage(null)}
                            className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            Discard
                        </button>
                        <button
                            onClick={() => {
                                onApply(resultImage);
                                onClose();
                            }}
                            className="px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors flex items-center gap-2"
                        >
                            <Check className="w-4 h-4" />
                            Apply Changes
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
