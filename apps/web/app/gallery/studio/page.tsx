"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Upload, Image as ImageIcon, ArrowLeft, Loader2, Download, Wand2 } from "lucide-react";
import { ProfessionalPhotoEditor } from "@/components/gallery/professional-photo-editor";
import { PosterGenerator, usePosterGenerator } from "@/components/poster/poster-generator";
import { PhotographyTemplate } from "@/components/poster/templates/photography";
import { MinimalTemplate } from "@/components/poster/templates/minimal";
import { ModernTemplate } from "@/components/poster/templates/modern";
import { GalleryTemplate } from "@/components/poster/templates/gallery";
import type { PosterData, TemplateId } from "@/lib/poster/types";
import { AppLayout } from "@/components/layout/app-layout";
import { PhotoPickerModal } from "@/components/gallery/photo-picker-modal";
import exifr from "exifr";
import type { Photo } from "@/types/storage";

type Step = "select" | "edit" | "poster";

export default function StudioPage() {
    const router = useRouter();
    const [step, setStep] = useState<Step>("select");
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [editedBlob, setEditedBlob] = useState<Blob | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    // Poster state
    const [posterData, setPosterData] = useState<PosterData | null>(null);
    const [selectedTemplate, setSelectedTemplate] = useState<TemplateId>('photography');
    const [aspectRatio, setAspectRatio] = useState<string>("1:1");
    const [originalDimensions, setOriginalDimensions] = useState<{ width: number; height: number } | null>(null);
    const [generatingTemplate, setGeneratingTemplate] = useState<TemplateId | null>(null);
    const [showPhotoPicker, setShowPhotoPicker] = useState(false);
    const { downloadSingle } = usePosterGenerator();

    // Handle file selection
    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setSelectedFile(file);
            const url = URL.createObjectURL(file);
            setImageUrl(url);

            // Get dimensions
            const img = new Image();
            img.onload = () => {
                setOriginalDimensions({ width: img.width, height: img.height });
            };
            img.src = url;

            setStep("edit");
        }
    };

    // Handle photo selection from gallery
    const handlePhotoSelect = async (photo: Photo) => {
        setSelectedFile(null); // Clear file selection
        setImageUrl(photo.fileUrl);

        // Get dimensions
        const img = new Image();
        img.onload = () => {
            setOriginalDimensions({ width: img.width, height: img.height });
        };
        img.src = photo.fileUrl;

        // Default values
        let exifData = {
            iso: "ISO 100",
            aperture: "f/2.8",
            shutterSpeed: "1/125s",
            focalLength: "35mm",
            lensModel: "FE 35mm F1.4 GM"
        };

        // Try to parse real EXIF from the image URL
        try {
            const exif = await exifr.parse(photo.fileUrl);
            if (exif) {
                exifData = {
                    iso: exif.ISO ? `ISO ${exif.ISO}` : exifData.iso,
                    aperture: exif.FNumber ? `f/${exif.FNumber}` : exifData.aperture,
                    shutterSpeed: exif.ExposureTime ? (exif.ExposureTime >= 1 ? `${exif.ExposureTime}s` : `1/${Math.round(1 / exif.ExposureTime)}s`) : exifData.shutterSpeed,
                    focalLength: exif.FocalLength ? `${exif.FocalLength}mm` : exifData.focalLength,
                    lensModel: exif.LensModel || exifData.lensModel
                };
            }
        } catch (err) {
            console.error("Failed to parse EXIF from gallery photo:", err);
        }

        // Pre-fill poster data with real metadata if available
        const data: PosterData = {
            photoUrl: photo.fileUrl,
            title: photo.title || photo.fileName.split('.')[0],
            date: photo.metadata.dateTime
                ? new Date(photo.metadata.dateTime).toLocaleDateString()
                : new Date(photo.createdAt).toLocaleDateString(),
            camera: photo.metadata.camera?.make && photo.metadata.camera?.model
                ? `${photo.metadata.camera.make} ${photo.metadata.camera.model}`
                : "SONY ILCE-7RM3",
            location: photo.metadata.location ? "Location Found" : undefined,
            exif: exifData
        };
        setPosterData(data);

        setShowPhotoPicker(false);
        setStep("edit");
    };

    // Handle save from editor
    const handleEditorSave = async (blob: Blob) => {
        setEditedBlob(blob);
        const url = URL.createObjectURL(blob);

        // Default values
        let exifData = {
            iso: "ISO 100",
            aperture: "f/2.8",
            shutterSpeed: "1/125s",
            focalLength: "35mm",
            lensModel: "FE 35mm F1.4 GM"
        };
        let cameraModel = "SONY ILCE-7RM3";
        let dateStr = new Date().toLocaleDateString();

        // Try to parse real EXIF from the original file if available
        try {
            const source = selectedFile || (imageUrl && !imageUrl.startsWith('blob:') ? imageUrl : null);

            if (source) {
                const exif = await exifr.parse(source);
                if (exif) {
                    exifData = {
                        iso: exif.ISO ? `ISO ${exif.ISO}` : exifData.iso,
                        aperture: exif.FNumber ? `f/${exif.FNumber}` : exifData.aperture,
                        shutterSpeed: exif.ExposureTime ? (exif.ExposureTime >= 1 ? `${exif.ExposureTime}s` : `1/${Math.round(1 / exif.ExposureTime)}s`) : exifData.shutterSpeed,
                        focalLength: exif.FocalLength ? `${exif.FocalLength}mm` : exifData.focalLength,
                        lensModel: exif.LensModel || exifData.lensModel
                    };

                    if (exif.Make && exif.Model) {
                        cameraModel = `${exif.Make} ${exif.Model}`;
                    }

                    if (exif.DateTimeOriginal) {
                        dateStr = new Date(exif.DateTimeOriginal).toLocaleDateString();
                    }
                }
            }
        } catch (err) {
            console.error("Failed to parse EXIF from source:", err);
        }

        const data: PosterData = {
            photoUrl: url,
            title: selectedFile?.name.split('.')[0] || "Untitled",
            date: dateStr,
            camera: cameraModel,
            exif: exifData,
            width: 1080, // Default
            height: 1080 // Default
        };

        setPosterData(data);
        setAspectRatio("1:1"); // Reset to default
        setStep("poster");
    };

    // Update dimensions when aspect ratio or template changes
    useEffect(() => {
        if (!posterData || !originalDimensions) return;

        let width = 1080;
        let height = 1080;

        if (selectedTemplate === 'modern') {
            width = 1080;
            height = 1920;
        } else if (selectedTemplate !== 'photography') {
            // Minimal, Gallery, etc. are square
            width = 1080;
            height = 1080;
        } else {
            // Photography template uses dynamic aspect ratio
            switch (aspectRatio) {
                case "1:1":
                    width = 1080;
                    height = 1080;
                    break;
                case "3:4":
                    width = 1080;
                    height = 1440;
                    break;
                case "4:3":
                    width = 1440;
                    height = 1080;
                    break;
                case "16:9":
                    width = 1920;
                    height = 1080;
                    break;
                case "original":
                    if (originalDimensions.width > originalDimensions.height) {
                        // Landscape-ish
                        width = 1080;
                        height = Math.round(1080 * (originalDimensions.height / originalDimensions.width));
                    } else {
                        // Portrait-ish
                        width = 1080;
                        height = Math.round(1080 * (originalDimensions.height / originalDimensions.width));
                    }
                    break;
            }
        }

        setPosterData(prev => prev ? ({ ...prev, width, height }) : null);
    }, [aspectRatio, originalDimensions, selectedTemplate]);

    // Handle poster download
    const handleDownload = async () => {
        if (!posterData) return;
        try {
            await downloadSingle(selectedTemplate, posterData);
        } catch (error) {
            console.error("Download failed:", error);
            alert("Failed to download poster");
        }
    };

    return (
        <AppLayout>
            <div className="min-h-screen bg-background">
                {/* Header */}
                <div className="sticky top-0 z-20 border-b border-border/40 bg-background/80 backdrop-blur-xl">
                    <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            {step !== "select" && (
                                <button
                                    onClick={() => setStep(step === "poster" ? "edit" : "select")}
                                    className="p-2 hover:bg-accent rounded-full transition-colors"
                                >
                                    <ArrowLeft className="w-5 h-5" />
                                </button>
                            )}
                            <h1 className="text-xl font-bold tracking-tight">
                                {step === "select" && "Studio"}
                                {step === "edit" && "Editor"}
                                {step === "poster" && "Poster Generator"}
                            </h1>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="max-w-7xl mx-auto px-6 py-8">
                    {step === "select" && (
                        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8">
                            <div className="text-center space-y-2">
                                <h2 className="text-3xl font-bold">Create Something Beautiful</h2>
                                <p className="text-muted-foreground">Upload a photo to start editing and generating posters</p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl">
                                {/* Upload Card */}
                                <label className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-border rounded-2xl hover:border-primary/50 hover:bg-accent/50 transition-all cursor-pointer group">
                                    <input
                                        type="file"
                                        className="hidden"
                                        accept="image/*"
                                        onChange={handleFileSelect}
                                    />
                                    <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                        <Upload className="w-8 h-8" />
                                    </div>
                                    <h3 className="text-lg font-semibold mb-1">Upload Photo</h3>
                                    <p className="text-sm text-muted-foreground">Drag & drop or click to browse</p>
                                </label>

                                {/* Gallery Card */}
                                <button
                                    onClick={() => setShowPhotoPicker(true)}
                                    className="flex flex-col items-center justify-center p-12 border-2 border-border rounded-2xl hover:border-primary/50 hover:bg-accent/50 transition-all group"
                                >
                                    <div className="w-16 h-16 bg-purple-500/10 text-purple-500 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                        <ImageIcon className="w-8 h-8" />
                                    </div>
                                    <h3 className="text-lg font-semibold mb-1">Select from Gallery</h3>
                                    <p className="text-sm text-muted-foreground">Choose from your existing photos</p>
                                </button>
                            </div>
                        </div>
                    )}

                    {step === "edit" && imageUrl && (
                        <div className="fixed inset-0 z-50 bg-black">
                            <ProfessionalPhotoEditor
                                photoId="temp-studio-photo"
                                imageUrl={imageUrl}
                                onSave={handleEditorSave}
                                onCancel={() => setStep("select")}
                            />
                        </div>
                    )}

                    {step === "poster" && posterData && (
                        <div className="space-y-8">
                            {/* Poster Preview */}
                            <div className="flex flex-col items-center gap-8 min-h-[600px] py-8 bg-secondary/20 rounded-3xl">
                                {/* Template Selector */}
                                <div className="flex items-center gap-4 p-2 bg-background/50 backdrop-blur-sm rounded-full border border-border/50 overflow-x-auto max-w-full">
                                    {[
                                        { id: 'photography', name: 'Photography', icon: '📷' },
                                        { id: 'minimal', name: 'Minimal', icon: '✨' },
                                        { id: 'modern', name: 'Modern', icon: '📱' },
                                        { id: 'gallery', name: 'Gallery', icon: '🎨' },
                                    ].map((t) => (
                                        <button
                                            key={t.id}
                                            onClick={() => setSelectedTemplate(t.id as TemplateId)}
                                            className={`px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap ${selectedTemplate === t.id
                                                ? "bg-primary text-primary-foreground shadow-md"
                                                : "hover:bg-accent text-muted-foreground hover:text-foreground"
                                                }`}
                                        >
                                            <span className="mr-2">{t.icon}</span>
                                            {t.name}
                                        </button>
                                    ))}
                                </div>

                                {/* Aspect Ratio Selector (Only for Photography) */}
                                {selectedTemplate === 'photography' && (
                                    <div className="flex items-center gap-2 p-1.5 bg-background/50 backdrop-blur-sm rounded-full border border-border/50">
                                        {[
                                            { id: '1:1', label: '1:1' },
                                            { id: '3:4', label: '3:4' },
                                            { id: '4:3', label: '4:3' },
                                            { id: '16:9', label: '16:9' },
                                            { id: 'original', label: 'Original' },
                                        ].map((ratio) => (
                                            <button
                                                key={ratio.id}
                                                onClick={() => setAspectRatio(ratio.id)}
                                                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${aspectRatio === ratio.id
                                                    ? "bg-zinc-800 text-white shadow-sm"
                                                    : "hover:bg-accent text-muted-foreground hover:text-foreground"
                                                    }`}
                                            >
                                                {ratio.label}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {/* Preview Area */}
                                <div className="flex items-center justify-center min-h-[600px] w-full">
                                    <div
                                        className="relative shadow-2xl rounded-sm overflow-hidden transition-all duration-500 ease-in-out bg-white"
                                        style={{
                                            width: posterData?.width ? `${posterData.width * (Math.min(600 / (posterData.width || 1080), 800 / (posterData.height || 1080)))}px` : '540px',
                                            height: posterData?.height ? `${posterData.height * (Math.min(600 / (posterData.width || 1080), 800 / (posterData.height || 1080)))}px` : '540px',
                                        }}
                                    >
                                        <div style={{
                                            transform: `scale(${Math.min(600 / (posterData?.width || 1080), 800 / (posterData?.height || 1080))})`,
                                            transformOrigin: 'top left',
                                            width: posterData?.width ? `${posterData.width}px` : '1080px',
                                            height: posterData?.height ? `${posterData.height}px` : '1080px'
                                        }}>
                                            {selectedTemplate === 'photography' && <PhotographyTemplate data={posterData} id="preview-template" />}
                                            {selectedTemplate === 'minimal' && <MinimalTemplate data={posterData} id="preview-template" />}
                                            {selectedTemplate === 'modern' && <ModernTemplate data={posterData} id="preview-template" />}
                                            {selectedTemplate === 'gallery' && <GalleryTemplate data={posterData} id="preview-template" />}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex justify-center gap-4">
                                <button
                                    onClick={handleDownload}
                                    className="flex items-center gap-2 px-8 py-3 bg-primary text-primary-foreground rounded-full font-medium hover:bg-primary/90 transition-all shadow-lg hover:shadow-primary/25 hover:scale-105 active:scale-95"
                                >
                                    <Download className="w-5 h-5" />
                                    <span>Download Poster</span>
                                </button>
                            </div>

                            {/* Hidden Generator */}
                            <PosterGenerator
                                data={posterData}
                                onGenerating={setGeneratingTemplate}
                                onComplete={() => setGeneratingTemplate(null)}
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* Photo Picker Modal */}
            <PhotoPickerModal
                isOpen={showPhotoPicker}
                onClose={() => setShowPhotoPicker(false)}
                onSelect={handlePhotoSelect}
            />
        </AppLayout>
    );
}
