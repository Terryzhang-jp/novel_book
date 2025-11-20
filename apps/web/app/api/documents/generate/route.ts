import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { documentStorage } from "@/lib/storage/document-storage";
import { photoStorage } from "@/lib/storage/photo-storage";
import { StorageError } from "@/lib/storage/errors";

/**
 * Helper to format date
 */
function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
    });
}

/**
 * Helper to format time
 */
function formatTime(dateString: string) {
    return new Date(dateString).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
    });
}

/**
 * POST /api/documents/generate
 * Generate a document from selected photos (Sculpting Paradigm)
 */
export async function POST(request: Request) {
    try {
        const session = await requireAuth(request);
        const { photoIds } = await request.json();

        if (!photoIds || !Array.isArray(photoIds) || photoIds.length === 0) {
            return NextResponse.json(
                { error: "No photos selected" },
                { status: 400 }
            );
        }

        // 1. Fetch all photos
        // Note: In a real app, we might want a bulk fetch method.
        // For now, we'll fetch individually or assume we can get them.
        // Ideally photoStorage should have findByIds.
        // Let's fetch all user photos and filter (inefficient but works for MVP)
        // Or better, let's just fetch the ones we need if possible.
        // Since we don't have bulk fetch, let's fetch all user photos and filter in memory
        // This is a temporary solution for the prototype.
        const allPhotos = await photoStorage.findByUserId(session.userId);
        const selectedPhotos = allPhotos.filter((p) => photoIds.includes(p.id));

        if (selectedPhotos.length === 0) {
            return NextResponse.json(
                { error: "Photos not found" },
                { status: 404 }
            );
        }

        // 2. Sort by time
        selectedPhotos.sort((a, b) => {
            const timeA = new Date(a.metadata?.dateTime || 0).getTime();
            const timeB = new Date(b.metadata?.dateTime || 0).getTime();
            return timeA - timeB;
        });

        // 3. Auto-Chaptering (Simple Clustering)
        // Group by location or time gap (> 2 hours)
        const chapters: { title: string; photos: typeof selectedPhotos }[] = [];
        let currentChapter: typeof selectedPhotos = [];
        let lastPhoto = selectedPhotos[0];

        selectedPhotos.forEach((photo, index) => {
            const timeDiff =
                new Date(photo.metadata?.dateTime || 0).getTime() -
                new Date(lastPhoto.metadata?.dateTime || 0).getTime();
            const hoursDiff = timeDiff / (1000 * 60 * 60);

            // Start new chapter if time gap is large or it's the first photo
            if (index === 0 || hoursDiff > 2) {
                if (currentChapter.length > 0) {
                    chapters.push({
                        title: `${formatTime(lastPhoto.metadata?.dateTime || "")} at ${lastPhoto.metadata?.location ? "Location" : "Unknown Place"
                            }`,
                        photos: currentChapter,
                    });
                }
                currentChapter = [photo];
            } else {
                currentChapter.push(photo);
            }
            lastPhoto = photo;
        });

        // Push last chapter
        if (currentChapter.length > 0) {
            chapters.push({
                title: `${formatTime(lastPhoto.metadata?.dateTime || "")} - ${lastPhoto.metadata?.location ? "Location" : "Unknown Place"
                    }`,
                photos: currentChapter,
            });
        }

        // 4. Build Tiptap Content
        const content = {
            type: "doc",
            content: [
                // Title
                {
                    type: "heading",
                    attrs: { level: 1 },
                    content: [{ type: "text", text: `Trip Story: ${formatDate(selectedPhotos[0].metadata?.dateTime || new Date().toISOString())}` }],
                },
                // Introduction Placeholder
                {
                    type: "paragraph",
                    content: [{ type: "text", text: "A journey of a thousand miles begins with a single step..." }],
                },
                // Chapters
                ...chapters.flatMap((chapter) => [
                    {
                        type: "heading",
                        attrs: { level: 2 },
                        content: [{ type: "text", text: chapter.title }],
                    },
                    // Photos in this chapter
                    ...chapter.photos.map((photo) => ({
                        type: "image",
                        attrs: {
                            src: photo.fileUrl,
                            alt: photo.fileName,
                            title: photo.fileName,
                        },
                    })),
                    // Placeholder for user thought
                    {
                        type: "paragraph",
                        content: [{ type: "text", text: "Write something about this moment..." }],
                    },
                ]),
            ],
        };

        // 5. Save Document
        const document = await documentStorage.create(
            session.userId,
            `Trip Story: ${formatDate(selectedPhotos[0].metadata?.dateTime || new Date().toISOString())}`,
            content
        );

        return NextResponse.json({ documentId: document.id }, { status: 201 });

    } catch (error) {
        console.error("Draft generation error:", error);
        if (error instanceof StorageError) {
            return NextResponse.json(
                { error: error.message },
                { status: error.statusCode }
            );
        }
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
